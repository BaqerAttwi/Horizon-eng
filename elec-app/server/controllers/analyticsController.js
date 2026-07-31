const pool = require('../db/connection');

// Only count projects fully approved by both admin and client in financial KPIs
const APPROVED_FILTER = ` AND p.admin_approval = 'approved' AND p.client_approval = 'approved'`;

// Revenue is recognized as money actually collected (project_payments), not
// the full contract value the moment a project is approved — a project may
// be paid across several installments over time. Cost is recognized
// proportionally to how much of the contract has been paid (e.g. 30% paid
// -> 30% of cost recognized), so profit margin stays consistent with the
// project's overall margin and reaches the full total_price - total_cost
// exactly once fully paid.
const PAYMENTS_JOIN = `
  LEFT JOIN (SELECT project_id, SUM(amount) as paid FROM project_payments GROUP BY project_id) pay
    ON pay.project_id = p.id`;
const RECOGNIZED_COST_EXPR = `(p.total_cost * LEAST(1, COALESCE(pay.paid,0) / NULLIF(COALESCE(NULLIF(p.total_with_vat,0), p.total_price), 0)))`;
const RECOGNIZED_REVENUE_EXPR = `COALESCE(pay.paid, 0)`;

// ── Helper: Build date filter clause ───────────────────────────
function dateFilter(field, dateFrom, dateTo) {
  let clause = '';
  if (dateFrom) clause += ` AND ${field} >= ?`;
  if (dateTo) clause += ` AND ${field} <= ?`;
  return clause;
}

function dateParams(dateFrom, dateTo) {
  const params = [];
  if (dateFrom) params.push(dateFrom);
  if (dateTo) params.push(dateTo);
  return params;
}

// ── Engineer Performance Stats ──────────────────────────────────
async function getEngineerStats(req, res, next) {
  try {
    const { date_from, date_to } = req.query;
    const df = dateFilter('p.created_at', date_from, date_to);
    const dp = dateParams(date_from, date_to);

    const [engineers] = await pool.query(`
      SELECT
        w.id, w.name, w.email,
        COUNT(DISTINCT p.id) AS total_projects,
        COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN p.id END) AS completed_projects,
        COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) AS active_projects,
        COUNT(DISTINCT CASE WHEN p.status = 'draft' THEN p.id END) AS draft_projects,
        COALESCE(SUM(${RECOGNIZED_REVENUE_EXPR}), 0) AS total_revenue,
        COALESCE(SUM(${RECOGNIZED_COST_EXPR}), 0) AS total_cost,
        COALESCE(SUM(${RECOGNIZED_REVENUE_EXPR} - ${RECOGNIZED_COST_EXPR}), 0) AS total_profit,
        COALESCE(AVG(${RECOGNIZED_REVENUE_EXPR} - ${RECOGNIZED_COST_EXPR}), 0) AS avg_profit_per_project,
        MAX(p.deadline) AS latest_deadline
      FROM workers w
      LEFT JOIN projects p ON p.engineer_id = w.id AND p.deleted_at IS NULL ${df}${APPROVED_FILTER}
      ${PAYMENTS_JOIN}
      WHERE w.role = 'engineer'
      GROUP BY w.id, w.name, w.email
      ORDER BY total_profit DESC
    `, dp);

    const [collabs] = await pool.query(`
      SELECT p.id AS project_id, p.project_name, p.engineer_id AS lead_engineer_id,
             ew.id AS collab_engineer_id, ew.name AS collab_engineer_name, p.status
      FROM projects p
      JOIN project_engineer_requests per ON per.project_id = p.id AND per.status = 'accepted'
      JOIN workers ew ON ew.id = per.target_engineer_id
      WHERE p.deleted_at IS NULL ${df}${APPROVED_FILTER}
    `, dp);

    const enriched = engineers.map(e => {
      const collabProjects = collabs.filter(c => c.collab_engineer_id === e.id);
      return {
        ...e,
        total_projects: e.total_projects + collabProjects.length,
        completed_projects: e.completed_projects + collabProjects.filter(c => c.status === 'completed').length,
        collaborated_on: collabProjects.length,
        collaboration_projects: collabProjects.map(c => ({ id: c.project_id, name: c.project_name }))
      };
    });

    res.json({ engineers: enriched });
  } catch (err) {
    next(err);
  }
}

