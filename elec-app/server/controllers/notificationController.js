const pool = require('../db/connection');
const { notifyByEmail } = require('../utils/emailService');

// ── Get notifications for current user ────────────────────────
async function getNotifications(req, res, next) {
  try {
    const userId = req.worker.id;
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const { unread_only } = req.query;

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
    params.push(limit);

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

// ── Helper: Create a notification (with dedup check) ──────────
async function createNotification(userId, type, title, message, link, skipEmail = false) {
  try {
    // Don't create duplicate unread notifications for same type + link
    const [existing] = await pool.query(
      `SELECT id FROM notifications WHERE user_id = ? AND type = ? AND link = ? AND is_read = FALSE LIMIT 1`,
      [userId, type, link]
    );
    if (existing.length) {
      if (!skipEmail && type !== 'stock') {
        const [[wk]] = await pool.query('SELECT id, name, email FROM workers WHERE id = ?', [userId]);
        if (wk && wk.email) notifyByEmail(wk, type, title, message, link).catch(() => {});
      }
      return;
    }

    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)`,
      [userId, type, title, message, link]
    );

    if (!skipEmail && type !== 'stock') {
      const [[worker]] = await pool.query('SELECT id, name, email FROM workers WHERE id = ?', [userId]);
      if (worker && worker.email) {
        notifyByEmail(worker, type, title, message, link).catch(e => console.error('[Email] async error:', e.message));
      } else {
      }
    }
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
      LEFT JOIN workers w ON w.id = p.engineer_id
      WHERE p.deadline IS NOT NULL
        AND p.deadline <= ?
        AND p.deadline >= ?
        AND p.status NOT IN ('completed', 'cancelled')
        AND p.deleted_at IS NULL
    `, [warningDate, today]);

    for (const p of projects) {
      const daysLeft = Math.ceil((new Date(p.deadline) - new Date()) / (1000 * 60 * 60 * 24));
      const urgency = daysLeft <= 1 ? '🔴 URGENT' : daysLeft <= 2 ? '🟡 Warning' : '🔵 Reminder';

      if (p.engineer_id) {
        await createNotification(
          p.engineer_id,
          'deadline',
          `${urgency}: ${p.project_name}`,
          `Deadline in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} (${p.deadline})`,
          `/projects/${p.id}/crm`,
          true
        );
      }

      // Notify owners
      await notifyOwners(
        'deadline',
        `${urgency}: ${p.project_name}`,
        `${p.engineer_name || 'Unassigned'} project due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
        `/projects/${p.id}/crm`
      );
    }

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
      LEFT JOIN workers w ON w.id = p.engineer_id
      WHERE p.admin_approval = 'pending'
        AND p.status = 'draft'
        AND p.deleted_at IS NULL
        AND p.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);

    for (const p of pendingAdmin) {
      await notifyOwners(
        'approval',
        `Pending Approval: ${p.project_name}`,
        `${p.engineer_name || 'This project'} is waiting for admin approval`,
        `/projects/${p.id}`
      );
    }

    // Projects waiting for client approval (admin already approved)
    const [pendingClient] = await pool.query(`
      SELECT p.id, p.project_name, p.engineer_id, w.name as engineer_name
      FROM projects p
      LEFT JOIN workers w ON w.id = p.engineer_id
      WHERE p.admin_approval = 'approved'
        AND p.client_approval = 'pending'
        AND p.deleted_at IS NULL
        AND p.updated_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)
    `);

    for (const p of pendingClient) {
      if (p.engineer_id) {
        await createNotification(
          p.engineer_id,
          'approval',
          `Client Approval Pending: ${p.project_name}`,
          `Waiting for client approval for over 48 hours`,
          `/projects/${p.id}`,
          true
        );
      }
    }

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

  } catch (err) {
    console.error('[Notification] Stock check failed:', err.message);
  }
}

// ── Cron-like: Outstanding payment reminders ───────────────────
// A project is usually paid across several installments, and each payment
// can carry a deadline for the *next* one (set right in the "Record
// Payment" form). This check fires once that next-payment deadline has
// passed and money is still owed. Projects that haven't set a payment
// deadline yet fall back to the general project deadline, or 30 days of
// inactivity, so nothing unpaid gets forgotten either way.
async function checkOutstandingPayments() {
  try {
    const [projects] = await pool.query(`
      SELECT p.id, p.project_name, p.engineer_id, w.name as engineer_name, p.payment_deadline,
        COALESCE(NULLIF(p.total_with_vat,0), p.total_price) as total_due,
        COALESCE(pay.paid, 0) as total_paid,
        (COALESCE(NULLIF(p.total_with_vat,0), p.total_price) - COALESCE(pay.paid, 0)) as outstanding
      FROM projects p
      LEFT JOIN workers w ON w.id = p.engineer_id
      LEFT JOIN (SELECT project_id, SUM(amount) as paid FROM project_payments GROUP BY project_id) pay
        ON pay.project_id = p.id
      WHERE p.deleted_at IS NULL
        AND p.admin_approval = 'approved' AND p.client_approval = 'approved'
        AND (
          (p.payment_deadline IS NOT NULL AND p.payment_deadline < CURDATE())
          OR (p.payment_deadline IS NULL AND p.deadline IS NOT NULL AND p.deadline < CURDATE())
          OR (p.payment_deadline IS NULL AND p.deadline IS NULL AND p.updated_at < DATE_SUB(NOW(), INTERVAL 30 DAY))
        )
    `);

    for (const p of projects) {
      if (p.outstanding <= 0.01) continue;
      const msg = `$${parseFloat(p.outstanding).toFixed(2)} of $${parseFloat(p.total_due).toFixed(2)} still unpaid` +
        (p.payment_deadline ? ` — next payment was due ${new Date(p.payment_deadline).toLocaleDateString()}` : '');

      await notifyOwners('info', `💰 Payment Due: ${p.project_name}`, msg, `/debt`);
      if (p.engineer_id) {
        await createNotification(p.engineer_id, 'info', `💰 Payment Due: ${p.project_name}`, msg, `/projects/${p.id}/crm`, true);
      }
    }
  } catch (err) {
    console.error('[Notification] Outstanding payments check failed:', err.message);
  }
}

// ── Run all periodic checks ───────────────────────────────────
async function runNotificationChecks() {
  await checkDeadlineWarnings();
  await checkPendingApprovals();
  await checkLowStock();
  await checkOutstandingPayments();
}

module.exports = {
  getNotifications, markAsRead, markAllAsRead, deleteNotification,
  createNotification, notifyOwners, notifyEngineer,
  checkDeadlineWarnings, checkPendingApprovals, checkLowStock, checkOutstandingPayments, runNotificationChecks
};
