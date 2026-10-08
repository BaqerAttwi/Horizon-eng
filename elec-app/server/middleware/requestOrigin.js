function requestOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.headers.origin) return next();
  const allowed = new Set([
    process.env.CLIENT_URL || 'http://localhost:5173',
    process.env.SERVER_URL,
    `${req.protocol}://${req.headers.host}`,
  ].filter(Boolean).map(value => { try { return new URL(value).origin; } catch { return ''; } }));
  if (!allowed.has(req.headers.origin)) return res.status(403).json({ error: 'Request origin is not allowed' });
  next();
}

module.exports = { requestOrigin };
