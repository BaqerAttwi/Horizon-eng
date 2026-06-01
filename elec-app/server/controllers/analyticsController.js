const pool = require('../db/connection');

// Only count projects fully approved by both admin and client in financial KPIs
const APPROVED_FILTER = ` AND p.admin_approval = 'approved' AND p.client_approval = 'approved'`;

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
        COALESCE(SUM(p.total_price), 0) AS total_revenue,
        COALESCE(SUM(p.total_cost), 0) AS total_cost,
        COALESCE(SUM(p.total_price - p.total_cost), 0) AS total_profit,
        COALESCE(AVG(p.total_price - p.total_cost), 0) AS avg_profit_per_project,
        MAX(p.deadline) AS latest_deadline
      FROM workers w
      LEFT JOIN projects p ON p.engineer_id = w.id AND p.deleted_at IS NULL ${df}${APPROVED_FILTER}
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
        COALESCE(SUM(p.total_price), 0) AS total_revenue,
        COALESCE(SUM(p.total_cost), 0) AS total_cost,
        COALESCE(SUM(p.total_price - p.total_cost), 0) AS total_profit,
        COALESCE(AVG(p.total_price - p.total_cost), 0) AS avg_profit_per_project,
        MAX(p.deadline) AS latest_deadline,
        GROUP_CONCAT(DISTINCT w.name SEPARATOR ', ') AS engineers_involved
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id AND p.deleted_at IS NULL ${df}${APPROVED_FILTER}
      LEFT JOIN workers w ON w.id = p.engineer_id
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
        COALESCE(SUM(p.total_price), 0) AS total_revenue,
        COALESCE(SUM(p.total_cost), 0) AS total_cost,
        COALESCE(SUM(p.total_price - p.total_cost), 0) AS total_profit,
        COUNT(DISTINCT p.client_id) AS total_clients,
        COUNT(DISTINCT p.engineer_id) AS total_engineers
      FROM projects p
      WHERE p.deleted_at IS NULL ${df}${APPROVED_FILTER}
    `, dp);

    const [[topEngineer]] = await pool.query(`
      SELECT w.name, SUM(p.total_price - p.total_cost) AS profit
      FROM projects p JOIN workers w ON w.id = p.engineer_id
      WHERE p.deleted_at IS NULL ${df}${APPROVED_FILTER}
      GROUP BY w.id, w.name ORDER BY profit DESC LIMIT 1
    `, dp);

    const [[topClient]] = await pool.query(`
      SELECT c.name, SUM(p.total_price - p.total_cost) AS profit
      FROM projects p JOIN clients c ON c.id = p.client_id
      WHERE p.deleted_at IS NULL ${df}${APPROVED_FILTER}
      GROUP BY c.id, c.name ORDER BY profit DESC LIMIT 1
    `, dp);

    // Monthly revenue data for chart
    const [monthlyRevenue] = await pool.query(`
      SELECT
        DATE_FORMAT(p.created_at, '%Y-%m') AS month,
        COUNT(*) AS project_count,
        COALESCE(SUM(p.total_price), 0) AS revenue,
        COALESCE(SUM(p.total_price - p.total_cost), 0) AS profit
      FROM projects p
      WHERE p.deleted_at IS NULL ${df}${APPROVED_FILTER}
      GROUP BY DATE_FORMAT(p.created_at, '%Y-%m')
      ORDER BY month ASC
    `, dp);

    // Engineer comparison data for chart
    const [engineerComparison] = await pool.query(`
      SELECT w.name,
             COUNT(DISTINCT p.id) AS projects,
             COALESCE(SUM(p.total_price - p.total_cost), 0) AS profit
      FROM workers w
      LEFT JOIN projects p ON p.engineer_id = w.id AND p.deleted_at IS NULL ${df}${APPROVED_FILTER}
      WHERE w.role = 'engineer'
      GROUP BY w.id, w.name
      ORDER BY profit DESC
    `, dp);

    res.json({
      totals,
      top_engineer: topEngineer || null,
      top_client: topClient || null,
      monthly_revenue: monthlyRevenue,
      engineer_comparison: engineerComparison
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
