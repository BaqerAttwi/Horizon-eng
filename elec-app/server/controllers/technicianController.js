const db = require('../db/connection');
const { createNotification } = require('./notificationController');

// ── Owner/engineer: list technicians assigned to a project ──────
async function getProjectTechnicians(req, res, next) {
  try {
    const { checkProjectAccess } = require('./crmController');
    const hasAccess = await checkProjectAccess(req, res, req.params.projectId);
    if (!hasAccess) return;

    const [rows] = await db.execute(
      `SELECT pt.id, pt.worker_id, pt.created_at, w.name, w.phone, w.email
       FROM project_technicians pt
       JOIN workers w ON pt.worker_id = w.id
       WHERE pt.project_id = ?
       ORDER BY w.name`,
      [req.params.projectId]
    );
    res.json(rows);
  } catch (err) { console.error('[Technicians] ❌ getProjectTechnicians:', err.message); next(err); }
}

// ── Owner: assign a technician to a project ─────────────────────
async function assignTechnician(req, res, next) {
  try {
    const { worker_id } = req.body;
    if (!worker_id) return res.status(400).json({ error: 'worker_id required' });

    const [[worker]] = await db.execute('SELECT id, name, role FROM workers WHERE id=?', [worker_id]);
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    if (worker.role !== 'technician') return res.status(400).json({ error: 'Worker must have the technician role' });

    const [[project]] = await db.execute('SELECT id, project_name FROM projects WHERE id=? AND deleted_at IS NULL', [req.params.projectId]);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    await db.execute(
      'INSERT IGNORE INTO project_technicians(project_id, worker_id, assigned_by) VALUES(?,?,?)',
      [req.params.projectId, worker_id, req.worker.id]
    );

    await createNotification(worker_id, 'general', `Assigned to project: ${project.project_name}`,
      `${req.worker.name} assigned you as technician on ${project.project_name}`,
      `/my-projects/${project.id}`
    );

    const [rows] = await db.execute(
      `SELECT pt.id, pt.worker_id, pt.created_at, w.name, w.phone, w.email
       FROM project_technicians pt
       JOIN workers w ON pt.worker_id = w.id
       WHERE pt.project_id = ? AND pt.worker_id = ?`,
      [req.params.projectId, worker_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[Technicians] ❌ assignTechnician:', err.message); next(err); }
}

// ── Owner: remove a technician from a project ───────────────────
async function removeTechnician(req, res, next) {
  try {
    await db.execute(
      'DELETE FROM project_technicians WHERE project_id=? AND worker_id=?',
      [req.params.projectId, req.params.workerId]
    );
    res.json({ message: 'Technician removed' });
  } catch (err) { console.error('[Technicians] ❌ removeTechnician:', err.message); next(err); }
}

// ── Technician: list projects assigned to me (no pricing fields) ──
async function getMyProjects(req, res, next) {
  try {
    const [rows] = await db.execute(
      `SELECT p.id, p.project_name, p.status, p.deadline, p.execution_deadline,
              p.total_panels, p.completed_panels, c.name as client_name,
              COALESCE(ROUND((p.completed_panels / NULLIF(p.total_panels, 0)) * 100, 1), 0) as progress_pct
       FROM project_technicians pt
       JOIN projects p ON pt.project_id = p.id
       LEFT JOIN clients c ON p.client_id = c.id
       WHERE pt.worker_id = ? AND p.deleted_at IS NULL
       ORDER BY p.updated_at DESC`,
      [req.worker.id]
    );
    res.json(rows);
  } catch (err) { console.error('[Technicians] ❌ getMyProjects:', err.message); next(err); }
}

module.exports = { getProjectTechnicians, assignTechnician, removeTechnician, getMyProjects };
