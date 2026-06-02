const pool = require('../db/connection');

async function getMessages(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM messages');
    const [rows] = await pool.query(
      `SELECT m.*, w.name as creator_name, w.role as creator_role
       FROM messages m
       LEFT JOIN workers w ON m.created_by = w.id
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    res.json({ data: rows, total, page, limit });
  } catch (err) {
    console.error('[Messages] ❌ getMessages:', err.message);
    next(err);
  }
}

async function createMessage(req, res, next) {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const [result] = await pool.query(
      'INSERT INTO messages (content, created_by) VALUES (?, ?)',
      [content.trim(), req.worker.id]
    );

    // Notify + email all users
    const { createNotification } = require('./notificationController');
    const { notifyByEmail } = require('../utils/emailService');
    const [allWorkers] = await pool.query('SELECT id, name, email FROM workers');
    const truncated = `${content.substring(0, 80)}${content.length > 80 ? '...' : ''}`;
    for (const w of allWorkers) {
      await createNotification(w.id, 'info', 'New Announcement',
        `${req.worker.name} posted: ${truncated}`,
        '/messages'
      );
      if (w.email && w.id !== req.worker.id) {
        notifyByEmail(w, 'info', `📢 New Announcement from ${req.worker.name}`,
          truncated, '/messages', req.worker.name
        ).catch(() => {});
      }
    }

    const [rows] = await pool.query(
      `SELECT m.*, w.name as creator_name, w.role as creator_role
       FROM messages m LEFT JOIN workers w ON m.created_by = w.id WHERE m.id=?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Messages] ❌ createMessage:', err.message);
    next(err);
  }
}

async function deleteMessage(req, res, next) {
  try {
    const [existing] = await pool.query('SELECT * FROM messages WHERE id=?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Message not found' });

    // Only creator or owner can delete
    if (existing[0].created_by !== req.worker.id && req.worker.role !== 'owner') {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    await pool.query('DELETE FROM messages WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Messages] ❌ deleteMessage:', err.message);
    next(err);
  }
}

module.exports = { getMessages, createMessage, deleteMessage };