// ─ Client Profitability Stats ──────────────────────────────────
async function getClientStats(req, res, next) {
  try {
    const { date_from, date_to } = req.query;
    const df = dateFilter('p.created_at', date_from, date_to);
    const dp = dateParams(date_from, date_to);

    const [clients] = await pool.query(`
      SELECT
        c.id, c.name, c.type,
        COUNT(DISTINCT p.id) AS total_projects,
        COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN p.id END) AS completed_projects,
        COALESCE(SUM(${RECOGNIZED_REVENUE_EXPR}), 0) AS total_revenue,
        COALESCE(SUM(${RECOGNIZED_COST_EXPR}), 0) AS total_cost,
        COALESCE(SUM(${RECOGNIZED_REVENUE_EXPR} - ${RECOGNIZED_COST_EXPR}), 0) AS total_profit,
        COALESCE(AVG(${RECOGNIZED_REVENUE_EXPR} - ${RECOGNIZED_COST_EXPR}), 0) AS avg_profit_per_project,
        MAX(p.deadline) AS latest_deadline,
        GROUP_CONCAT(DISTINCT w.name SEPARATOR ', ') AS engineers_involved
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id AND p.deleted_at IS NULL ${df}${APPROVED_FILTER}
      LEFT JOIN workers w ON w.id = p.engineer_id
      ${PAYMENTS_JOIN}
      GROUP BY c.id, c.name, c.type
      HAVING total_projects > 0
      ORDER BY total_profit DESC
    `, dp);

    res.json({ clients });
  } catch (err) {
    next(err);
  }
}

