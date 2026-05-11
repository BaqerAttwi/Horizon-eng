const db = require('../db/connection');

async function recalcReservedQty() {
  await db.execute(`
    UPDATE products p
    SET reserved_qty = COALESCE((
      SELECT SUM(pi.qty)
      FROM project_items pi
      JOIN projects prj ON pi.project_id = prj.id
      WHERE pi.product_id = p.id
        AND prj.status NOT IN ('completed', 'cancelled')
        AND prj.deleted_at IS NULL
    ), 0)
  `);
}

async function getProjects(req, res, next) {
  try {
    const [projects] = await db.execute(
      `SELECT p.*, w.name as engineer_name, c.name as client_name,
              (SELECT COUNT(*) FROM project_items pi WHERE pi.project_id=p.id) as item_count,
              COALESCE(
                (SELECT COUNT(*) FROM project_crm_panels pcp WHERE pcp.project_id=p.id), 0
              ) as crm_panels,
              COALESCE(
                ROUND((p.completed_panels / NULLIF(p.total_panels, 0)) * 100, 1), 0
              ) as progress_pct
       FROM projects p
       LEFT JOIN workers w ON p.engineer_id=w.id
       LEFT JOIN clients c ON p.client_id=c.id
       WHERE p.deleted_at IS NULL
       ORDER BY
         CASE WHEN p.status='draft' THEN 0 ELSE 1 END,
         CASE WHEN p.status='draft' AND p.deadline IS NOT NULL THEN p.deadline ELSE '9999-12-31' END,
         p.created_at DESC`
    );
    console.log('[Projects] GET →', projects.length);
    res.json(projects);
  } catch (err) { console.error('[Projects] ❌ getAll:', err.message); next(err); }
}

