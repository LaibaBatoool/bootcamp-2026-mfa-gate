// src/server.js
//
// Entry point for the MFA Gate API. Wires together the login and verify
// routes, seeds mock users on startup, and starts a periodic cleanup
// sweep for expired PIN rows.

const express = require('express');
const { seedUsers } = require('./users');
const { cleanupExpired } = require('./pinService');
const loginRoute = require('./routes/login');
const verifyRoute = require('./routes/verify');

const PORT = process.env.PORT || 3000;
const CLEANUP_INTERVAL_MS = 60 * 1000; // sweep every 60 seconds

const app = express();
app.use(express.json());

// Make sure our mock users exist before accepting any requests.
seedUsers();

app.use('/login', loginRoute);
app.use('/verify', verifyRoute);

// Simple health check, useful for confirming the server is up.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Background sweep job — the standalone "cleanup mechanism" required
// by the brief, independent of the check-on-read cleanup inside verifyPin().
setInterval(() => {
  cleanupExpired();
}, CLEANUP_INTERVAL_MS);

app.listen(PORT, () => {
  console.log(`[server] MFA Gate API listening on http://localhost:${PORT}`);
});

module.exports = app;