// ── Overall Summary ────────────────────────────────────────────
async function getSummary(req, res, next) {
  try {
    const { date_from, date_to } = req.query;
    const df = dateFilter('p.created_at', date_from, date_to);
    const dp = dateParams(date_from, date_to);

    const [[totals]] = await pool.query(`
      SELECT
        COUNT(DISTINCT p.id) AS total_projects,
        COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN p.id END) AS completed_projects,
        COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) AS active_projects,
        COUNT(DISTINCT CASE WHEN p.status = 'draft' THEN p.id END) AS draft_projects,
        COALESCE(SUM(${RECOGNIZED_REVENUE_EXPR}), 0) AS total_revenue,
        COALESCE(SUM(${RECOGNIZED_COST_EXPR}), 0) AS total_cost,
        COALESCE(SUM(${RECOGNIZED_REVENUE_EXPR} - ${RECOGNIZED_COST_EXPR}), 0) AS total_profit,
        COALESCE(SUM(GREATEST(0, COALESCE(NULLIF(p.total_with_vat,0), p.total_price) - COALESCE(pay.paid,0))), 0) AS total_outstanding,
        COUNT(DISTINCT p.client_id) AS total_clients,
        COUNT(DISTINCT p.engineer_id) AS total_engineers
      FROM projects p
      ${PAYMENTS_JOIN}
      WHERE p.deleted_at IS NULL ${df}${APPROVED_FILTER}
    `, dp);

    const [[topEngineer]] = await pool.query(`
      SELECT w.name, SUM(${RECOGNIZED_REVENUE_EXPR} - ${RECOGNIZED_COST_EXPR}) AS profit
      FROM projects p JOIN workers w ON w.id = p.engineer_id
      ${PAYMENTS_JOIN}
      WHERE p.deleted_at IS NULL ${df}${APPROVED_FILTER}
      GROUP BY w.id, w.name ORDER BY profit DESC LIMIT 1
    `, dp);

    const [[topClient]] = await pool.query(`
      SELECT c.name, SUM(${RECOGNIZED_REVENUE_EXPR} - ${RECOGNIZED_COST_EXPR}) AS profit
      FROM projects p JOIN clients c ON c.id = p.client_id
      ${PAYMENTS_JOIN}
      WHERE p.deleted_at IS NULL ${df}${APPROVED_FILTER}
      GROUP BY c.id, c.name ORDER BY profit DESC LIMIT 1
    `, dp);

    // Monthly revenue — grouped by when payments actually landed, not when
    // the project was created, since that's when the money was really made.
    const pdf = dateFilter('pp.payment_date', date_from, date_to);
    const [monthlyRevenue] = await pool.query(`
      SELECT
        DATE_FORMAT(pp.payment_date, '%Y-%m') AS month,
        COUNT(DISTINCT p.id) AS project_count,
        COALESCE(SUM(pp.amount), 0) AS revenue,
        COALESCE(SUM(pp.amount * (1 - (p.total_cost / NULLIF(COALESCE(NULLIF(p.total_with_vat,0), p.total_price), 0)))), 0) AS profit
      FROM project_payments pp
      JOIN projects p ON p.id = pp.project_id AND p.deleted_at IS NULL ${APPROVED_FILTER}
      WHERE 1=1 ${pdf}
      GROUP BY DATE_FORMAT(pp.payment_date, '%Y-%m')
      ORDER BY month ASC
    `, dateParams(date_from, date_to));

    // Which projects contributed to each month's payments.
    const [monthlyByProject] = await pool.query(`
      SELECT
        DATE_FORMAT(pp.payment_date, '%Y-%m') AS month,
        p.id AS project_id, p.project_name, c.name AS client_name,
        SUM(pp.amount) AS amount
      FROM project_payments pp
      JOIN projects p ON p.id = pp.project_id AND p.deleted_at IS NULL ${APPROVED_FILTER}
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE 1=1 ${pdf}
      GROUP BY month, p.id, p.project_name, c.name
      ORDER BY month DESC, amount DESC
    `, dateParams(date_from, date_to));

    // Engineer comparison data for chart
    const [engineerComparison] = await pool.query(`
      SELECT w.name,
             COUNT(DISTINCT p.id) AS projects,
             COALESCE(SUM(${RECOGNIZED_REVENUE_EXPR} - ${RECOGNIZED_COST_EXPR}), 0) AS profit
      FROM workers w
      LEFT JOIN projects p ON p.engineer_id = w.id AND p.deleted_at IS NULL ${df}${APPROVED_FILTER}
      ${PAYMENTS_JOIN}
      WHERE w.role = 'engineer'
      GROUP BY w.id, w.name
      ORDER BY profit DESC
    `, dp);

    // Outstanding balances — approved projects not yet fully paid.
    const [outstandingRaw] = await pool.query(`
      SELECT * FROM (
        SELECT p.id, p.project_name, c.name as client_name, p.deadline, p.status,
          COALESCE(NULLIF(p.total_with_vat,0), p.total_price) as total_due,
          COALESCE(pay.paid, 0) as total_paid,
          GREATEST(0, COALESCE(NULLIF(p.total_with_vat,0), p.total_price) - COALESCE(pay.paid,0)) as outstanding
        FROM projects p
        LEFT JOIN clients c ON c.id = p.client_id
        ${PAYMENTS_JOIN}
        WHERE p.deleted_at IS NULL ${APPROVED_FILTER}
      ) t
      WHERE t.outstanding > 0.01
      ORDER BY t.outstanding DESC
    `);

    res.json({
      totals,
      top_engineer: topEngineer || null,
      top_client: topClient || null,
      monthly_revenue: monthlyRevenue,
      monthly_by_project: monthlyByProject,
      engineer_comparison: engineerComparison,
      outstanding: outstandingRaw,
    });
  } catch (err) {
    next(err);
  }
}

// ── Project Team Members ────────────────────────────────────────
async function getProjectTeam(req, res, next) {
  try {
    const { projectId } = req.params;
    const [[project]] = await pool.query(`
      SELECT p.id, p.project_name, w.id AS lead_engineer_id, w.name AS lead_engineer_name
      FROM projects p JOIN workers w ON w.id = p.engineer_id
      WHERE p.id = ? AND p.deleted_at IS NULL
    `, [projectId]);

    if (!project) return res.status(404).json({ error: 'Project not found' });

    const [collabs] = await pool.query(`
      SELECT w.id, w.name, w.email, per.status, per.rejection_reason
      FROM project_engineer_requests per
      JOIN workers w ON w.id = per.target_engineer_id
      WHERE per.project_id = ?
    `, [projectId]);

    res.json({
      project: { id: project.id, name: project.project_name,
        lead_engineer: { id: project.lead_engineer_id, name: project.lead_engineer_name } },
      collaborators: collabs
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getEngineerStats, getClientStats, getSummary, getProjectTeam };
