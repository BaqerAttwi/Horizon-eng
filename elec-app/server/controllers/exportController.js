const db = require('../db/connection');

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
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
       WHERE p.deleted_at IS NULL
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

module.exports = { exportProducts, exportProjects, exportAnalytics };
