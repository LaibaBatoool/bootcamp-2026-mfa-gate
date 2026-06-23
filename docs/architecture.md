# System Architecture

## Overview

The MFA Gate is a Node.js + Express API backed by SQLite, implementing two independent second-factor authentication mechanisms behind a shared verification endpoint.

## Components

| File Name               | Description                                                                 |
|------------------------|-----------------------------------------------------------------------------|
| `src/db.js`            | SQLite connection, WAL mode, schema setup (users, pending_logins).          |
| `src/users.js`         | Mock user store: seeding, lookups, TOTP secret storage.                     |
| `src/notifier.js`      | Simulated delivery channel (console output + log file).                     |
| `src/pinService.js`    | Handles PIN generation, expiry, attempt limits, and cleanup.                |
| `src/totpService.js`   | Manages TOTP secret registration, QR code generation, and verification.     |
| `src/routes/login.js`  | `POST /login` — initiates a PIN-based login attempt.                        |
| `src/routes/verify.js` | `POST /verify` — verifies a PIN or TOTP authentication code.                |
| `src/server.js`        | Express app setup, route mounting, and background cleanup tasks.            |

Each file has a single responsibility, and the routing layer is intentionally thin — `routes/login.js` and `routes/verify.js` only translate HTTP requests into calls against `pinService.js` / `totpService.js`. All actual business logic lives in the service layer, which means it can be (and is) tested directly without needing an HTTP server running at all.

## Data model

**`users`** — id, name, phone, email, totp_secret (nullable until TOTP is registered).

**`pending_logins`** — id, user_id, pin, created_at, expires_at, attempts. Represents a single in-flight PIN login attempt. Rows are deleted on success, on expiry, or after hitting the attempt cap — never left around indefinitely.

## Request flow: PIN authentication

1. Client calls `POST /login` with a `userId`.
2. `startLogin()` looks up the user, generates a random 6-digit PIN, computes a 5-minute expiry timestamp, inserts a `pending_logins` row, and calls `sendPin()` to simulate delivery.
3. The client receives a `loginId` (the row's id) and is expected to hold onto it.
4. Client calls `POST /verify` with `{ loginId, pin }`.
5. `verifyPin()` looks up the row: if missing → `NOT_FOUND`; if past `expires_at` → delete and return `EXPIRED`; if PIN matches → delete and return success; if PIN doesn't match → increment `attempts`, and if that hits the cap (3), delete and return `MAX_ATTEMPTS_REACHED`, otherwise return `WRONG_PIN` and allow retry.

## Request flow: TOTP authentication

1. (One-time, per user) `registerTotp(userId)` generates a random secret and stores it on the user's record. `generateQrCode(userId)` builds an `otpauth://` URI from that secret and renders it as a scannable QR PNG.
2. The user's authenticator app scans the QR code once, and from then on independently computes a 6-digit code every 30 seconds, derived purely from the shared secret and the current time.
3. At login, the client calls `POST /verify` with `{ userId, totp }`.
4. `verifyTotp()` recomputes the expected code from the stored secret and the current time (allowing a small clock-drift window) and compares it to what was submitted. No database row is created or consulted per login attempt — only the permanently stored secret is used.

## Why two different storage models

This is the central architectural point of the project: the PIN flow is **stateful per login attempt** (a new database row every time, with a lifecycle that needs active management — expiry, cleanup, attempt tracking), while the TOTP flow is **stateless per login attempt** (the only persistent state is the one-time secret; verification is a pure computation against the current time). Building both side by side makes this difference concrete rather than theoretical.

## Cleanup strategy

Two independent mechanisms guard against stale `pending_logins` rows:

- **Check-on-read**, inside `verifyPin()` — if a row is read and found expired, it's deleted immediately as part of that same request.
- **Background sweep**, via `cleanupExpired()` running on a 60-second `setInterval` in `server.js` — catches rows that are *never* read again at all (the user abandoned the flow entirely and never submitted anything).

Both are necessary: check-on-read alone wouldn't catch abandoned attempts, since nothing ever triggers a read on them again.

## Server startup guard

`server.js` only calls `app.listen()` and starts the cleanup interval when the file is run directly (`require.main === module`), not when it's imported. This allows `tests/routes.test.js` to import the Express `app` object via `supertest` without accidentally starting a real server or background timer during test runs.
