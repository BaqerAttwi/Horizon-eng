const jwt = require('jsonwebtoken');
const db = require('../db/connection');
const { JWT_SECRET } = require('../controllers/authController');

async function requireAuth(req, res, next) {
  // Check HttpOnly cookie first, then Authorization header
  const token = req.cookies?.token || (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7) : null);
  if (!token) {
    console.log('[Auth] ❌ No token on', req.method, req.path);
    return res.status(401).json({ error: 'Authentication required — please log in' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // A valid JWT can still reference a worker who no longer exists (deleted
    // account, or a DB reset/reimport) — every FK write that uses
    // req.worker.id (completed_by, performed_by, assigned_by, ...) would
    // otherwise crash with a raw foreign-key violation instead of a clean
    // "please log in again".
    const [[worker]] = await db.execute('SELECT id FROM workers WHERE id=?', [decoded.id]);
    if (!worker) {
      console.log('[Auth] ❌ Token references a worker that no longer exists:', decoded.id);
      return res.status(401).json({ error: 'Session expired — please log in again' });
    }
    req.worker = decoded;
    next();
  } catch (err) {
    console.log('[Auth] ❌ Token error:', err.message);
    return res.status(401).json({ error: 'Session expired — please log in again' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.worker?.role)) {
      console.log(`[Auth] 🚫 Role "${req.worker?.role}" denied on ${req.method} ${req.path}`);
      return res.status(403).json({ error: `Access denied — requires: ${roles.join(' or ')}` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
