const db = require('../db/connection');
const path = require('path');
const fs = require('fs');
const oneDrive = require('../utils/oneDrive');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

async function uploadAttachment(req, res, next) {
  try {
    const { projectId } = req.params;
    const { link_url, name } = req.body;
    const panelId = req.body.panel_id || null;
    const userId = req.worker.id;

    if (!link_url || !link_url.trim()) return res.status(400).json({ error: 'link_url is required' });
    try { new URL(link_url); } catch { return res.status(400).json({ error: 'That doesn\'t look like a valid URL' }); }

    const displayName = (name && name.trim()) || link_url;

    const [result] = await db.execute(
      `INSERT INTO attachments (project_id, panel_id, file_name, stored_name, file_size, mime_type, uploaded_by, storage, link_url)
       VALUES (?, ?, ?, NULL, 0, NULL, ?, 'link', ?)`,
      [projectId, panelId, displayName, userId, link_url.trim()]
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
    const { checkProjectAccess } = require('./crmController');
    const hasAccess = await checkProjectAccess(req, res, projectId);
    if (!hasAccess) return;

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
    const { checkProjectAccess } = require('./crmController');
    const hasAccess = await checkProjectAccess(req, res, attachment.project_id);
    if (!hasAccess) return;

    if (attachment.storage === 'link') {
      return res.redirect(attachment.link_url);
    }
    if (attachment.storage === 'onedrive') {
      const url = await oneDrive.getDownloadUrl(attachment.onedrive_item_id);
      return res.redirect(url);
    }

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
    const { checkProjectAccess } = require('./crmController');
    const hasAccess = await checkProjectAccess(req, res, attachment.project_id);
    if (!hasAccess) return;

    if (attachment.storage === 'onedrive') {
      await oneDrive.deleteFile(attachment.onedrive_item_id);
    } else if (attachment.storage === 'local') {
      const filePath = path.join(UPLOAD_DIR, attachment.stored_name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    // storage === 'link': nothing to clean up, just the DB row below

    await db.execute('DELETE FROM attachments WHERE id = ?', [attachmentId]);
    res.json({ message: 'Attachment deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadAttachment, getAttachments, downloadAttachment, deleteAttachment };
