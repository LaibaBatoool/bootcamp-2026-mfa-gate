# Bootcamp 2026 — Interactive MFA Timed Gate

A small but realistic implementation of a multi-factor authentication (MFA) login flow, built to explore how time-bound verification codes actually work under the hood — and where naive implementations of that pattern tend to break.

The project supports two independent second-factor mechanisms:

1. **SMS-style PIN verification** — a 6-digit code is generated server-side, stored with a 5-minute expiry, "delivered" to the user (simulated via console/file logging), and checked against what the user submits.
2. **TOTP / QR-based authentication (bonus)** — the same mechanism used by apps like Google Authenticator. A secret is shared once at registration (via a scannable QR code), and both the server and the user's authenticator app independently derive matching time-based codes — no per-login delivery or storage required.

## Why two mechanisms?

The brief specifically asks for a comparison between these two approaches, and building both side by side makes the structural difference obvious: the PIN flow needs a database row, a delivery step, and a cleanup job for every single login attempt. The TOTP flow needs none of that at login time — only a one-time secret stored at registration. That difference is the actual lesson this project is meant to demonstrate.

## Project structure
src/

db.js               SQLite connection + schema (users, pending_logins)

users.js            Mock user store (seed users, lookups)

notifier.js         Simulated SMS/email delivery (console + log file)

pinService.js       Core PIN logic: generate, verify, expire, cleanup

totpService.js      TOTP secret registration, QR generation, verification

routes/

login.js            POST /login

verify.js           POST /verify

server.js           Express app entry point

tests/

pinService.test.js   Unit tests for PIN logic

totpService.test.js  Unit tests for TOTP logic

routes.test.js       HTTP-level tests for the actual endpoints

docs/

failure-mode-demo.md  Write-up + evidence of the restart failure mode

screenshots/             Supporting screenshots (QR code, demo evidence)

.github/workflows/ci.yml GitHub Actions: runs the test suite on every PR

## Setup

Requires Node.js (v18+) and npm.

```bash
git clone https://github.com/LaibaBatoool/bootcamp-2026-mfa-gate.git
cd bootcamp-2026-mfa-gate
npm install
```

No external services, API keys, or accounts are required — SMS/email delivery is simulated locally (see [Design decisions](#design-decisions) below).

## Running the application

Start the server:

```bash
npm start
```

This starts the API on `http://localhost:3000` and seeds two mock users (ids `1` and `2`) on first run.

### Trying the PIN flow

Start a login attempt:

```bash
curl -X POST http://localhost:3000/login -H "Content-Type: application/json" -d '{"userId": 1}'
```

This returns a `loginId`, and the "delivered" PIN appears in the server's console output (and in `sent-messages.log`).

Submit the PIN to verify:

```bash
curl -X POST http://localhost:3000/verify -H "Content-Type: application/json" -d '{"loginId": 1, "pin": "123456"}'
```

(On Windows PowerShell, use `Invoke-RestMethod` instead — see note below.)

### Trying the TOTP/QR flow

Register a TOTP secret and get a QR code for a user, then verify a code from an authenticator app (or generate one programmatically for testing — see `totpService.js`'s `getCurrentTotpForUser` helper):

```bash
curl -X POST http://localhost:3000/verify -H "Content-Type: application/json" -d '{"userId": 1, "totp": "123456"}'
```

### PowerShell note

Windows PowerShell aliases `curl` to its own `Invoke-WebRequest` cmdlet, which doesn't accept the same flags. Use `Invoke-RestMethod` instead:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/login -Method Post -ContentType "application/json" -Body '{"userId": 1}'
```

## Running tests

```bash
npm test
```

This runs the full Jest suite: unit tests for the PIN service, unit tests for the TOTP service, and HTTP-level tests (via supertest) for the actual `/login` and `/verify` endpoints. All tests run against an in-memory SQLite database, so they never touch your local `mfa.db` file.

## Architecture and design decisions

**SQLite over in-memory or Redis.** Pending login rows are stored in SQLite rather than a plain in-memory object or Redis. In-memory storage would lose all state on restart, making it impossible to *demonstrate* the failure mode properly (see `docs/failure-mode-demo.md`) — it would just vanish instantly rather than leaving visible evidence. Redis would be the more typical production choice, but adds an external service dependency that isn't necessary to demonstrate the actual concepts this project is testing. SQLite gives a real persistent, file-based database with zero setup overhead.

**WAL journal mode.** `db.js` enables SQLite's Write-Ahead Logging mode, which is more resilient to a process being killed mid-write — directly relevant to the restart failure-mode demo.

**Mocked delivery instead of a real SMS/email provider.** `notifier.js` simulates delivery via console and file logging rather than integrating Twilio or a real email API. This keeps the project runnable by anyone without API keys or cost, avoids the credential-leak risk of committing real provider secrets to a repository, and — more importantly — isolates the actual lesson (PIN generation, storage, expiry, and validation logic) from an unrelated integration detail. `sendPin()` doesn't know or care how delivery happens, so swapping in a real provider later would only require changing the inside of that one function.

**Check-on-read cleanup, plus a separate sweep job.** `verifyPin()` checks expiry every time it's called and deletes expired rows on the spot. Additionally, `cleanupExpired()` runs on a 60-second interval in the background, independently of any verify calls — covering rows that are abandoned and never verified at all.

**One PIN per attempt, never reusable.** A successful verification deletes the row immediately, so a PIN can't be replayed even within its 5-minute window.

**Attempt cap of 3.** After 3 wrong submissions, the row is deleted and the login attempt is permanently invalidated, rather than allowing unlimited guessing.

## Assumptions

- Each login attempt is tracked by an opaque `loginId` returned from `/login`, which the client is expected to hold onto and send back to `/verify`. In a real system this would likely be a signed token rather than a raw database id, to prevent guessing.
- The mock user store seeds exactly two users on first run; there's no registration/signup endpoint, since user management itself isn't the focus of this exercise.
- TOTP secrets are stored in plaintext in the local SQLite file. In a production system, these would need to be encrypted at rest, since possessing the raw secret is equivalent to possessing the user's second factor entirely.
- The "device" a PIN is sent to is whatever phone/email is on the mock user record; no real-world delivery, retries, or delivery failure handling is implemented, since that's explicitly out of scope per the brief.

## AI code review

This project was reviewed using [tool name] prior to requesting human review. See the Pull Request description for a summary of findings and how they were addressed.