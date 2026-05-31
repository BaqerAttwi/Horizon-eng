const pool = require('../db/connection');

// ── Get notifications for current user ────────────────────────
async function getNotifications(req, res, next) {
  try {
    const userId = req.worker.id;
    const { limit = 50, unread_only } = req.query;

    let query = `
      SELECT n.id, n.type, n.title, n.message, n.link, n.is_read, n.created_at
      FROM notifications n
      WHERE n.user_id = ?
    `;
    const params = [userId];

    if (unread_only === 'true') {
      query += ` AND n.is_read = FALSE`;
    }

    query += ` ORDER BY n.created_at DESC LIMIT ?`;
    params.push(parseInt(limit));

    const [notifications] = await pool.query(query, params);

    const [[unreadCount]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = FALSE`,
      [userId]
    );

    res.json({ notifications, unread_count: unreadCount.cnt });
  } catch (err) {
    next(err);
  }
}

// ── Mark notification as read ─────────────────────────────────
async function markAsRead(req, res, next) {
  try {
    const { notificationId } = req.params;
    const userId = req.worker.id;

    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?`,
      [notificationId, userId]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ── Mark all as read ──────────────────────────────────────────
async function markAllAsRead(req, res, next) {
  try {
    const userId = req.worker.id;

    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE`,
      [userId]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ── Delete notification ───────────────────────────────────────
async function deleteNotification(req, res, next) {
  try {
    const { notificationId } = req.params;
    const userId = req.worker.id;

    await pool.query(
      `DELETE FROM notifications WHERE id = ? AND user_id = ?`,
      [notificationId, userId]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ── Helper: Create a notification ─────────────────────────────
async function createNotification(userId, type, title, message, link) {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)`,
      [userId, type, title, message, link]
    );
  } catch (err) {
    console.error('[Notification] Failed to create:', err.message);
  }
}

// ── Helper: Notify all owners about something ─────────────────
async function notifyOwners(type, title, message, link) {
  try {
    const [owners] = await pool.query(`SELECT id FROM workers WHERE role = 'owner'`);
    for (const owner of owners) {
      await createNotification(owner.id, type, title, message, link);
    }
  } catch (err) {
    console.error('[Notification] Failed to notify owners:', err.message);
  }
}

// ── Helper: Notify engineer about their project ───────────────
async function notifyEngineer(projectId, type, title, message, link) {
  try {
    const [[project]] = await pool.query(
      `SELECT engineer_id FROM projects WHERE id = ?`,
      [projectId]
    );
    if (project) {
      await createNotification(project.engineer_id, type, title, message, link);
    }
  } catch (err) {
    console.error('[Notification] Failed to notify engineer:', err.message);
  }
}

// ── Cron-like: Generate deadline warnings (call on server start + periodically) ──
async function checkDeadlineWarnings() {
  try {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const today = new Date().toISOString().split('T')[0];
    const warningDate = threeDaysFromNow.toISOString().split('T')[0];

    // Find projects with deadlines in next 3 days that aren't completed
    const [projects] = await pool.query(`
      SELECT p.id, p.project_name, p.deadline, p.engineer_id, w.name as engineer_name
      FROM projects p
      JOIN workers w ON w.id = p.engineer_id
      WHERE p.deadline IS NOT NULL
        AND p.deadline <= ?
        AND p.deadline >= ?
        AND p.status NOT IN ('completed', 'cancelled')
        AND p.deleted_at IS NULL
    `, [warningDate, today]);

    for (const p of projects) {
      const daysLeft = Math.ceil((new Date(p.deadline) - new Date()) / (1000 * 60 * 60 * 24));
      const urgency = daysLeft <= 1 ? '🔴 URGENT' : daysLeft <= 2 ? '🟡 Warning' : '🔵 Reminder';

      // Notify engineer
      await createNotification(
        p.engineer_id,
        'deadline',
        `${urgency}: ${p.project_name}`,
        `Deadline in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} (${p.deadline})`,
        `/projects/${p.id}/crm`
      );

      // Notify owners
      await notifyOwners(
        'deadline',
        `${urgency}: ${p.project_name}`,
        `${p.engineer_name}'s project due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
        `/projects/${p.id}/crm`
      );
    }

    console.log(`[Notification] Deadline check: ${projects.length} warnings generated`);
  } catch (err) {
    console.error('[Notification] Deadline check failed:', err.message);
  }
}

// ── Cron-like: Notify about pending approvals ─────────────────
async function checkPendingApprovals() {
  try {
    // Projects waiting for admin approval
    const [pendingAdmin] = await pool.query(`
      SELECT p.id, p.project_name, p.engineer_id, w.name as engineer_name
      FROM projects p
      JOIN workers w ON w.id = p.engineer_id
      WHERE p.admin_approval = 'pending'
        AND p.status = 'draft'
        AND p.deleted_at IS NULL
        AND p.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);

    for (const p of pendingAdmin) {
      await notifyOwners(
        'approval',
        `Pending Approval: ${p.project_name}`,
        `${p.engineer_name} is waiting for admin approval`,
        `/projects/${p.id}`
      );
    }

    // Projects waiting for client approval (admin already approved)
    const [pendingClient] = await pool.query(`
      SELECT p.id, p.project_name, p.engineer_id, w.name as engineer_name
      FROM projects p
      JOIN workers w ON w.id = p.engineer_id
      WHERE p.admin_approval = 'approved'
        AND p.client_approval = 'pending'
        AND p.deleted_at IS NULL
        AND p.updated_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)
    `);

    for (const p of pendingClient) {
      await createNotification(
        p.engineer_id,
        'approval',
        `Client Approval Pending: ${p.project_name}`,
        `Waiting for client approval for over 48 hours`,
        `/projects/${p.id}`
      );
    }

    console.log(`[Notification] Approval check: ${pendingAdmin.length} admin + ${pendingClient.length} client pending`);
  } catch (err) {
    console.error('[Notification] Approval check failed:', err.message);
  }
}

// ── Cron-like: Low stock warnings ─────────────────────────────
async function checkLowStock() {
  try {
    const [lowStock] = await pool.query(`
      SELECT id, reference, description, stock_qty, reserved_qty
      FROM products
      WHERE stock_qty <= reserved_qty AND stock_qty <= 5
      ORDER BY stock_qty ASC
      LIMIT 20
    `);

    for (const p of lowStock) {
      const severity = p.stock_qty === 0 ? 'OUT OF STOCK' : `Low: ${p.stock_qty} left`;
      await notifyOwners(
        'stock',
        `${severity}: ${p.reference}`,
        p.description || 'No description',
        '/products'
      );
    }

    console.log(`[Notification] Stock check: ${lowStock.length} alerts`);
  } catch (err) {
    console.error('[Notification] Stock check failed:', err.message);
  }
}

// ── Run all periodic checks ───────────────────────────────────
async function runNotificationChecks() {
  await checkDeadlineWarnings();
  await checkPendingApprovals();
  await checkLowStock();
}

module.exports = {
  getNotifications, markAsRead, markAllAsRead, deleteNotification,
  createNotification, notifyOwners, notifyEngineer,
  checkDeadlineWarnings, checkPendingApprovals, checkLowStock, runNotificationChecks
};
