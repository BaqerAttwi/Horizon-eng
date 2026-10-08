require('dotenv').config();
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const cookieParser = require('cookie-parser');
const routes  = require('./routes');
const { runNotificationChecks } = require('./controllers/notificationController');
const { initMailer, processEmailQueue } = require('./utils/emailService');

const app  = express();
const PORT = process.env.PORT || 5000;
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  if (!Number.isSafeInteger(hops) || hops < 1) throw new Error('TRUST_PROXY must be a positive proxy hop count');
  app.set('trust proxy', hops);
}

if (process.env.NODE_ENV === 'production') {
  const required = ['JWT_SECRET', 'OWNER_PASSWORD', 'DB_PASSWORD'];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }
}

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

// Serve built client in production
const path = require('path');
const clientBuild = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuild));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientBuild, 'index.html'), err => { if (err) next(); });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'This API feature could not be found. Refresh the page or contact your administrator.' }));
app.use(require('./middleware/errorHandler').errorHandler);

const bcrypt = require('bcryptjs');
const db     = require('./db/connection');

async function ensureOwner() {
  try {
    const [rows] = await db.execute("SELECT id, password_hash FROM workers WHERE role='owner' LIMIT 1");
    if (!rows.length) {
      const defaultPw = process.env.OWNER_PASSWORD;
      if (!require('./utils/accountSecurity').validPassword(defaultPw)) throw new Error('Set OWNER_PASSWORD to a password of 6 characters or more (at most 72 UTF-8 bytes) before creating the initial owner');
      const hash = await bcrypt.hash(defaultPw, 10);
      await db.execute(
        "INSERT INTO workers (name, email, phone, role, password_hash) VALUES ('Admin', 'admin@company.com', '', 'owner', ?)",
        [hash]
      );
      console.log('[Auth] ✅ Owner created. Email: admin@company.com');
    } else {
      console.log(`[Auth] ✅ Owner exists. Password resets are available in account management.`);
    }
  } catch (err) {
    console.error('[Auth] ❌ Failed to ensure owner account:', err.message);
  }
}

const server = app.listen(PORT, () => {
  console.log(`[Server] ✅ Running on http://localhost:${PORT}`);

  ensureOwner();

  // Initialize email service
  initMailer();
  processEmailQueue();
  setInterval(processEmailQueue, 30000).unref();

  // Run notification checks on startup
  runNotificationChecks();

  // Run checks every 6 hours
  setInterval(runNotificationChecks, 6 * 60 * 60 * 1000);
});
server.timeout = 600000;
