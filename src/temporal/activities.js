// src/temporal/activities.js
//
// Activities are the individual steps in the MFA login workflow.
// Each one does real work (database calls, sending PINs) and can
// be retried automatically by Temporal if it fails.
//
// Activities run in the Worker process — they have full access to
// Node.js APIs, the database, notifier, etc.

const { generatePin, cleanupExpired } = require('../pinService');
const { getUserById } = require('../users');
const { sendPin } = require('../notifier');
const db = require('../db');

const PIN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generates a PIN, stores it in SQLite, and delivers it to the user.
 * Returns the loginId (the database row id) so the workflow can
 * pass it to the client and later look it up during verification.
 */
async function generateAndSendPin(userId) {
  const user = getUserById(userId);
  if (!user) throw new Error(`No user found with id ${userId}`);

  const pin = generatePin();
  const now = Date.now();
  const expiresAt = now + PIN_EXPIRY_MS;

  const result = db.prepare(`
    INSERT INTO pending_logins (user_id, pin, created_at, expires_at, attempts)
    VALUES (?, ?, ?, ?, 0)
  `).run(userId, pin, now, expiresAt);

  const loginId = result.lastInsertRowid;

  console.log(`[temporal/activity] PIN generated for user ${userId}, loginId ${loginId}`);
  sendPin(user, pin);

  return { loginId, expiresAt };
}

/**
 * Checks a submitted PIN against the stored one.
 * Returns a result object with success flag and reason.
 * Same logic as verifyPin() in pinService.js, just as a Temporal activity.
 */
async function checkPin(loginId, submittedPin) {
  const row = db.prepare('SELECT * FROM pending_logins WHERE id = ?').get(loginId);

  if (!row) return { success: false, reason: 'NOT_FOUND' };

  const now = Date.now();

  if (now > row.expires_at) {
    db.prepare('DELETE FROM pending_logins WHERE id = ?').run(loginId);
    return { success: false, reason: 'EXPIRED' };
  }

  if (row.pin === submittedPin) {
    db.prepare('DELETE FROM pending_logins WHERE id = ?').run(loginId);
    console.log(`[temporal/activity] Login ${loginId} verified successfully`);
    return { success: true };
  }

  const newAttempts = row.attempts + 1;
  if (newAttempts >= require('../pinService').MAX_ATTEMPTS) {
    db.prepare('DELETE FROM pending_logins WHERE id = ?').run(loginId);
    return { success: false, reason: 'MAX_ATTEMPTS_REACHED' };
  }

  db.prepare('UPDATE pending_logins SET attempts = ? WHERE id = ?').run(newAttempts, loginId);
  return { success: false, reason: 'WRONG_PIN' };
}

/**
 * Cleans up the pending login row if the workflow times out or is cancelled
 * before the user ever verified — so we don't leave orphaned rows.
 */
async function cancelPendingLogin(loginId) {
  db.prepare('DELETE FROM pending_logins WHERE id = ?').run(loginId);
  console.log(`[temporal/activity] Cancelled pending login ${loginId}`);
}

module.exports = { generateAndSendPin, checkPin, cancelPendingLogin };