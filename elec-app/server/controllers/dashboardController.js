const pool = require('../db/connection');

// ── Dashboard Data ────────────────────────────────────────────
async function getDashboard(req, res, next) {
  try {
    const userId = req.worker.id;
    const userRole = req.worker.role;

    // Engineer access filter: pre-compute accessible project IDs (parameterized, no SQL injection)
    let engWhere = '';
    const engArgs = [];
    if (userRole === 'engineer') {
      const [rows] = await pool.query(
        `SELECT id FROM projects WHERE engineer_id = ? OR id IN (SELECT project_id FROM project_engineer_requests WHERE target_engineer_id = ? AND status = 'accepted')`,
        [userId, userId]
      );
      const ids = rows.map(r => r.id);
      if (ids.length === 0) {
        engWhere = 'AND 1=0';
      } else {
        engWhere = 'AND p.id IN (?)';
        engArgs.push(ids);
      }
    }

    // ── KPIs ───────────────────────────────────────────────
    const kpiSql = `
      SELECT
        COUNT(DISTINCT CASE WHEN p.deleted_at IS NULL ${engWhere} THEN p.id END) AS total_projects,
        COUNT(DISTINCT CASE WHEN p.status = 'active' AND p.deleted_at IS NULL ${engWhere} THEN p.id END) AS active_projects,
        COUNT(DISTINCT CASE WHEN p.status = 'completed' AND p.deleted_at IS NULL ${engWhere} THEN p.id END) AS completed_projects,
        COUNT(DISTINCT CASE WHEN p.deleted_at IS NULL ${engWhere} AND (p.admin_approval = 'pending' OR (p.admin_approval = 'approved' AND p.client_approval = 'pending')) THEN p.id END) AS pending_approvals,
        COALESCE(SUM(CASE WHEN p.deleted_at IS NULL AND p.admin_approval = 'approved' AND p.client_approval = 'approved' ${engWhere} THEN p.total_price ELSE 0 END), 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN p.deleted_at IS NULL AND p.admin_approval = 'approved' AND p.client_approval = 'approved' ${engWhere} THEN p.total_price - p.total_cost ELSE 0 END), 0) AS total_profit
      FROM projects p
    `;
    const kpiArgs = engArgs.length ? [].concat(...Array(6).fill(engArgs)) : [];
    const [[kpis]] = await pool.query(kpiSql, kpiArgs);

    // Upcoming deadlines (next 7 days) — filtered for engineers
    const [deadlines] = await pool.query(`
      SELECT p.id, p.project_name, p.deadline, p.status,
             w.name as engineer_name, c.name as client_name,
             DATEDIFF(p.deadline, CURDATE()) as days_left
      FROM projects p
      LEFT JOIN workers w ON w.id = p.engineer_id
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.deadline IS NOT NULL
        AND p.deadline >= CURDATE()
        AND p.deadline <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
        AND p.status NOT IN ('completed', 'cancelled')
        AND p.deleted_at IS NULL
        ${engWhere}
      ORDER BY p.deadline ASC
      LIMIT 10
    `, engArgs);

    // Recent activity — filtered for engineers
    const [activity] = await pool.query(`
      (SELECT
        'project_created' as action,
        p.id,
        p.project_name as title,
        p.created_at as ts,
        w.name as actor,
        CONCAT('/projects/', p.id) as link
      FROM projects p
      LEFT JOIN workers w ON w.id = p.engineer_id
      WHERE p.deleted_at IS NULL ${engWhere}
      ORDER BY p.created_at DESC
      LIMIT 10)
      UNION ALL
      (SELECT
        'panel_completed' as action,
        pcp.id,
        CONCAT('Panel completed: ', pcp.panel_name) as title,
        pcp.created_at as ts,
        w.name as actor,
        CONCAT('/projects/', pcp.project_id, '/crm') as link
      FROM project_crm_panels pcp
      JOIN projects p ON p.id = pcp.project_id
      LEFT JOIN workers w ON w.id = pcp.updated_by
      WHERE pcp.is_completed = TRUE
        AND p.deleted_at IS NULL
        ${engWhere}
      ORDER BY pcp.created_at DESC
      LIMIT 10)
      ORDER BY ts DESC
      LIMIT 20
    `, [...engArgs, ...engArgs]);

    // Low stock alerts (for owner/accounting)
    let lowStock = [];
    if (userRole === 'owner' || userRole === 'accounting') {
      const [stock] = await pool.query(`
        SELECT id, reference, description, stock_qty, reserved_qty,
               stock_qty - reserved_qty as available
        FROM products
        WHERE stock_qty <= reserved_qty
        ORDER BY stock_qty ASC
        LIMIT 10
      `);
      lowStock = stock;
    }

    // Engineer-specific: their projects summary (already filtered by engFilter above)
    let myProjects = [];
    if (userRole === 'engineer') {
      const [projects] = await pool.query(`
        SELECT p.id, p.project_name, p.status, p.deadline, p.total_price,
               c.name as client_name,
               COUNT(DISTINCT pcp.id) as panel_count,
               COUNT(DISTINCT CASE WHEN pcp.is_completed THEN pcp.id END) as completed_panels
        FROM projects p
        LEFT JOIN clients c ON c.id = p.client_id
        LEFT JOIN project_crm_panels pcp ON pcp.project_id = p.id
        WHERE p.deleted_at IS NULL
          AND (p.engineer_id = ? OR p.id IN (
            SELECT per.project_id FROM project_engineer_requests per
            WHERE per.target_engineer_id = ? AND per.status = 'accepted'
          ))
        GROUP BY p.id, p.project_name, p.status, p.deadline, p.total_price, c.name
        ORDER BY
          CASE p.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
          p.deadline ASC
        LIMIT 10
      `, [userId, userId]);
      myProjects = projects;
    }

    // Owner-specific: engineer performance snapshot
    let engineerSummary = [];
    if (userRole === 'owner') {
      const [engineers] = await pool.query(`
        SELECT w.id, w.name,
               COUNT(DISTINCT p.id) as project_count,
               COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN p.id END) as completed,
               COALESCE(SUM(p.total_price - p.total_cost), 0) as total_profit
        FROM workers w
        LEFT JOIN projects p ON p.engineer_id = w.id AND p.deleted_at IS NULL AND p.admin_approval = 'approved' AND p.client_approval = 'approved'
        WHERE w.role = 'engineer'
        GROUP BY w.id, w.name
        ORDER BY total_profit DESC
      `);
      engineerSummary = engineers;
    }

    res.json({
      kpis,
      deadlines,
      activity,
      low_stock: lowStock,
      my_projects: myProjects,
      engineer_summary: engineerSummary
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboard };
