const crypto = require('crypto');
const oneDrive = require('../utils/oneDrive');

// In-memory CSRF nonce for the connect → callback round trip. Single-process
// deployment, short TTL — losing it on a restart just means re-clicking
// "Connect OneDrive", nothing more.
const pendingStates = new Map(); // state -> { workerId, expiresAt }

function redirectUri() {
  const base = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${base}/api/onedrive/callback`;
}

function cleanupExpiredStates() {
  const now = Date.now();
  for (const [state, entry] of pendingStates) {
    if (entry.expiresAt < now) pendingStates.delete(state);
  }
}

async function connect(req, res, next) {
  try {
    if (!oneDrive.isConfigured()) {
      return res.status(400).json({ error: 'OneDrive is not configured on the server yet — MS_CLIENT_ID/MS_CLIENT_SECRET are missing' });
    }
    cleanupExpiredStates();
    const state = crypto.randomBytes(24).toString('hex');
    pendingStates.set(state, { workerId: req.worker.id, expiresAt: Date.now() + 10 * 60 * 1000 });
    res.redirect(oneDrive.getAuthUrl(redirectUri(), state));
  } catch (err) { next(err); }
}

async function callback(req, res, next) {
  try {
    const { code, state, error, error_description } = req.query;
    if (error) {
      return res.redirect(`/dashboard?onedrive=error&message=${encodeURIComponent(error_description || error)}`);
    }
    const entry = pendingStates.get(state);
    if (!entry || entry.expiresAt < Date.now() || entry.workerId !== req.worker?.id) {
      return res.redirect('/dashboard?onedrive=error&message=' + encodeURIComponent('Connection request expired — please try again'));
    }
    pendingStates.delete(state);

    const tokens = await oneDrive.exchangeCodeForTokens(code, redirectUri());

    // Fetch the connected account's email for display purposes.
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const me = meRes.ok ? await meRes.json() : {};
    const accountEmail = me.mail || me.userPrincipalName || null;

    await oneDrive.saveTokens(tokens, accountEmail, req.worker.id);

    res.redirect('/dashboard?onedrive=connected');
  } catch (err) {
    console.error('[OneDrive] ❌ callback:', err.message);
    res.redirect('/dashboard?onedrive=error&message=' + encodeURIComponent(err.message));
  }
}

async function status(req, res, next) {
  try {
    if (!oneDrive.isConfigured()) return res.json({ configured: false, connected: false });
    const s = await oneDrive.getConnectionStatus();
    res.json({ configured: true, ...s });
  } catch (err) { next(err); }
}

async function disconnectHandler(req, res, next) {
  try {
    await oneDrive.disconnect();
    res.json({ message: 'OneDrive disconnected' });
  } catch (err) { next(err); }
}

module.exports = { connect, callback, status, disconnect: disconnectHandler };
