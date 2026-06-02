const db = require('../db/connection');

const { createNotification } = require('./notificationController');

async function logActivity({ project_id, panel_id, division_id, item_id, action, field_name, old_value, new_value, performed_by }) {
  try {
    await db.execute(
      `INSERT INTO activity_logs (project_id, panel_id, division_id, item_id, action, field_name, old_value, new_value, performed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [project_id || null, panel_id || null, division_id || null, item_id || null, action, field_name || null, old_value != null ? String(old_value) : null, new_value != null ? String(new_value) : null, performed_by]
    );
  } catch (err) {
    console.error('[ActivityLog] Failed:', err.message);
  }
}

async function getActivityLogs(req, res, next) {
  try {
    const { projectId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const [logs] = await db.execute(
      `SELECT al.*, w.name as performer_name, w.role as performer_role
       FROM activity_logs al
       LEFT JOIN workers w ON w.id = al.performed_by
       WHERE al.project_id = ?
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [projectId, parseInt(limit), parseInt(offset)]
    );

    const [[{ total }]] = await db.execute(
      'SELECT COUNT(*) as total FROM activity_logs WHERE project_id = ?',
      [projectId]
    );

    res.json({ logs, total });
  } catch (err) {
    next(err);
  }
}

module.exports = { logActivity, getActivityLogs };
