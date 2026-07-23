const db = require('../db/connection');

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || /^[=+\-@]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows, columns) {
  const header = columns.map(c => escapeCsv(c.label)).join(',');
  const body = rows.map(row =>
    columns.map(c => escapeCsv(row[c.key])).join(',')
  ).join('\n');
  return header + '\n' + body;
}

async function exportProducts(req, res, next) {
  try {
    const [products] = await db.execute(
      `SELECT p.id, p.reference, p.description, p.price_usd, p.price_euro,
              p.stock_qty, p.reserved_qty, p.smart_code, b.name as brand_name,
              p.created_at
       FROM products p
        LEFT JOIN brands b ON b.id = p.brand_id
        ORDER BY p.reference`
    );

    const columns = [
      { key: 'id', label: 'ID' },
      { key: 'reference', label: 'Reference' },
      { key: 'description', label: 'Description' },
      { key: 'price_usd', label: 'Price USD' },
      { key: 'price_euro', label: 'Price EUR' },
      { key: 'stock_qty', label: 'Stock Qty' },
      { key: 'reserved_qty', label: 'Reserved Qty' },
      { key: 'smart_code', label: 'Smart Code' },
      { key: 'brand_name', label: 'Brand' },
      { key: 'created_at', label: 'Created At' },
    ];

    const csv = toCsv(products, columns);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="products_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

async function exportProjects(req, res, next) {
  try {
    const [projects] = await db.execute(
      `SELECT p.id, p.project_name, p.status, p.total_price, p.total_cost,
              p.admin_approval, p.client_approval,
              p.deadline, p.created_at,
              w.name as engineer_name, c.name as client_name
       FROM projects p
        LEFT JOIN workers w ON w.id = p.engineer_id
        LEFT JOIN clients c ON c.id = p.client_id
        WHERE p.deleted_at IS NULL
        ORDER BY p.created_at DESC`
    );

    const columns = [
      { key: 'id', label: 'ID' },
      { key: 'project_name', label: 'Project Name' },
      { key: 'status', label: 'Status' },
      { key: 'total_price', label: 'Total Price' },
      { key: 'total_cost', label: 'Total Cost' },
      { key: 'admin_approval', label: 'Admin Approval' },
      { key: 'client_approval', label: 'Client Approval' },
      { key: 'deadline', label: 'Deadline' },
      { key: 'engineer_name', label: 'Engineer' },
      { key: 'client_name', label: 'Client' },
      { key: 'created_at', label: 'Created At' },
    ];

    const csv = toCsv(projects, columns);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="projects_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

async function exportAnalytics(req, res, next) {
  try {
    const [engineers] = await db.execute(
      `SELECT w.name as engineer_name,
              COUNT(DISTINCT p.id) as total_projects,
              COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN p.id END) as completed_projects,
              COALESCE(SUM(p.total_price), 0) as total_revenue,
              COALESCE(SUM(p.total_cost), 0) as total_cost,
              COALESCE(SUM(p.total_price - p.total_cost), 0) as total_profit
       FROM workers w
       LEFT JOIN projects p ON p.engineer_id = w.id AND p.deleted_at IS NULL
        AND p.admin_approval = 'approved' AND p.client_approval = 'approved'
       WHERE w.role = 'engineer'
       GROUP BY w.id, w.name
       ORDER BY total_profit DESC`
    );

    const columns = [
      { key: 'engineer_name', label: 'Engineer' },
      { key: 'total_projects', label: 'Total Projects' },
      { key: 'completed_projects', label: 'Completed' },
      { key: 'total_revenue', label: 'Total Revenue' },
      { key: 'total_cost', label: 'Total Cost' },
      { key: 'total_profit', label: 'Total Profit' },
    ];

    const csv = toCsv(engineers, columns);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="analytics_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

// ── Reservations / Demand Tracker ──────────────────────────────
function engineerProjectFilter(userId) {
  return {
    clause: `AND (p.engineer_id = ? OR p.id IN (
      SELECT per.project_id FROM project_engineer_requests per
      WHERE per.target_engineer_id = ? AND per.status = 'accepted'
    ))`,
    params: [userId, userId]
  };
}

async function exportReservations(req, res, next) {
  try {
    const user = req.worker;
    const engFilter = user.role === 'engineer' ? engineerProjectFilter(user.id) : null;

    const [rows] = await db.execute(`
      SELECT
        pr.reference,
        pr.description,
        pr.smart_code,
        b.name           AS brand_name,
        pr.stock_qty,
        pr.reserved_qty,
        (pr.stock_qty - pr.reserved_qty) AS available_qty,
        pci.qty          AS demanded_qty,
        p.id             AS project_id,
        p.project_name,
        p.status         AS project_status,
        p.admin_approval,
        p.client_approval,
        p.deadline,
        w.name           AS engineer_name,
        c.name           AS client_name
      FROM panel_crm_items pci
      JOIN panel_divisions pd ON pci.division_id = pd.id
      JOIN project_crm_panels pcp ON pd.panel_id = pcp.id
      JOIN projects p ON pcp.project_id = p.id
      LEFT JOIN products pr ON pci.product_id = pr.id
      LEFT JOIN brands b ON pr.brand_id = b.id
      LEFT JOIN workers w ON p.engineer_id = w.id
      LEFT JOIN clients c ON p.client_id = c.id
      WHERE p.status NOT IN ('completed','cancelled')
        AND pci.product_id IS NOT NULL
        ${engFilter ? engFilter.clause : ''}
      ORDER BY pr.reference, p.id
    `, engFilter ? engFilter.params : []);

    const columns = [
      { key: 'reference',      label: 'Reference' },
      { key: 'description',    label: 'Description' },
      { key: 'smart_code',     label: 'Smart Code' },
      { key: 'brand_name',     label: 'Brand' },
      { key: 'stock_qty',      label: 'Stock Qty' },
      { key: 'reserved_qty',   label: 'Reserved Qty' },
      { key: 'available_qty',  label: 'Available Qty' },
      { key: 'demanded_qty',   label: 'Demanded Qty' },
      { key: 'project_id',     label: 'Project ID' },
      { key: 'project_name',   label: 'Project Name' },
      { key: 'project_status', label: 'Project Status' },
      { key: 'admin_approval', label: 'Admin Approval' },
      { key: 'client_approval',label: 'Client Approval' },
      { key: 'deadline',       label: 'Deadline' },
      { key: 'engineer_name',  label: 'Engineer' },
      { key: 'client_name',    label: 'Client' },
    ];

    const csv = toCsv(rows, columns);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="demand_tracker_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

// ── CRM Export (panels + divisions + items per project) ─────
async function exportCrm(req, res, next) {
  try {
    const { projectId } = req.params;
    const { checkProjectAccess } = require('./crmController');
    const hasAccess = await checkProjectAccess(req, res, projectId);
    if (!hasAccess) return;

    const [rows] = await db.execute(`
      SELECT
        pcp.panel_number,
        pd.division_type,
        COALESCE(i.custom_name, pr.reference) AS reference,
        COALESCE(i.custom_desc, pr.description) AS description,
        i.qty
      FROM panel_crm_items i
      JOIN panel_divisions pd ON i.division_id = pd.id
      JOIN project_crm_panels pcp ON pd.panel_id = pcp.id
      LEFT JOIN products pr ON i.product_id = pr.id
      WHERE pcp.project_id = ?
      ORDER BY pcp.panel_number, pd.id, i.id
    `, [projectId]);

    // Build summary: group by reference, sum qty
    const summaryMap = {};
    for (const row of rows) {
      const ref = row.reference || 'Unknown';
      if (!summaryMap[ref]) summaryMap[ref] = { reference: ref, total_qty: 0 };
      summaryMap[ref].total_qty += row.qty ?? 1;
    }
    const summary = Object.values(summaryMap).sort((a, b) => b.total_qty - a.total_qty);

    // Section 1: Items by Panel
    const flatCols = [
      { key: 'panel_number',  label: 'Panel #' },
      { key: 'division_type', label: 'Division' },
      { key: 'reference',     label: 'Reference' },
      { key: 'description',   label: 'Description' },
      { key: 'qty',           label: 'Qty' },
    ];
    let csv = toCsv(rows, flatCols);

    // Blank row separator
    csv += '\n\n';

    // Section 2: Summary
    const summaryCols = [
      { key: 'reference', label: 'Reference' },
      { key: 'total_qty', label: 'Total Qty' },
    ];
    csv += toCsv(summary, summaryCols);

    res.setHeader('Content-Type', 'text/csv');
    const safeId = String(projectId).replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `crm_project_${safeId}_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

module.exports = { exportProducts, exportProjects, exportAnalytics, exportReservations, exportCrm };
