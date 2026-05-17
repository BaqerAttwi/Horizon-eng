const db = require('../db/connection');

async function getMyPendingRequests(req, res, next) {
  try {
    const [rows] = await db.execute(
      `SELECT er.*, p.project_name,
              req_w.name AS requested_by_name
       FROM project_engineer_requests er
       JOIN projects p ON er.project_id = p.id
       JOIN workers req_w ON er.requested_by = req_w.id
       WHERE er.target_engineer_id = ? AND er.status = 'pending'
       ORDER BY er.created_at DESC`,
      [req.worker.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function getMySentRequests(req, res, next) {
  try {
    const [rows] = await db.execute(
      `SELECT er.*, p.project_name,
              t_w.name AS target_name
       FROM project_engineer_requests er
       JOIN projects p ON er.project_id = p.id
       JOIN workers t_w ON er.target_engineer_id = t_w.id
       WHERE er.requested_by = ?
       ORDER BY er.created_at DESC`,
      [req.worker.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function createRequest(req, res, next) {
  try {
    const { project_id, target_engineer_id } = req.body;
    if (!project_id || !target_engineer_id) {
      return res.status(400).json({ error: 'project_id and target_engineer_id required' });
    }
    if (target_engineer_id == req.worker.id) {
      return res.status(400).json({ error: 'Cannot request yourself' });
    }
    const [existing] = await db.execute(
      'SELECT id, status FROM project_engineer_requests WHERE project_id=? AND target_engineer_id=?',
      [project_id, target_engineer_id]
    );
    if (existing.length) {
      if (existing[0].status === 'accepted') {
        return res.status(400).json({ error: 'This engineer is already on the project' });
      }
      if (existing[0].status === 'pending') {
        return res.status(400).json({ error: 'Request already sent to this engineer' });
      }
    }
    const [r] = await db.execute(
      'INSERT INTO project_engineer_requests(project_id,requested_by,target_engineer_id) VALUES(?,?,?)',
      [project_id, req.worker.id, target_engineer_id]
    );
    const [row] = await db.execute('SELECT * FROM project_engineer_requests WHERE id=?', [r.insertId]);
    res.status(201).json(row[0]);
  } catch (err) { next(err); }
}

async function respondToRequest(req, res, next) {
  try {
    const { action, rejection_reason } = req.body; // action: 'accept' or 'reject'
    if (!action || !['accept','reject'].includes(action)) {
      return res.status(400).json({ error: 'action must be accept or reject' });
    }
    if (action === 'reject' && !rejection_reason) {
      return res.status(400).json({ error: 'rejection_reason required when rejecting' });
    }
    const [existing] = await db.execute(
      'SELECT * FROM project_engineer_requests WHERE id=? AND target_engineer_id=?',
      [req.params.requestId, req.worker.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Request not found' });
    if (existing[0].status !== 'pending') {
      return res.status(400).json({ error: 'Request already responded to' });
    }
    const status = action === 'accept' ? 'accepted' : 'rejected';
    await db.execute(
      'UPDATE project_engineer_requests SET status=?, rejection_reason=? WHERE id=?',
      [status, action === 'reject' ? rejection_reason : null, req.params.requestId]
    );
    const [row] = await db.execute('SELECT * FROM project_engineer_requests WHERE id=?', [req.params.requestId]);
    res.json(row[0]);
  } catch (err) { next(err); }
}

async function deleteRequest(req, res, next) {
  try {
    await db.execute(
      'DELETE FROM project_engineer_requests WHERE id=? AND (requested_by=? OR target_engineer_id=?)',
      [req.params.requestId, req.worker.id, req.worker.id]
    );
    res.json({ message: 'Request removed' });
  } catch (err) { next(err); }
}

async function getEngineersOnProject(req, res, next) {
  try {
    const [rows] = await db.execute(
      `SELECT er.target_engineer_id AS id, w.name
       FROM project_engineer_requests er
       JOIN workers w ON er.target_engineer_id = w.id
       WHERE er.project_id = ? AND er.status = 'accepted'`,
      [req.params.projectId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = {
  getMyPendingRequests, getMySentRequests,
  createRequest, respondToRequest, deleteRequest,
  getEngineersOnProject,
};
