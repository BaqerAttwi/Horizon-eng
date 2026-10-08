const crypto = require('crypto');

function canManageAccount(actor, targetRole, newRole = targetRole) {
  return actor === 'owner' || (actor === 'head_engineer' && targetRole !== 'owner' && newRole !== 'owner');
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 6 && Buffer.byteLength(value, 'utf8') <= 72;
}

function passwordFingerprint(hash) {
  return crypto.createHash('sha256').update(hash || '').digest('hex');
}

const secureCookie = () => process.env.COOKIE_SECURE === 'true' ||
  (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false');

module.exports = { canManageAccount, validPassword, passwordFingerprint, secureCookie };
