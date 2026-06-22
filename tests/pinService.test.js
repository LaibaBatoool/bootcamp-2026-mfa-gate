// tests/pinService.test.js
// Tests the core MFA business logic: PIN generation, successful verify,
// wrong-PIN handling, attempt lockout, and expiry.
//
// IMPORTANT: DB_PATH is set to an in-memory SQLite database (see below)
// so these tests never touch your real local mfa.db file.

process.env.DB_PATH = ':memory:';

const db = require('../src/db');
const { seedUsers } = require('../src/users');
const {
  generatePin,
  startLogin,
  verifyPin,
  cleanupExpired,
  getAllPendingLogins,
  MAX_ATTEMPTS,
} = require('../src/pinService');

// Seed mock users once before any test runs, since startLogin() needs
// a real user to exist.
beforeAll(() => {
  seedUsers();
});

// Clear out any pending_logins rows between tests so each test starts
// with a clean slate, without needing to re-seed users every time.
beforeEach(() => {
  db.prepare('DELETE FROM pending_logins').run();
});

describe('generatePin', () => {
  test('returns a 6-character numeric string', () => {
    const pin = generatePin();
    expect(pin).toMatch(/^\d{6}$/);
  });

  test('zero-pads short numbers correctly', () => {
    // Force Math.random to return a value that maps to a small number,
    // to confirm padding works (e.g. 42 -> "000042").
    const originalRandom = Math.random;
    Math.random = () => 0.000042;

    const pin = generatePin();
    expect(pin).toHaveLength(6);

    Math.random = originalRandom;
  });
});

describe('startLogin', () => {
  test('creates a pending_logins row with correct shape', () => {
    const loginId = startLogin(1);
    const rows = getAllPendingLogins();

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(loginId);
    expect(rows[0].user_id).toBe(1);
    expect(rows[0].pin).toMatch(/^\d{6}$/);
    expect(rows[0].attempts).toBe(0);
    expect(rows[0].expires_at).toBeGreaterThan(rows[0].created_at);
  });

  test('throws for a non-existent user', () => {
    expect(() => startLogin(9999)).toThrow(/No user found/);
  });
});

describe('verifyPin', () => {
  test('succeeds with the correct PIN and deletes the row', () => {
    const loginId = startLogin(1);
    const row = db.prepare('SELECT * FROM pending_logins WHERE id = ?').get(loginId);

    const result = verifyPin(loginId, row.pin);

    expect(result).toEqual({ success: true });
    expect(getAllPendingLogins()).toHaveLength(0);
  });

  test('fails with the wrong PIN but allows retry', () => {
    const loginId = startLogin(1);

    const result = verifyPin(loginId, '000000');

    expect(result).toEqual({ success: false, reason: 'WRONG_PIN' });
    // Row should still exist since we haven't hit the attempt cap.
    expect(getAllPendingLogins()).toHaveLength(1);
  });

  test('locks out and deletes the row after MAX_ATTEMPTS wrong tries', () => {
    const loginId = startLogin(1);

    let lastResult;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      lastResult = verifyPin(loginId, '000000');
    }

    expect(lastResult).toEqual({ success: false, reason: 'MAX_ATTEMPTS_REACHED' });
    expect(getAllPendingLogins()).toHaveLength(0);
  });

  test('returns NOT_FOUND for an unknown loginId', () => {
    const result = verifyPin(999999, '123456');
    expect(result).toEqual({ success: false, reason: 'NOT_FOUND' });
  });

  test('returns EXPIRED and cleans up the row when expiry has passed', () => {
    const loginId = startLogin(1);

    // Manually force this row's expiry into the past, simulating
    // 5 minutes having elapsed without needing to actually wait.
    db.prepare('UPDATE pending_logins SET expires_at = ? WHERE id = ?').run(
      Date.now() - 1000,
      loginId
    );

    const row = db.prepare('SELECT * FROM pending_logins WHERE id = ?').get(loginId);
    const result = verifyPin(loginId, row.pin);

    expect(result).toEqual({ success: false, reason: 'EXPIRED' });
    expect(getAllPendingLogins()).toHaveLength(0);
  });
});

describe('cleanupExpired', () => {
  test('removes only expired rows, leaves valid ones alone', () => {
    const validLoginId = startLogin(1);
    const expiredLoginId = startLogin(2);

    db.prepare('UPDATE pending_logins SET expires_at = ? WHERE id = ?').run(
      Date.now() - 1000,
      expiredLoginId
    );

    const deletedCount = cleanupExpired();

    expect(deletedCount).toBe(1);

    const remaining = getAllPendingLogins();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(validLoginId);
  });

  test('returns 0 when nothing is expired', () => {
    startLogin(1);
    const deletedCount = cleanupExpired();
    expect(deletedCount).toBe(0);
  });
});