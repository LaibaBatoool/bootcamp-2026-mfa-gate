// src/users.js
//
// A small "user store" built on top of our SQLite users table.
// Provides helpers to seed mock users and look them up by id.
//
// In a real app, users would register through a proper signup flow.
// Here we just seed a couple of fixed users so we have someone to log in as.

const db = require('./db');

/**
 * Seeds the users table with mock users, but only if it's empty.
 * Safe to call every time the server starts.
 */
function seedUsers() {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get();

  if (existing.count > 0) {
    console.log(`[users] ${existing.count} user(s) already seeded, skipping.`);
    return;
  }

  const insert = db.prepare(`
    INSERT INTO users (name, phone, email, totp_secret)
    VALUES (@name, @phone, @email, @totp_secret)
  `);

  const mockUsers = [
    {
      name: 'Laiba Batool',
      phone: '+92-300-0000001',
      email: 'laiba@example.com',
      totp_secret: null, // filled in later when TOTP is set up
    },
    {
      name: 'Ali Khan',
      phone: '+92-300-0000002',
      email: 'ali@example.com',
      totp_secret: null,
    },
  ];

  for (const user of mockUsers) {
    insert.run(user);
  }

  console.log(`[users] Seeded ${mockUsers.length} mock user(s).`);
}

/**
 * Fetches a single user by their id.
 * Returns undefined if no such user exists.
 */
function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

/**
 * Fetches all users — mainly useful for a quick CLI listing
 * so you can see valid user ids to log in as.
 */
function getAllUsers() {
  return db.prepare('SELECT id, name, phone, email FROM users').all();
}

/**
 * Saves a TOTP secret against a user (used once we build the QR bonus).
 */
function setTotpSecret(userId, secret) {
  db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, userId);
}

module.exports = {
  seedUsers,
  getUserById,
  getAllUsers,
  setTotpSecret,
};