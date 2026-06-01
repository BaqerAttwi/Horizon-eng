const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'elec-app-secret-change-in-production';

function requireAuth(req, res, next) {
  // Check HttpOnly cookie first, then Authorization header
  const token = req.cookies?.token || (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7) : null);
  if (!token) {
    console.log('[Auth] ❌ No token on', req.method, req.path);
    return res.status(401).json({ error: 'Authentication required — please log in' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.worker = decoded;
    console.log(`[Auth] ✅ "${decoded.name}" role:${decoded.role} → ${req.method} ${req.path}`);
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
