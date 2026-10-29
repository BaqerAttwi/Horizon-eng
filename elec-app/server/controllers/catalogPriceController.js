const db = require('../db/connection');
const { checkProjectAccess } = require('./crmController');
const { calcItemPricing, recalcPanelTotals } = require('../utils/pricing');
const { compareCatalogItem, validatePriceSelection } = require('../utils/catalogComparison');

async function priceRows(projectId, executor = db, lock = false) {
  const [[project]] = await executor.execute('SELECT exchange_rate_eur_usd FROM projects WHERE id=? AND deleted_at IS NULL', [projectId]);
  if (!project) { const error = new Error('Project not found'); error.status = 404; throw error; }
  const [rows] = await executor.execute(`SELECT i.*, d.panel_id, pcp.panel_name,
    p.id catalog_id, p.price_usd catalog_usd, p.price_euro catalog_euro,
    COALESCE(i.custom_name,p.reference) reference
    FROM panel_crm_items i JOIN panel_divisions d ON d.id=i.division_id
    JOIN project_crm_panels pcp ON pcp.id=d.panel_id
    LEFT JOIN products p ON p.id=i.product_id
    WHERE pcp.project_id=? ORDER BY i.id${lock ? ' FOR UPDATE' : ''}`, [projectId]);
  const rate = Number(project.exchange_rate_eur_usd) || 1.18;
  return { items: rows, comparisons: rows.map(i => compareCatalogItem(i, rate)), rate };
}
async function check(req, res, next) {
  try {
    if (!await checkProjectAccess(req, res, req.params.projectId)) return;
    res.json((await priceRows(req.params.projectId)).comparisons);
  } catch (e) { next(e); }
}
async function apply(req, res, next) {
  let connection;
  try {
    if (!await checkProjectAccess(req, res, req.params.projectId)) return;
    const selected = req.params.itemId ? [{ ...req.body, id: req.params.itemId }] : req.body.items;
    connection = await db.getConnection();
    await connection.beginTransaction();
    const data = await priceRows(req.params.projectId, connection, true);
    const selection = validatePriceSelection(selected, data.comparisons);
    if (selection.error) {
      await connection.rollback();
      return res.status(selection.status).json({ error: selection.error });
    }
    const panels = new Set();
    for (const row of selection.rows) {
      const existing = data.items.find(i => String(i.id) === String(row.id));
      const pricing = calcItemPricing({ ...existing, base_price_usd: row.current_usd, base_price_euro: row.current_euro }, data.rate);
      await connection.execute(`UPDATE panel_crm_items SET base_price_usd=?,base_price_euro=?,
        markupP_amt=?,discount_amt=?,totalpriceT=?,manpower_amt=?,markupM_amt=?,totalfinalProduct=? WHERE id=?`,
      [row.current_usd,row.current_euro,pricing.markupP_amt,pricing.discount_amt,pricing.totalpriceT,
        pricing.manpower_amt,pricing.markupM_amt,pricing.totalfinalProduct,row.id]);
      await connection.execute(`INSERT INTO activity_logs (project_id,panel_id,division_id,item_id,action,field_name,old_value,new_value,performed_by)
        VALUES(?,?,?,?,?,?,?,?,?)`, [req.params.projectId,row.panel_id,row.division_id,row.id,'item_updated','catalog_prices',
        JSON.stringify({ usd: row.saved_usd, euro: row.saved_euro }),JSON.stringify({ usd: row.current_usd, euro: row.current_euro }),req.worker.id]);
      panels.add(row.panel_id);
    }
    for (const panelId of panels) await recalcPanelTotals(panelId, connection);
    await connection.commit();
    res.json({ updated: selection.rows.length });
  } catch (e) {
    if (connection) await connection.rollback();
    next(e);
  } finally { if (connection) connection.release(); }
}
module.exports = { check, apply };
