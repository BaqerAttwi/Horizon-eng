const db = require('../db/connection');
const lockPool = require('mysql2/promise').createPool({
 host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
 user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
 database: process.env.DB_NAME || 'elec_app', connectionLimit: 10,
});

async function resolveProjectId(req) {
  let id = req.params.projectId || req.params.id || req.body?.project_id;
  if (!id && req.params.instanceId) {
    const [[row]] = await db.execute(`SELECT p.project_id FROM division_item_group_instances g
      JOIN panel_divisions d ON d.id=g.division_id JOIN project_crm_panels p ON p.id=d.panel_id WHERE g.id=?`, [req.params.instanceId]);
    id = row?.project_id;
  }
  if (!id && req.body?.item_id) {
    const [[row]] = await db.execute('SELECT p.project_id FROM panel_crm_items i JOIN panel_divisions d ON d.id=i.division_id JOIN project_crm_panels p ON p.id=d.panel_id WHERE i.id=?', [req.body.item_id]);
    id = row?.project_id;
  }
  if (!id && req.params.requestId) {
    const [[row]] = await db.execute('SELECT project_id FROM crm_price_change_requests WHERE id=?', [req.params.requestId]);
    id = row?.project_id;
  }
  return id;
}

// Serialize edits, submissions, decisions and stage changes for the same project.
async function serializeProject(req, res, next) {
  let connection;
  try {
    let validNumbers = false;
    require('./numericValidation').numericValidation(req, res, () => { validNumbers = true; });
    if (!validNumbers) return;
    if (!await require('./resourceScope').checkResourceScope(req, res)) return;
    const id = await resolveProjectId(req);
    if (!id) return res.status(400).json({ error: 'Project is required' });
    req.reviewProjectId = id;
    connection = await lockPool.getConnection();
    const key = `project-review-${id}`;
    const [[row]] = await connection.execute('SELECT GET_LOCK(?,10) acquired', [key]);
    if (!row.acquired) { connection.release(); return res.status(409).json({ error: 'Project is being updated. Please try again.' }); }
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      try { await connection.execute('SELECT RELEASE_LOCK(?)', [key]); connection.release(); } catch (error) { connection.destroy(); console.error('[Review lock]', error.message); }
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  } catch (error) { if (connection) connection.release(); next(error); }
}

async function recordReview(projectId, action, status, note, workerId, executor = db) {
  await executor.execute('INSERT INTO project_review_history(project_id,action,status,note,performed_by) VALUES(?,?,?,?,?)',
    [projectId, action, status, note || null, workerId]);
}

async function persistReview(sql, params, event) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(sql, params);
    await recordReview(event.projectId, event.action, event.status, event.note, event.workerId, connection);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

async function guardProjectEdit(req, res, next) {
  try {
    const id = req.reviewProjectId || await resolveProjectId(req);
    const { checkProjectAccess } = require('../controllers/crmController');
    if (!await checkProjectAccess(req, res, id)) return;
    const [[project]] = await db.execute('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', [id]);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.status === 'cancelled' || project.admin_approval === 'cancelled') return res.status(423).json({ error: 'Canceled project is read-only. Management must reopen it first.' });
    const management = ['owner','head_engineer'].includes(req.worker.role);
    if (!management && project.ready_for_review && project.admin_approval === 'pending') return res.status(423).json({ error: 'Submitted project is read-only while awaiting review. Management must request a recheck to allow edits.' });
    if (!management && project.client_approval === 'approved') return res.status(423).json({ error: 'Client-approved quotation is read-only.' });
    // Invalidate before accepting an edit: even a partially failed edit cannot retain approval.
    const projectMetadata = req.method === 'PATCH' && /^\/projects\/[^/]+$/.test(req.path || '');
    const reviewedFields = ['project_name','client_id','quote_number','total_panels','exchange_rate_eur_usd','vat_pct','project_discount_pct','payment_terms','client_pdf_note'];
    const changesReviewedWork = !projectMetadata || reviewedFields.some(field => req.body[field] !== undefined && String(req.body[field] ?? '') !== String(project[field] ?? ''));
    if (changesReviewedWork && (project.admin_approval === 'approved' || project.ready_for_review)) {
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute(`UPDATE projects SET admin_approval='pending',ready_for_review=FALSE,
          client_approval='pending', project_stage=IF(project_stage IN ('quotation','approval'),'design',project_stage) WHERE id=?`, [id]);
        await recordReview(id, 'changes_require_review', 'pending', 'Project changes require a new submission and approval.', req.worker.id, connection);
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
      const { createNotification } = require('../controllers/notificationController');
      if (project.engineer_id) await createNotification(project.engineer_id, 'approval', 'New review required', 'Project changes have reset approval. Submit the updated project for management review.', `/projects/${id}`);
    }
    next();
  } catch (error) { next(error); }
}

async function guardProjectProgress(req, res, next) {
  try {
    const [[project]] = await db.execute('SELECT status,admin_approval,ready_for_review FROM projects WHERE id=? AND deleted_at IS NULL', [req.reviewProjectId]);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.status === 'cancelled' || project.admin_approval === 'cancelled') return res.status(423).json({ error: 'Canceled project is read-only until management reopens it.' });
    if (!['owner','head_engineer'].includes(req.worker.role) && project.ready_for_review && project.admin_approval === 'pending') return res.status(423).json({ error: 'Project is read-only while awaiting review.' });
    next();
  } catch (error) { next(error); }
}

async function getReviewHistory(req, res, next) {
  try {
    const { checkProjectAccess } = require('../controllers/crmController');
    if (!await checkProjectAccess(req, res, req.params.projectId)) return;
    const [rows] = await db.execute(`SELECT h.*,w.name reviewer_name FROM project_review_history h
      LEFT JOIN workers w ON w.id=h.performed_by WHERE h.project_id=? ORDER BY h.id DESC`, [req.params.projectId]);
    res.json(rows);
  } catch (error) { next(error); }
}
module.exports = { serializeProject, guardProjectEdit, guardProjectProgress, recordReview, persistReview, getReviewHistory, closeReviewLocks: () => lockPool.end() };
