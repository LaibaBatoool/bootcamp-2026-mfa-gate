// tests/routes.test.js
// HTTP-level tests for the actual API endpoints (/login, /verify, /health),
// using supertest to make real requests against the Express app object
// without needing a server actually running on a port.
//
// Uses an in-memory DB, same approach as the other test files.

process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');
const { registerTotp, getCurrentTotpForUser } = require('../src/totpService');

beforeEach(() => {
  // Clean slate for pending logins between tests. Users persist since
  // app startup (via server.js's seedUsers() call) already seeded them.
  db.prepare('DELETE FROM pending_logins').run();
});

describe('GET /health', () => {
  test('returns ok status', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('POST /login', () => {
  test('starts a login attempt and returns a loginId', async () => {
    const res = await request(app).post('/login').send({ userId: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('loginId');
    expect(typeof res.body.loginId).toBe('number');
  });

  test('returns 400 when userId is missing', async () => {
    const res = await request(app).post('/login').send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 404 for a non-existent userId', async () => {
    const res = await request(app).post('/login').send({ userId: 9999 });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /verify (PIN path)', () => {
  test('succeeds with the correct PIN', async () => {
    const loginRes = await request(app).post('/login').send({ userId: 1 });
    const { loginId } = loginRes.body;

    const row = db.prepare('SELECT * FROM pending_logins WHERE id = ?').get(loginId);

    const verifyRes = await request(app)
      .post('/verify')
      .send({ loginId, pin: row.pin });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body).toEqual({ success: true, method: 'pin' });
  });

  test('returns 401 with the wrong PIN', async () => {
    const loginRes = await request(app).post('/login').send({ userId: 1 });
    const { loginId } = loginRes.body;

    const verifyRes = await request(app)
      .post('/verify')
      .send({ loginId, pin: '000000' });

    expect(verifyRes.status).toBe(401);
    expect(verifyRes.body.success).toBe(false);
    expect(verifyRes.body.reason).toBe('WRONG_PIN');
  });

  test('returns 400 when neither pin nor totp fields are provided', async () => {
    const res = await request(app).post('/verify').send({ loginId: 1 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /verify (TOTP path)', () => {
  test('succeeds with the current valid TOTP code', async () => {
    registerTotp(1);
    const code = await getCurrentTotpForUser(1);

    const res = await request(app)
      .post('/verify')
      .send({ userId: 1, totp: code });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, method: 'totp' });
  });

  test('returns 401 with an invalid TOTP code', async () => {
    registerTotp(1);

    const res = await request(app)
      .post('/verify')
      .send({ userId: 1, totp: '000000' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe('INVALID_TOTP');
  });
});


