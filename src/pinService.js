// src/pinService.js
//
// The core business logic of the MFA flow:
//   - generate a 6-digit PIN and store it with a 5-minute expiry
//   - validate a submitted PIN against the stored one
//   - enforce a max-attempts cap
//   - clean up expired/used rows
//
// This file is intentionally the most heavily tested part of the project,
// since it's the actual "business logic" the bootcamp brief asks for.

const db = require('./db');
const { sendPin } = require('./notifier');
const { getUserById } = require('./users');

const PIN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;

/**
 * Generates a random 6-digit PIN as a zero-padded string,
 * e.g. "004821" instead of just 4821.
 */
function generatePin() {
  const num = Math.floor(Math.random() * 1_000_000); // 0 to 999999
  return String(num).padStart(6, '0');
}

/**
 * Starts a new login attempt for a given user:
 *   - generates a fresh PIN
 *   - stores it in pending_logins with a 5-minute expiry
 *   - "sends" it via the notifier
 *
 * Returns the id of the pending_logins row (the "login attempt id"),
 * which the client will need to reference when submitting the PIN.
 */
function startLogin(userId) {
  const user = getUserById(userId);

  if (!user) {
    throw new Error(`No user found with id ${userId}`);
  }

  const pin = generatePin();
  const now = Date.now();
  const expiresAt = now + PIN_EXPIRY_MS;

  const insert = db.prepare(`
    INSERT INTO pending_logins (user_id, pin, created_at, expires_at, attempts)
    VALUES (?, ?, ?, ?, 0)
  `);

  const result = insert.run(userId, pin, now, expiresAt);

  console.log(
    `[pinService] Generated PIN for user ${userId} (login attempt ${result.lastInsertRowid}), expires at ${new Date(expiresAt).toISOString()}`
  );

  sendPin(user, pin);

  return result.lastInsertRowid;
}

/**
 * Validates a submitted PIN against a pending login attempt.
 *
 * @param {number} loginId - the id returned by startLogin()
 * @param {string} submittedPin - what the user typed in
 * @returns {{ success: boolean, reason?: string }}
 */
function verifyPin(loginId, submittedPin) {
  const row = db.prepare('SELECT * FROM pending_logins WHERE id = ?').get(loginId);

  if (!row) {
    console.log(`[pinService] Verify failed: no pending login with id ${loginId}`);
    return { success: false, reason: 'NOT_FOUND' };
  }

  const now = Date.now();

  // Expired — reject and clean up regardless of whether the PIN was right.
  if (now > row.expires_at) {
    db.prepare('DELETE FROM pending_logins WHERE id = ?').run(loginId);
    console.log(`[pinService] Verify failed: login ${loginId} expired, row cleaned up`);
    return { success: false, reason: 'EXPIRED' };
  }

  // Correct PIN — success, clean up the row so it can't be reused.
  if (row.pin === submittedPin) {
    db.prepare('DELETE FROM pending_logins WHERE id = ?').run(loginId);
    console.log(`[pinService] Login ${loginId} succeeded for user ${row.user_id}`);
    return { success: true };
  }

  // Wrong PIN — increment attempts, cap at MAX_ATTEMPTS.
  const newAttempts = row.attempts + 1;

  if (newAttempts >= MAX_ATTEMPTS) {
    db.prepare('DELETE FROM pending_logins WHERE id = ?').run(loginId);
    console.log(`[pinService] Login ${loginId} locked out after ${newAttempts} failed attempts, row cleaned up`);
    return { success: false, reason: 'MAX_ATTEMPTS_REACHED' };
  }

  db.prepare('UPDATE pending_logins SET attempts = ? WHERE id = ?').run(newAttempts, loginId);
  console.log(`[pinService] Wrong PIN for login ${loginId}, attempt ${newAttempts}/${MAX_ATTEMPTS}`);
  return { success: false, reason: 'WRONG_PIN' };
}

/**
 * Sweeps the pending_logins table and deletes any rows whose expiry
 * has already passed. This is the "cleanup mechanism" the brief asks for,
 * separate from the check-on-read cleanup that happens inside verifyPin().
 *
 * Returns how many rows were deleted, mainly so callers/tests can confirm
 * it actually did something.
 */
function cleanupExpired() {
  const now = Date.now();
  const result = db.prepare('DELETE FROM pending_logins WHERE expires_at < ?').run(now);

  if (result.changes > 0) {
    console.log(`[pinService] Cleanup swept ${result.changes} expired row(s)`);
  }

  return result.changes;
}

/**
 * Returns all currently pending login rows — useful for demonstrating
 * the "orphaned rows after restart" failure mode, and for debugging.
 */
function getAllPendingLogins() {
  return db.prepare('SELECT * FROM pending_logins').all();
}

module.exports = {
  generatePin,
  startLogin,
  verifyPin,
  cleanupExpired,
  getAllPendingLogins,
  PIN_EXPIRY_MS,
  MAX_ATTEMPTS,
};