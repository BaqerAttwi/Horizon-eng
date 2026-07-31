// Uploads CRM attachments to a personal OneDrive account via Microsoft
// Graph, using delegated auth (authorization code + refresh token) — the
// account owner signs in once via /api/onedrive/connect, after which the
// server refreshes its own access token indefinitely without further
// interaction. Client-credentials (app-only) auth does NOT work for
// personal Microsoft accounts, which is why this is interactive-once
// rather than fully headless like a work/tenant account would allow.
//
// Env vars required: MS_CLIENT_ID, MS_CLIENT_SECRET
// Optional: ONEDRIVE_FOLDER (defaults to 'Horizon LB Attachments')

const db = require('../db/connection');

const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const FOLDER = process.env.ONEDRIVE_FOLDER || 'Horizon LB Attachments';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const AUTHORITY = 'https://login.microsoftonline.com/common';
// Both work/school and personal Microsoft accounts go through /common/.
const SCOPES = 'Files.ReadWrite offline_access User.Read';

function isConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

function getAuthUrl(redirectUri, state) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: SCOPES,
    state,
  });
  return `${AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function exchangeCodeForTokens(code, redirectUri) {
  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      scope: SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`OneDrive token exchange failed (${res.status}): ${await res.text()}`);
  return res.json(); // { access_token, refresh_token, expires_in, ... }
}

async function saveTokens(tokens, accountEmail, connectedBy) {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await db.execute(
    `INSERT INTO oauth_tokens (provider, account_email, refresh_token, access_token, expires_at, connected_by)
     VALUES ('onedrive', ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE account_email=VALUES(account_email), refresh_token=VALUES(refresh_token),
       access_token=VALUES(access_token), expires_at=VALUES(expires_at), connected_by=VALUES(connected_by)`,
    [accountEmail || null, tokens.refresh_token, tokens.access_token, expiresAt, connectedBy || null]
  );
  cachedToken = { token: tokens.access_token, expiresAt: expiresAt.getTime() };
}

async function getConnectionStatus() {
  const [[row]] = await db.execute(
    "SELECT account_email, updated_at FROM oauth_tokens WHERE provider='onedrive'"
  );
  return { connected: !!row, accountEmail: row?.account_email || null, connectedAt: row?.updated_at || null };
}

async function disconnect() {
  await db.execute("DELETE FROM oauth_tokens WHERE provider='onedrive'");
  cachedToken = null;
}

let cachedToken = null; // { token, expiresAt } — in-memory, avoids a refresh round-trip on every request

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.token;

  const [[row]] = await db.execute("SELECT refresh_token FROM oauth_tokens WHERE provider='onedrive'");
  if (!row) throw new Error('OneDrive is not connected — an owner needs to connect it once from the Files tab');

  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
      scope: SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`OneDrive token refresh failed (${res.status}): ${await res.text()}`);
  const data = await res.json();

  const expiresAt = Date.now() + data.expires_in * 1000;
  cachedToken = { token: data.access_token, expiresAt };
  // Microsoft often rotates the refresh token on use — persist the latest one.
  await db.execute(
    "UPDATE oauth_tokens SET refresh_token=?, access_token=?, expires_at=? WHERE provider='onedrive'",
    [data.refresh_token || row.refresh_token, data.access_token, new Date(expiresAt)]
  );
  return cachedToken.token;
}

// OneDrive path segments can't contain \ / : * ? " < > |
function sanitizePathSegment(name) {
  return name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

function driveRoot() {
  return `${GRAPH_BASE}/me/drive`;
}

// Upload via a session (works for any size, and lets us request
// conflictBehavior:'rename' so same-named files never silently overwrite
// each other — OneDrive auto-appends "(1)", "(2)", etc. instead).
async function uploadFile(buffer, fileName, mimeType) {
  const token = await getAccessToken();
  const safeFolder = sanitizePathSegment(FOLDER);
  const safeName = sanitizePathSegment(fileName);
  const itemPath = `${safeFolder}/${safeName}`;

  const sessionRes = await fetch(
    `${driveRoot()}/root:/${encodeURIComponent(itemPath)}:/createUploadSession`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename', name: safeName } }),
    }
  );
  if (!sessionRes.ok) throw new Error(`OneDrive session create failed (${sessionRes.status}): ${await sessionRes.text()}`);
  const { uploadUrl } = await sessionRes.json();

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(buffer.length),
      'Content-Range': `bytes 0-${buffer.length - 1}/${buffer.length}`,
    },
    body: buffer,
  });
  if (!uploadRes.ok) throw new Error(`OneDrive upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
  return uploadRes.json(); // driveItem: { id, name, webUrl, ... }
}

async function getDownloadUrl(itemId) {
  const token = await getAccessToken();
  const res = await fetch(
    `${driveRoot()}/items/${itemId}?select=id,%40microsoft.graph.downloadUrl`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`OneDrive fetch failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data['@microsoft.graph.downloadUrl'];
}

async function deleteFile(itemId) {
  const token = await getAccessToken();
  const res = await fetch(`${driveRoot()}/items/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`OneDrive delete failed (${res.status}): ${await res.text()}`);
}

module.exports = {
  isConfigured, getAuthUrl, exchangeCodeForTokens, saveTokens,
  getConnectionStatus, disconnect,
  uploadFile, getDownloadUrl, deleteFile, sanitizePathSegment,
};
