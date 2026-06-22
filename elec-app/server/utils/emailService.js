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

function emailTemplate(title, message, link, senderName) {
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

async function sendEmail({ to, subject, text, html }) {
  if (!resend) {
    console.log('[Mail] ⏭️ Skipped (Resend not initialized):', to, subject);
    return;
  }

  try {
    await resend.emails.send({
      from: fromAddr(),
      to,
      subject,
      text,
      html,
    });
    console.log('[Mail] ✅ Sent to:', to, '—', subject);
  } catch (err) {
    console.error('[Mail] ❌ Failed to send to', to, ':', err.message);
  }
}

async function notifyByEmail(worker, type, title, message, link, senderName) {
  if (!worker.email) return;

  await sendEmail({
    to: worker.email,
    subject: `[Horizon CRM] ${title}`,
    text: `${message}\n\nView: ${link ? (process.env.CLIENT_URL || 'http://localhost:5173') + link : ''}`,
    html: emailTemplate(title, message, link, senderName),
  });
}

module.exports = { initMailer, sendEmail, notifyByEmail };
