require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const cookieParser = require('cookie-parser');
const routes  = require('./routes');
const { runNotificationChecks } = require('./controllers/notificationController');
const { initMailer } = require('./utils/emailService');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

app.use('/api', routes);

app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));

app.use((err, req, res, _next) => {
  console.error('[Server] 💥', err.message, err.stack);
  const status = err.status || 500;
  const message = status >= 500 ? 'Internal server error' : err.message;
  res.status(status).json({ error: message });
});

const server = app.listen(PORT, () => {
  console.log(`[Server] ✅ Running on http://localhost:${PORT}`);

  // Initialize email service
  initMailer();

  // Run notification checks on startup
  runNotificationChecks();

  // Run checks every 6 hours
  setInterval(runNotificationChecks, 6 * 60 * 60 * 1000);
});
server.timeout = 600000;
