// tests/totpService.test.js
// Tests the TOTP (authenticator-app style) bonus flow: secret registration,
// QR code generation, and code verification — including failure cases.
//
// Uses an in-memory DB, same approach as pinService.test.js.

process.env.DB_PATH = ':memory:';

const db = require('../src/db');
const { seedUsers, getUserById } = require('../src/users');
const {
  registerTotp,
  generateQrCode,
  verifyTotp,
  getCurrentTotpForUser,
} = require('../src/totpService');

beforeAll(() => {
  seedUsers();
});

describe('registerTotp', () => {
  test('generates and saves a secret on the user record', () => {
    const secret = registerTotp(1);

    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(0);

    const user = getUserById(1);
    expect(user.totp_secret).toBe(secret);
  });

  test('throws for a non-existent user', () => {
    expect(() => registerTotp(9999)).toThrow(/No user found/);
  });
});

describe('generateQrCode', () => {
  test('returns a base64 PNG data URL once registered', async () => {
    registerTotp(1);

    const qr = await generateQrCode(1);

    expect(qr).toMatch(/^data:image\/png;base64,/);
    expect(qr.length).toBeGreaterThan(100);
  });

  test('rejects if the user has no TOTP secret yet', async () => {
    // User 2 hasn't called registerTotp in this test file's order of
    // execution at this point in a fresh DB — reset explicitly to be sure.
    db.prepare('UPDATE users SET totp_secret = NULL WHERE id = ?').run(2);

    await expect(generateQrCode(2)).rejects.toThrow(/no TOTP secret/);
  });
});

describe('verifyTotp', () => {
  test('succeeds with the current valid code', async () => {
    registerTotp(1);
    const code = await getCurrentTotpForUser(1);

    const isValid = await verifyTotp(1, code);

    expect(isValid).toBe(true);
  });

  test('fails with an incorrect code', async () => {
    registerTotp(1);

    const isValid = await verifyTotp(1, '000000');

    expect(isValid).toBe(false);
  });

  test('fails gracefully for a user with no secret registered', async () => {
    db.prepare('UPDATE users SET totp_secret = NULL WHERE id = ?').run(2);

    const isValid = await verifyTotp(2, '123456');

    expect(isValid).toBe(false);
  });
});