const db = require('../db/connection');

async function lockAfterClientApproval(req, res, next) {
  try {
    if (['owner', 'head_engineer'].includes(req.worker?.role)) return next();
    let projectId = req.params.projectId || req.params.id || req.body?.project_id;
    if (!projectId && req.params.instanceId) {
      const [[row]] = await db.execute(`SELECT pcp.project_id FROM division_item_group_instances gi
        JOIN panel_divisions d ON d.id=gi.division_id JOIN project_crm_panels pcp ON pcp.id=d.panel_id WHERE gi.id=?`, [req.params.instanceId]);
      projectId = row?.project_id;
    }
    if (!projectId) return res.status(400).json({ error: 'Project is required for this change' });
    const [[project]] = await db.execute('SELECT client_approval FROM projects WHERE id=? AND deleted_at IS NULL', [projectId]);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.client_approval === 'approved') {
      return res.status(423).json({ error: 'Quotation is locked after client approval. Only Owner or Head of Engineering can change it.' });
    }
    next();
  } catch (error) { next(error); }
}

module.exports = { lockAfterClientApproval };
