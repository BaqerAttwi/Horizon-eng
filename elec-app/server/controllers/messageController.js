const pool = require('../db/connection');

async function getMessages(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT m.*, w.name as creator_name, w.role as creator_role
       FROM messages m
       LEFT JOIN workers w ON m.created_by = w.id
       ORDER BY m.created_at DESC`
    );
    res.json(rows);
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

    // Notify all users
    const { notifyOwners, createNotification } = require('./notificationController');
    const [allWorkers] = await pool.query('SELECT id FROM workers');
    for (const w of allWorkers) {
      await createNotification(w.id, 'info', 'New Announcement',
        `${req.worker.name} posted: ${content.substring(0, 80)}${content.length > 80 ? '...' : ''}`,
        '/messages'
      );
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
