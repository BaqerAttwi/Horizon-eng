const db = require('../db/connection');

// Validate the complete resource path before selecting the project review lock.
// Checking only the caller's project ID lets a mismatched child bypass its lock.
async function checkResourceScope(req, res) {
  const params = req.params || {};
  let projectId = params.projectId || params.id || req.body?.project_id;
  const checks = [
    ['panelId', 'SELECT project_id FROM project_crm_panels WHERE id=?'],
    ['divisionId', 'SELECT d.panel_id, p.project_id FROM panel_divisions d JOIN project_crm_panels p ON p.id=d.panel_id WHERE d.id=?'],
    ['itemId', req.path?.includes('/execution/items/')
      ? 'SELECT i.division_id,d.panel_id,p.project_id FROM panel_crm_items i JOIN panel_divisions d ON d.id=i.division_id JOIN project_crm_panels p ON p.id=d.panel_id WHERE i.id=?'
      : req.path?.includes('/panels/')
        ? 'SELECT i.division_id,d.panel_id,p.project_id FROM panel_crm_items i JOIN panel_divisions d ON d.id=i.division_id JOIN project_crm_panels p ON p.id=d.panel_id WHERE i.id=?'
        : 'SELECT project_id FROM project_items WHERE id=?'],
    ['instanceId', 'SELECT g.division_id,d.panel_id,p.project_id FROM division_item_group_instances g JOIN panel_divisions d ON d.id=g.division_id JOIN project_crm_panels p ON p.id=d.panel_id WHERE g.id=?'],
    ['attachmentId', 'SELECT project_id FROM attachments WHERE id=?'],
    ['paymentId', 'SELECT project_id FROM project_payments WHERE id=?'],
    ['requestId', 'SELECT project_id FROM crm_price_change_requests WHERE id=?'],
  ];
  if (req.body?.item_id) checks.push(['bodyItemId', 'SELECT d.panel_id,p.project_id FROM panel_crm_items i JOIN panel_divisions d ON d.id=i.division_id JOIN project_crm_panels p ON p.id=d.panel_id WHERE i.id=?']);
  for (const [key, sql] of checks) {
    const id = key === 'bodyItemId' ? req.body.item_id : params[key];
    if (!id) continue;
    const [[row]] = await db.execute(sql, [id]);
    if (!row || (projectId && String(row.project_id) !== String(projectId)) ||
      (row.panel_id && params.panelId && String(row.panel_id) !== String(params.panelId)) ||
      (row.division_id && params.divisionId && String(row.division_id) !== String(params.divisionId))) {
      res.status(404).json({ error: 'Resource not found in this project' });
      return false;
    }
    projectId = row.project_id;
  }
  return true;
}

module.exports = { checkResourceScope };
