const db = require('../db/connection');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

async function uploadAttachment(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { projectId } = req.params;
    const panelId = req.body.panel_id || null;
    const userId = req.worker.id;

    ensureDir();

    const ext = path.extname(req.file.originalname);
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filePath = path.join(UPLOAD_DIR, safeName);

    fs.writeFileSync(filePath, req.file.buffer);

    const [result] = await db.execute(
      `INSERT INTO attachments (project_id, panel_id, file_name, stored_name, file_size, mime_type, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [projectId, panelId, req.file.originalname, safeName, req.file.size, req.file.mimetype, userId]
    );

    const [[attachment]] = await db.execute(
      `SELECT a.*, w.name as uploader_name
       FROM attachments a
       LEFT JOIN workers w ON w.id = a.uploaded_by
       WHERE a.id = ?`,
      [result.insertId]
    );

    res.status(201).json(attachment);
  } catch (err) {
    next(err);
  }
}

async function getAttachments(req, res, next) {
  try {
    const { projectId } = req.params;

    const [attachments] = await db.execute(
      `SELECT a.*, w.name as uploader_name
       FROM attachments a
       LEFT JOIN workers w ON w.id = a.uploaded_by
       WHERE a.project_id = ?
       ORDER BY a.created_at DESC`,
      [projectId]
    );

    res.json(attachments);
  } catch (err) {
    next(err);
  }
}

async function downloadAttachment(req, res, next) {
  try {
    const { attachmentId } = req.params;

    const [[attachment]] = await db.execute('SELECT * FROM attachments WHERE id = ?', [attachmentId]);
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

    const filePath = path.join(UPLOAD_DIR, attachment.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

    res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
    res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
}

async function deleteAttachment(req, res, next) {
  try {
    const { attachmentId } = req.params;

    const [[attachment]] = await db.execute('SELECT * FROM attachments WHERE id = ?', [attachmentId]);
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

    const filePath = path.join(UPLOAD_DIR, attachment.stored_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await db.execute('DELETE FROM attachments WHERE id = ?', [attachmentId]);
    res.json({ message: 'Attachment deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadAttachment, getAttachments, downloadAttachment, deleteAttachment };