async function getProject(req, res, next) {
  try {
    const [rows] = await db.execute(
      `SELECT p.*, w.name as engineer_name, c.name as client_name
       FROM projects p
       LEFT JOIN workers w ON p.engineer_id=w.id
       LEFT JOIN clients c ON p.client_id=c.id
       WHERE p.id=? AND p.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Project not found' });

    const [items] = await db.execute(
      `SELECT pi.*, pr.reference, pr.description, b.name as brand_name,
              (pr.stock_qty - pr.reserved_qty) as available_qty
       FROM project_items pi
       JOIN products pr ON pi.product_id=pr.id
       LEFT JOIN brands b ON pr.brand_id=b.id
       WHERE pi.project_id=?`,
      [req.params.id]
    );

    console.log(`[Projects] GET id:${req.params.id} items:${items.length}`);
    res.json({ ...rows[0], items });
  } catch (err) { console.error('[Projects] ❌ getOne:', err.message); next(err); }
}

async function createProject(req, res, next) {
  try {
    const { project_name, engineer_id, client_id, exchange_rate_eur_usd, deadline, notes, items = [], total_panels = 0 } = req.body;
    if (!project_name) return res.status(400).json({ error: 'project_name is required' });

    console.log('[Projects] Creating:', project_name, 'engineer:', engineer_id, 'items:', items.length);

    const [result] = await db.execute(
      `INSERT INTO projects(project_name,engineer_id,client_id,exchange_rate_eur_usd,deadline,notes,total_panels)
       VALUES(?,?,?,?,?,?,?)`,
      [project_name, engineer_id||null, client_id||null, exchange_rate_eur_usd||1.08, deadline||null, notes||null, total_panels||0]
    );
    const projectId = result.insertId;

    let totalCost = 0, totalPrice = 0;

    for (const item of items) {
      const [prod] = await db.execute('SELECT * FROM products WHERE id=?', [item.product_id]);
      if (!prod.length) {
        console.warn(`[Projects] Product id:${item.product_id} not found — skipping`);
        continue;
      }
      const p      = prod[0];
      const cost   = item.unit_cost  ?? p.price_cost  ?? null;
      const price  = item.unit_price ?? (item.currency === 'USD' ? p.price_usd : p.price_euro) ?? null;
      const curr   = item.currency   || (p.price_euro !== null ? 'EUR' : 'USD');

      await db.execute(
        `INSERT INTO project_items(project_id,product_id,qty,unit_cost,unit_price,price_currency,notes)
         VALUES(?,?,?,?,?,?,?)`,
        [projectId, item.product_id, item.qty||1, cost, price, curr, item.notes||null]
      );

      if (cost  !== null) totalCost  += (cost  * (item.qty||1));
      if (price !== null) totalPrice += (price * (item.qty||1));
    }

    await db.execute(
      'UPDATE projects SET total_cost=?, total_price=? WHERE id=?',
      [totalCost, totalPrice, projectId]
    );

    await recalcReservedQty();

    const [created] = await db.execute('SELECT * FROM projects WHERE id=?', [projectId]);
    console.log(`[Projects] ✅ Created id:${projectId} total_cost:${totalCost} total_price:${totalPrice}`);
    res.status(201).json(created[0]);
  } catch (err) { console.error('[Projects] ❌ create:', err.message); next(err); }
}

async function updateProject(req, res, next) {
  try {
    const { project_name, engineer_id, client_id, exchange_rate_eur_usd, deadline, notes, status, client_approval, client_rejection_note, admin_approval, rejection_note, total_panels, completed_panels } = req.body;
    const fields = [], params = [];
    if (project_name       !== undefined) { fields.push('project_name=?');    params.push(project_name); }
    if (engineer_id        !== undefined) { fields.push('engineer_id=?');     params.push(engineer_id||null); }
    if (client_id          !== undefined) { fields.push('client_id=?');       params.push(client_id||null); }
    if (exchange_rate_eur_usd !== undefined) { fields.push('exchange_rate_eur_usd=?'); params.push(exchange_rate_eur_usd||1.08); }
    if (deadline           !== undefined) { fields.push('deadline=?');        params.push(deadline||null); }
    if (notes              !== undefined) { fields.push('notes=?');           params.push(notes); }
    if (status             !== undefined) { fields.push('status=?');          params.push(status); }
    if (client_approval    !== undefined) { fields.push('client_approval=?'); params.push(client_approval); }
    if (client_rejection_note !== undefined) { fields.push('client_rejection_note=?'); params.push(client_rejection_note); }
    if (admin_approval     !== undefined) { fields.push('admin_approval=?');  params.push(admin_approval); }
    if (rejection_note     !== undefined) { fields.push('rejection_note=?');  params.push(rejection_note); }
    if (total_panels       !== undefined) { fields.push('total_panels=?');    params.push(total_panels||0); }
    if (completed_panels   !== undefined) { fields.push('completed_panels=?'); params.push(completed_panels||0); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await db.execute(`UPDATE projects SET ${fields.join(',')} WHERE id=?`, params);

    if (status !== undefined) {
      await recalcReservedQty();
    }

    console.log(`[Projects] Updated id:${req.params.id}`, req.body);
    const [rows] = await db.execute('SELECT * FROM projects WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { console.error('[Projects] ❌ update:', err.message); next(err); }
}

async function addProjectItem(req, res, next) {
  try {
    const { product_id, qty, unit_cost, unit_price, currency, notes } = req.body;
    if (!product_id) return res.status(400).json({ error: 'product_id required' });

    const [prod] = await db.execute('SELECT * FROM products WHERE id=?', [product_id]);
    if (!prod.length) return res.status(404).json({ error: 'Product not found' });
    const p = prod[0];

    const cost  = unit_cost  ?? p.price_cost ?? null;
    const price = unit_price ?? (currency === 'USD' ? p.price_usd : p.price_euro) ?? null;
    const curr  = currency   || (p.price_euro !== null ? 'EUR' : 'USD');

    const [result] = await db.execute(
      `INSERT INTO project_items(project_id,product_id,qty,unit_cost,unit_price,price_currency,notes)
       VALUES(?,?,?,?,?,?,?)`,
      [req.params.id, product_id, qty||1, cost, price, curr, notes||null]
    );

    const [totals] = await db.execute(
      `SELECT SUM(qty*unit_cost) as tc, SUM(qty*unit_price) as tp FROM project_items WHERE project_id=?`,
      [req.params.id]
    );
    await db.execute('UPDATE projects SET total_cost=?,total_price=? WHERE id=?',
      [totals[0].tc||0, totals[0].tp||0, req.params.id]);

    await recalcReservedQty();

    console.log(`[Projects] Item added to project:${req.params.id} product:${product_id} qty:${qty}`);
    const [item] = await db.execute(
      `SELECT pi.*, pr.reference, pr.description FROM project_items pi
       JOIN products pr ON pi.product_id=pr.id WHERE pi.id=?`,
      [result.insertId]
    );
    res.status(201).json(item[0]);
  } catch (err) { console.error('[Projects] ❌ addItem:', err.message); next(err); }
}

async function removeProjectItem(req, res, next) {
  try {
    await db.execute('DELETE FROM project_items WHERE id=? AND project_id=?', [req.params.itemId, req.params.id]);

    const [totals] = await db.execute(
      `SELECT SUM(qty*unit_cost) as tc, SUM(qty*unit_price) as tp FROM project_items WHERE project_id=?`,
      [req.params.id]
    );
    await db.execute('UPDATE projects SET total_cost=?,total_price=? WHERE id=?',
      [totals[0].tc||0, totals[0].tp||0, req.params.id]);

    await recalcReservedQty();

    console.log(`[Projects] Item:${req.params.itemId} removed from project:${req.params.id}`);
    res.json({ message: 'Removed' });
  } catch (err) { console.error('[Projects] ❌ removeItem:', err.message); next(err); }
}

async function deleteProject(req, res, next) {
  try {
    await db.execute('UPDATE projects SET deleted_at=NOW() WHERE id=?', [req.params.id]);
    await recalcReservedQty();
    console.log(`[Projects] Soft-deleted id:${req.params.id}`);
    res.json({ message: 'Project soft-deleted (will be removed after 3 months)' });
  } catch (err) { console.error('[Projects] ❌ delete:', err.message); next(err); }
}

async function adminApproval(req, res, next) {
  try {
    const { admin_approval, rejection_note } = req.body;
    if (!admin_approval || !['pending','approved','rejected'].includes(admin_approval)) {
      return res.status(400).json({ error: 'admin_approval must be pending, approved, or rejected' });
    }
    await db.execute('UPDATE projects SET admin_approval=?, rejection_note=? WHERE id=?',
      [admin_approval, rejection_note||null, req.params.id]);
    await recalcReservedQty();
    console.log(`[Projects] Admin approval id:${req.params.id} → ${admin_approval}`);
    const [rows] = await db.execute('SELECT * FROM projects WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { console.error('[Projects] ❌ adminApproval:', err.message); next(err); }
}

async function getDraftNotifications(req, res, next) {
  try {
    const workerId = req.worker.id;
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());

    const [drafts] = await db.execute(
      `SELECT p.id, p.project_name, p.deadline, p.total_price, p.admin_approval,
              p.total_panels, p.completed_panels,
              COALESCE(ROUND((p.completed_panels / NULLIF(p.total_panels, 0)) * 100, 1), 0) as progress_pct,
              CASE
                WHEN p.deadline IS NULL THEN 3
                WHEN p.deadline <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1
                WHEN p.deadline <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 2
                ELSE 3
              END as urgency,
              CASE
                WHEN p.deadline IS NULL THEN 'No deadline set'
                WHEN p.deadline <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 'Urgent — within 7 days'
                WHEN p.deadline <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'Soon — within 30 days'
                ELSE 'Not urgent'
              END as urgency_label
       FROM projects p
       WHERE p.engineer_id = ?
         AND p.status = 'draft'
         AND p.deleted_at IS NULL
         AND p.created_at > ?
       ORDER BY urgency ASC, p.deadline ASC`,
      [workerId, threeMonthsAgo]
    );

    const count = drafts.length;
    const urgent = drafts.filter(d => d.urgency === 1).length;
    console.log(`[Projects] Draft notifications for worker:${workerId} — ${count} drafts, ${urgent} urgent`);
    res.json({ count, urgent, drafts });
  } catch (err) { console.error('[Projects] ❌ getDraftNotifications:', err.message); next(err); }
}

async function cleanupOldDeleted(req, res, next) {
  try {
    const [result] = await db.execute(
      `DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL 3 MONTH)`
    );
    console.log(`[Projects] Cleanup: ${result.affectedRows} old deleted projects removed`);
    res.json({ message: `Cleaned up ${result.affectedRows} old deleted projects` });
  } catch (err) { console.error('[Projects] ❌ cleanup:', err.message); next(err); }
}

module.exports = { getProjects, getProject, createProject, updateProject, addProjectItem, removeProjectItem, deleteProject, adminApproval, getDraftNotifications, cleanupOldDeleted };
