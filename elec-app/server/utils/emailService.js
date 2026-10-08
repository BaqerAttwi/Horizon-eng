const { Resend } = require('resend');

let resend = null;

function initMailer() {
  if (resend) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[Mail] ⚠️ RESEND_API_KEY not configured — email notifications disabled');
    return;
  }

  resend = new Resend(apiKey);
  console.log('[Mail] ✅ Resend initialized');
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function emailTemplate(title, message, link, senderName) {
  title = escapeHtml(title);
  message = escapeHtml(message).replace(/\r?\n/g, '<br>');
  senderName = senderName ? escapeHtml(senderName) : '';
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const url = link ? `${baseUrl}${link}` : baseUrl;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0eb;padding:30px 10px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <tr>
          <td style="background:#d4a853;padding:24px 32px;text-align:center">
            <img src="http://hps-leb.com/wp-content/uploads/2026/02/Horizon-Logo-New.png" alt="Horizonlb" style="height:48px;width:auto;margin-bottom:4px">
            <h1 style="margin:4px 0 0;color:#fff;font-size:20px;font-weight:700;letter-spacing:1px">HORIZON CRM</h1>
            <p style="margin:2px 0 0;color:rgba(255,255,255,.7);font-size:12px">Electrical Contracting</p>
          </td>
        </tr>
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px">${title}</h2>
          <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6">${message}</p>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#1a5fa8;border-radius:6px;padding:0">
                <a href="${url}" style="display:inline-block;padding:12px 28px;color:#fff;font-size:14px;font-weight:600;text-decoration:none">Open in App →</a>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center">
            <p style="margin:0;color:#94a3b8;font-size:11px">${senderName ? `Sent by ${senderName} · ` : ''}Horizonlb &mdash; Electrical Contracting</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}

const fromAddr = () => process.env.EMAIL_FROM || 'noreply@app.hps-leb.com';

const db = require('../db/connection');
let processing = false;
const MAX_ATTEMPTS = 6;

async function sendEmail({ to, subject, text, html, userId = null, projectId = null }) {
  const [result] = await db.execute(`INSERT INTO email_deliveries(user_id,project_id,recipient,subject,text_body,html_body)
    VALUES(?,?,?,?,?,?)`, [userId, projectId, to, subject, text, html]);
  return { id: result.insertId, status: 'queued' };
}

async function processEmailQueue() {
  if (processing) return;
  processing = true;
  let connection;
  try {
    initMailer();
    if (!resend) {
      await db.execute("UPDATE email_deliveries SET last_error='Email service is not configured' WHERE status='queued'");
      return;
    }
    connection = await db.getConnection();
    const [[lock]] = await connection.execute("SELECT GET_LOCK('email-delivery-worker',0) acquired");
    if (!lock.acquired) return;
    // Recover work interrupted by a server restart. Reuse the same provider key.
    await connection.execute("UPDATE email_deliveries SET status='queued' WHERE status='sending'");
    const [rows] = await connection.execute("SELECT * FROM email_deliveries WHERE status='queued' AND next_attempt_at<=NOW() ORDER BY id LIMIT 20");
    for (const row of rows) {
      await connection.execute("UPDATE email_deliveries SET status='sending',attempts=attempts+1 WHERE id=?", [row.id]);
      try {
        const result = await resend.emails.send({ from: fromAddr(), to: row.recipient, subject: row.subject,
          text: row.text_body, html: row.html_body }, { idempotencyKey: 'crm-email-' + row.id });
        if (result.error || !result.data?.id) throw new Error(result.error?.message || 'Email provider did not accept the message');
        await connection.execute("UPDATE email_deliveries SET status='accepted',provider_id=?,last_error=NULL,sent_at=NOW() WHERE id=?", [result.data.id,row.id]);
      } catch (error) {
        const attempts = row.attempts + 1;
        const delay = Math.min(3600, 60 * 2 ** (attempts - 1));
        await connection.execute(`UPDATE email_deliveries SET status=?,last_error=?,next_attempt_at=DATE_ADD(NOW(),INTERVAL ? SECOND) WHERE id=?`,
          [attempts >= MAX_ATTEMPTS ? 'failed' : 'queued', String(error.message).slice(0,1000),delay,row.id]);
      }
    }
  } catch (error) { console.error('[Email queue]', error.message); }
  finally {
    if (connection) {
      try { await connection.execute("SELECT RELEASE_LOCK('email-delivery-worker')"); } finally { connection.release(); }
    }
    processing = false;
  }
}

async function notifyByEmail(worker, type, title, message, link, senderName) {
  if (!worker.email) {
    await db.execute(`INSERT INTO email_deliveries(user_id,project_id,recipient,subject,text_body,html_body,status,last_error)
      VALUES(?,?,?,?,?,?,'failed','Recipient has no email address')`,
      [worker.id, /^\/projects\/(\d+)/.exec(link || '')?.[1] || null, '', '[Horizon CRM] ' + title, message, emailTemplate(title,message,link,senderName)]);
    return;
  }

  await sendEmail({
    to: worker.email,
    userId: worker.id,
    projectId: /^\/projects\/(\d+)/.exec(link || '')?.[1] || null,
    subject: `[Horizon CRM] ${title}`,
    text: `${message}\n\nView: ${link ? (process.env.CLIENT_URL || 'http://localhost:5173') + link : ''}`,
    html: emailTemplate(title, message, link, senderName),
  });
}

module.exports = { initMailer, sendEmail, notifyByEmail, processEmailQueue };
