// src/db.js
//
// Sets up our SQLite connection and defines the two tables we need:
//   - users: our mock registered users (with phone/email + TOTP secret)
//   - pending_logins: temporary rows tracking an in-flight PIN login attempt
//
// better-sqlite3 is synchronous (no callbacks/promises needed for queries),
// which keeps this small project simple to reason about.

const Database = require('better-sqlite3');
const path = require('path');

// Tests set DB_PATH (via env var) to an in-memory database so they never
// touch or pollute your real local mfa.db file.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'mfa.db');
const db = new Database(DB_PATH);

// Improves write reliability if the process crashes mid-write —
// relevant later when we deliberately demonstrate the restart failure mode.
db.pragma('journal_mode = WAL');

// --- Schema setup ---
// We use `CREATE TABLE IF NOT EXISTS` so this file is safe to run every
// time the server starts, without wiping existing data.

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    totp_secret TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS pending_logins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    pin TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users (id)
  );
`);

module.exports = db;