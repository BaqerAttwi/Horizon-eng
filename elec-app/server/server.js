require('dotenv').config();
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const cookieParser = require('cookie-parser');
const routes  = require('./routes');
const { runNotificationChecks } = require('./controllers/notificationController');
const { initMailer } = require('./utils/emailService');

const app  = express();
const PORT = process.env.PORT || 5000;

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

app.use((err, req, res, _next) => {
  console.error('[Server] 💥', err.message, err.stack);
  const status = err.status || 500;
  const message = status >= 500 ? 'Internal server error' : err.message;
  res.status(status).json({ error: message });
});

const bcrypt = require('bcryptjs');
const db     = require('./db/connection');

async function ensureOwner() {
  try {
    const [rows] = await db.execute("SELECT id, password_hash FROM workers WHERE role='owner' LIMIT 1");
    if (!rows.length) {
      const defaultPw = process.env.OWNER_PASSWORD || 'admin123';
      const hash = await bcrypt.hash(defaultPw, 10);
      await db.execute(
        "INSERT INTO workers (id, name, email, phone, role, password_hash) VALUES (1, 'Admin', 'admin@company.com', '', 'owner', ?)",
        [hash]
      );
      console.log(`[Auth] ✅ Owner created. Email: admin@company.com / Password: ${defaultPw}`);
    } else if (process.env.OWNER_PASSWORD) {
      // Only sync if OWNER_PASSWORD is explicitly set in .env
      const hash = await bcrypt.hash(process.env.OWNER_PASSWORD, 10);
      await db.execute("UPDATE workers SET name='Admin', email='admin@company.com', password_hash=? WHERE id=?", [hash, rows[0].id]);
      console.log(`[Auth] ✅ Owner password synced. Email: admin@company.com`);
    } else {
      console.log(`[Auth] ✅ Owner exists. Use OWNER_PASSWORD in .env to sync password on startup.`);
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

  // Run notification checks on startup
  runNotificationChecks();

  // Run checks every 6 hours
  setInterval(runNotificationChecks, 6 * 60 * 60 * 1000);
});
server.timeout = 600000;
