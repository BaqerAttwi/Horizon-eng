const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../db/connection');

const JWT_SECRET  = process.env.JWT_SECRET || (() => {
  console.warn('\x1b[33m[SECURITY] ⚠️ JWT_SECRET not set in .env — using insecure fallback. Set JWT_SECRET in .env for production.\x1b[0m');
  return 'elec-app-secret-change-in-production';
})();
const JWT_EXPIRES = '12h'; // session lasts 12 hours

/**
 * Role permissions — what each role can access
 */
const ROLE_PERMISSIONS = {
  owner:      ['products','upload','projects','workers','clients','reservations','reports','discounts','requests','analytics','price-changes','item-groups','messages'],
  accounting: ['products','projects','clients','reservations','reports'],
  engineer:   ['products','projects','reservations','requests','item-groups','messages','clients'],
  secretary:  ['products','clients','reservations','messages'],
};

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { token, worker: { id, name, role, permissions } }
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find worker by email
    const [rows] = await db.execute(
      'SELECT * FROM workers WHERE email = ?', [email.trim().toLowerCase()]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const worker = rows[0];

    // Compare password
    const valid = await bcrypt.compare(password, worker.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Build JWT payload
    const payload = {
      id:   worker.id,
      name: worker.name,
      role: worker.role,
      permissions: ROLE_PERMISSIONS[worker.role] || [],
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    // Set HttpOnly cookie (secure in production)
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000, // 12 hours
    });

    res.json({
      token,
      worker: {
        id:          worker.id,
        name:        worker.name,
        email:       worker.email,
        role:        worker.role,
        permissions: payload.permissions,
      },
    });
  } catch (err) {
    console.error('[Auth] ❌ Login error:', err.message);
    next(err);
  }
}

/**
 * POST /api/auth/register  (owner only — protected by middleware)
 * Creates a new worker with hashed password
 */
async function register(req, res, next) {
  try {
    const { name, email, phone, role, password } = req.body;

    if (!name || !email || !role || !password) {
      return res.status(400).json({ error: 'name, email, role, password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const validRoles = ['owner','accounting','engineer','secretary'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check email unique
    const [existing] = await db.execute(
      'SELECT id FROM workers WHERE email=?', [email.trim().toLowerCase()]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      'INSERT INTO workers(name,email,phone,role,password_hash) VALUES(?,?,?,?,?)',
      [name, email.trim().toLowerCase(), phone||null, role, hash]
    );

    const [rows] = await db.execute(
      'SELECT id,name,email,phone,role,created_at FROM workers WHERE id=?',
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Auth] ❌ Register error:', err.message);
    next(err);
  }
}

/**
 * POST /api/auth/change-password
 * Body: { current_password, new_password }
 * Worker can only change their own password
 */
async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;
    const workerId = req.worker.id; // set by auth middleware

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'current_password and new_password required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const [rows] = await db.execute('SELECT * FROM workers WHERE id=?', [workerId]);
    if (!rows.length) return res.status(404).json({ error: 'Worker not found' });

    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is wrong' });

    const hash = await bcrypt.hash(new_password, 10);
    await db.execute('UPDATE workers SET password_hash=? WHERE id=?', [hash, workerId]);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('[Auth] ❌ changePassword:', err.message);
    next(err);
  }
}

/**
 * POST /api/auth/set-password  (owner only)
 * Reset any worker's password without knowing current
 */
async function setPassword(req, res, next) {
  try {
    const { worker_id, new_password } = req.body;
    if (!worker_id || !new_password) {
      return res.status(400).json({ error: 'worker_id and new_password required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const hash = await bcrypt.hash(new_password, 10);
    await db.execute('UPDATE workers SET password_hash=? WHERE id=?', [hash, worker_id]);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('[Auth] ❌ setPassword:', err.message);
    next(err);
  }
}

/**
 * GET /api/auth/me  — verify token and return current worker info
 */
async function logout(req, res, next) {
  try {
    res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
    res.json({ message: 'Logged out' });
  } catch (err) { next(err); }
}

async function me(req, res, next) {
  try {
    const [rows] = await db.execute('SELECT id, name, email, role, created_at FROM workers WHERE id=?', [req.worker.id]);
    if (!rows.length) return res.status(404).json({ error: 'Worker not found' });
    const w = rows[0];
    res.json({
      id:          w.id,
      name:        w.name,
      email:       w.email,
      role:        w.role,
      permissions: req.worker.permissions,
    });
  } catch (err) { next(err); }
}

module.exports = { login, register, changePassword, setPassword, logout, me, ROLE_PERMISSIONS };
