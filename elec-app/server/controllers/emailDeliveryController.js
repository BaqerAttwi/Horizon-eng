const db = require('../db/connection');

async function getProjectEmailDeliveries(req, res, next) {
  try {
    const { checkProjectAccess } = require('./crmController');
    if (!await checkProjectAccess(req, res, req.params.projectId)) return;
    const management = ['owner','head_engineer'].includes(req.worker.role);
    const [rows] = await db.execute(`SELECT id,subject,status,attempts,last_error,created_at,sent_at
      FROM email_deliveries WHERE project_id=? ${management ? '' : 'AND user_id=?'} ORDER BY id DESC LIMIT 100`,
      management ? [req.params.projectId] : [req.params.projectId,req.worker.id]);
    res.json(rows);
  } catch (error) { next(error); }
}
async function retryEmailDelivery(req, res, next) {
  try {
    const [result] = await db.execute(`UPDATE email_deliveries SET status='queued',attempts=0,next_attempt_at=NOW(),last_error=NULL
      WHERE id=? AND status='failed' AND sent_at IS NULL AND recipient<>''`, [req.params.deliveryId]);
    if (!result.affectedRows) return res.status(409).json({ error: 'Only failed emails can be retried' });
    res.json({ message: 'Email queued for retry' });
  } catch (error) { next(error); }
}
module.exports = { getProjectEmailDeliveries, retryEmailDelivery };
