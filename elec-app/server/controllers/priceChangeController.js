const db = require('../db/connection');
const { recalcDivisionTotals, recalcPanelTotals } = require('../utils/pricing');

async function createPriceChangeRequest(req, res, next) {
  try {
    const { item_id, new_base_price_usd, new_base_price_euro, new_markupP_pct, new_discount_pct, new_manpower_pct, new_markupM_pct, new_qty } = req.body;

    if (!item_id) return res.status(400).json({ error: 'item_id required' });

    const [items] = await db.execute('SELECT * FROM panel_crm_items WHERE id=?', [item_id]);
    if (!items.length) return res.status(404).json({ error: 'Item not found' });

    const item = items[0];

    const [divs] = await db.execute('SELECT panel_id FROM panel_divisions WHERE id=?', [item.division_id]);
    if (!divs.length) return res.status(404).json({ error: 'Division not found' });
    const panelId = divs[0].panel_id;

    const [panels] = await db.execute('SELECT project_id FROM project_crm_panels WHERE id=?', [panelId]);
    if (!panels.length) return res.status(404).json({ error: 'Panel not found' });
    const projectId = panels[0].project_id;

    const [existing] = await db.execute(
      'SELECT id FROM crm_price_change_requests WHERE item_id=? AND status=\'pending\'',
      [item_id]
    );
    if (existing.length) {
      await db.execute(
        `UPDATE crm_price_change_requests SET
          new_base_price_usd=?, new_base_price_euro=?, new_markupP_pct=?,
          new_discount_pct=?, new_manpower_pct=?, new_markupM_pct=?, new_qty=?,
          requested_by=?
         WHERE item_id=? AND status='pending'`,
        [
          new_base_price_usd !== undefined ? new_base_price_usd : item.base_price_usd,
          new_base_price_euro !== undefined ? new_base_price_euro : item.base_price_euro,
          new_markupP_pct !== undefined ? new_markupP_pct : item.markupP_pct,
          new_discount_pct !== undefined ? new_discount_pct : item.discount_pct,
          new_manpower_pct !== undefined ? new_manpower_pct : item.manpower_pct,
          new_markupM_pct !== undefined ? new_markupM_pct : item.markupM_pct,
          new_qty !== undefined ? new_qty : item.qty,
          req.worker.id,
          item_id
        ]
      );
      const [updated] = await db.execute('SELECT * FROM crm_price_change_requests WHERE item_id=? AND status=\'pending\'', [item_id]);
      return res.json({ message: 'Price change request updated', request: updated[0] });
    }

    const [result] = await db.execute(
      `INSERT INTO crm_price_change_requests(
        item_id, project_id, panel_id, division_id,
        old_base_price_usd, old_base_price_euro, old_markupP_pct, old_discount_pct, old_manpower_pct, old_markupM_pct, old_qty,
        new_base_price_usd, new_base_price_euro, new_markupP_pct, new_discount_pct, new_manpower_pct, new_markupM_pct, new_qty,
        requested_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        item_id, projectId, panelId, item.division_id,
        item.base_price_usd, item.base_price_euro, item.markupP_pct, item.discount_pct, item.manpower_pct, item.markupM_pct, item.qty,
        new_base_price_usd !== undefined ? new_base_price_usd : item.base_price_usd,
        new_base_price_euro !== undefined ? new_base_price_euro : item.base_price_euro,
        new_markupP_pct !== undefined ? new_markupP_pct : item.markupP_pct,
        new_discount_pct !== undefined ? new_discount_pct : item.discount_pct,
        new_manpower_pct !== undefined ? new_manpower_pct : item.manpower_pct,
        new_markupM_pct !== undefined ? new_markupM_pct : item.markupM_pct,
        new_qty !== undefined ? new_qty : item.qty,
        req.worker.id
      ]
    );

    const [owners] = await db.execute('SELECT id FROM workers WHERE role=\'owner\'');
    const oldUsd = parseFloat(item.base_price_usd) || 0;
    const oldEur = parseFloat(item.base_price_euro) || 0;
    const newUsd = new_base_price_usd !== undefined ? parseFloat(new_base_price_usd) : oldUsd;
    const newEur = new_base_price_euro !== undefined ? parseFloat(new_base_price_euro) : oldEur;
    let priceMsg;
    if (newUsd !== oldUsd) priceMsg = `base $${oldUsd.toFixed(2)} → $${newUsd.toFixed(2)}`;
    else if (newEur !== oldEur) priceMsg = `base €${oldEur.toFixed(2)} → €${newEur.toFixed(2)}`;
    else priceMsg = `item #${item_id}`;
    for (const owner of owners) {
      await db.execute(
        `INSERT INTO notifications(user_id, type, title, message, link) VALUES(?,?,?,?,?)`,
        [owner.id, 'approval', 'Price Change Request',
         `Engineer ${req.worker.name}: ${priceMsg}`,
         `/crm/${projectId}`]
      );
    }

    const [rows] = await db.execute('SELECT * FROM crm_price_change_requests WHERE id=?', [result.insertId]);
    res.status(201).json({ ...rows[0], message: 'Price change request created' });
  } catch (err) {
    console.error('[PriceChange] ❌ createPriceChangeRequest:', err.message);
    next(err);
  }
}

async function getPendingRequests(req, res, next) {
  try {
    const { project_id, status } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (project_id) { where += ' AND r.project_id=?'; params.push(project_id); }
    if (status && status !== 'all') { where += ' AND r.status=?'; params.push(status); }

    const [requests] = await db.execute(
      `SELECT r.*,
        p.project_name,
        req.name AS requested_by_name,
        app.name AS approved_by_name,
        cp.reference, cp.description AS product_desc, b.name AS brand_name,
        ci.custom_name, ci.custom_desc, ci.custom_brand
       FROM crm_price_change_requests r
       JOIN projects p ON p.id = r.project_id
       JOIN workers req ON req.id = r.requested_by
       LEFT JOIN workers app ON app.id = r.approved_by
       LEFT JOIN panel_crm_items ci ON ci.id = r.item_id
       LEFT JOIN products cp ON cp.id = ci.product_id
       LEFT JOIN brands b ON cp.brand_id = b.id
       ${where}
       ORDER BY r.created_at DESC`,
      params
    );

    res.json(requests);
  } catch (err) {
    console.error('[PriceChange] ❌ getPendingRequests:', err.message);
    next(err);
  }
}

async function approveRequest(req, res, next) {
  try {
    const { requestId } = req.params;

    const [requests] = await db.execute('SELECT * FROM crm_price_change_requests WHERE id=? AND status=\'pending\'', [requestId]);
    if (!requests.length) return res.status(404).json({ error: 'Request not found or already processed' });

    const request = requests[0];

    await db.execute(
      `UPDATE panel_crm_items SET
        base_price_usd=?, base_price_euro=?, markupP_pct=?, discount_pct=?,
        manpower_pct=?, markupM_pct=?, qty=?
       WHERE id=?`,
      [
        request.new_base_price_usd, request.new_base_price_euro,
        request.new_markupP_pct, request.new_discount_pct,
        request.new_manpower_pct, request.new_markupM_pct,
        request.new_qty, request.item_id
      ]
    );

    await db.execute(
      'UPDATE crm_price_change_requests SET status=\'approved\', approved_by=? WHERE id=?',
      [req.worker.id, requestId]
    );

    const { calcItemPricing } = require('../utils/pricing');
    const [updatedItem] = await db.execute('SELECT * FROM panel_crm_items WHERE id=?', [request.item_id]);
    if (updatedItem.length) {
      const pricing = calcItemPricing(updatedItem[0]);
      await db.execute(
        `UPDATE panel_crm_items SET markupP_amt=?,discount_amt=?,totalpriceT=?,manpower_amt=?,markupM_amt=?,totalfinalProduct=? WHERE id=?`,
        [pricing.markupP_amt, pricing.discount_amt, pricing.totalpriceT, pricing.manpower_amt, pricing.markupM_amt, pricing.totalfinalProduct, request.item_id]
      );
    }

    await recalcDivisionTotals(request.division_id);
    await recalcPanelTotals(request.panel_id);
    const { recalcReservedQty } = require('./projectController');
    await recalcReservedQty();

    const approvedUsd = parseFloat(request.new_base_price_usd) || 0;
    const approvedEur = parseFloat(request.new_base_price_euro) || 0;
    const approvedMsg = approvedUsd ? `$${approvedUsd.toFixed(2)}` : `€${approvedEur.toFixed(2)}`;
    await db.execute(
      `INSERT INTO notifications(user_id, type, title, message, link) VALUES(?,?,?,?,?)`,
      [request.requested_by, 'approval', 'Price Change Approved',
       `Item #${request.item_id} price changed to ${approvedMsg}`,
       `/crm/${request.project_id}`]
    );

    res.json({ message: 'Price change approved and applied' });
  } catch (err) {
    console.error('[PriceChange] ❌ approveRequest:', err.message);
    next(err);
  }
}

async function rejectRequest(req, res, next) {
  try {
    const { requestId } = req.params;
    const { rejection_reason } = req.body;

    const [requests] = await db.execute('SELECT * FROM crm_price_change_requests WHERE id=? AND status=\'pending\'', [requestId]);
    if (!requests.length) return res.status(404).json({ error: 'Request not found or already processed' });

    const request = requests[0];

    await db.execute(
      'UPDATE crm_price_change_requests SET status=\'rejected\', approved_by=?, rejection_reason=? WHERE id=?',
      [req.worker.id, rejection_reason || null, requestId]
    );

    const rejectedUsd = parseFloat(request.new_base_price_usd) || 0;
    const rejectedEur = parseFloat(request.new_base_price_euro) || 0;
    const rejectedMsg = rejectedUsd ? `$${rejectedUsd.toFixed(2)}` : `€${rejectedEur.toFixed(2)}`;
    await db.execute(
      `INSERT INTO notifications(user_id, type, title, message, link) VALUES(?,?,?,?,?)`,
      [request.requested_by, 'approval', 'Price Change Rejected',
       `Item #${request.item_id} price ${rejectedMsg} was rejected${rejection_reason ? ': ' + rejection_reason : ''}`,
       `/crm/${request.project_id}`]
    );

    res.json({ message: 'Price change rejected' });
  } catch (err) {
    console.error('[PriceChange] ❌ rejectRequest:', err.message);
    next(err);
  }
}

async function getMyRequests(req, res, next) {
  try {
    const [requests] = await db.execute(
      `SELECT r.*, p.project_name, app.name AS approved_by_name
       FROM crm_price_change_requests r
       JOIN projects p ON p.id = r.project_id
       LEFT JOIN workers app ON app.id = r.approved_by
       WHERE r.requested_by = ?
       ORDER BY r.created_at DESC`,
      [req.worker.id]
    );
    res.json(requests);
  } catch (err) {
    console.error('[PriceChange] ❌ getMyRequests:', err.message);
    next(err);
  }
}

async function getPendingForProject(req, res, next) {
  try {
    const { projectId } = req.params;
    const [requests] = await db.execute(
      `SELECT r.item_id, r.status, r.new_base_price_usd, r.new_base_price_euro, r.created_at
       FROM crm_price_change_requests r
       WHERE r.project_id = ? AND r.status = 'pending'`,
      [projectId]
    );
    res.json(requests);
  } catch (err) {
    console.error('[PriceChange] ❌ getPendingForProject:', err.message);
    next(err);
  }
}

module.exports = {
  createPriceChangeRequest,
  getPendingRequests,
  approveRequest,
  rejectRequest,
  getMyRequests,
  getPendingForProject,
};
