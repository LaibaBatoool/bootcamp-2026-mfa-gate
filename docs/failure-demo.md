# Failure Mode Demo: Server Restart During an Active Login

## What this demonstrates

The brief asks us to show what happens to a pending login attempt if the server process restarts mid-flow — before the user has verified their PIN. This document walks through exactly that scenario, with real terminal output as evidence, and explains why it matters.

## The scenario

1. A login attempt is started for user 1. The server generates a PIN, stores it in the `pending_logins` table with a 5-minute expiry, and "delivers" it via the notifier.
2. Before the user verifies, the server process is killed (`Ctrl+C`) — simulating a crash, a deploy, a container restart, or any other abrupt process termination.
3. The server is restarted (`npm start`).
4. We query the database directly to check what happened to the pending login.

## Evidence

See `screenshots/failure-demo1.png & screenshots/failure-demo2.png` for the full terminal sequence. The key observations:

**Before restart** — a login attempt is started for user 1, returning `loginId: 7` with PIN `220245`. Querying `getAllPendingLogins()` confirms the row exists in the `pending_logins` table.

**Server restart** — the running server process is terminated with `Ctrl+C`, then started again with `npm start`. The startup log shows `[users] 2 user(s) already seeded, skipping` (confirming the `users` table persisted, as expected), but crucially shows **no** new `[pinService] Generated PIN...` log line for attempt 7 — the new process never recreated that row, because it never knew about it in the first place.

**After restart** — querying `getAllPendingLogins()` again returns the *exact same row*: same `id: 7`, same `pin: '220245'`, same `created_at` and `expires_at` timestamps. The row survived the restart completely intact, even though the process that originally created it no longer exists.

## Why this matters

This is the orphaned-row failure mode described in the brief: a pending verification that nobody is actively tracking, sitting in storage, silently waiting for either a verify request that may never come, or its own expiry.

A few consequences worth naming explicitly:

**If pending_logins had been stored in memory instead of SQLite**, this row would have vanished entirely the moment the server restarted — silently failing the user's login with no trace anywhere, and no way to even know it had happened. Using SQLite instead means the row survives, but "surviving" isn't the same as "working correctly" — it just changes the failure from total data loss to a different, subtler problem: an orphaned row that nobody is actively managing in real time.

**The original client is now in an ambiguous state.** Whoever requested this login has no way of knowing whether the server restart affected their pending attempt. If they submit the correct PIN after the restart, it will actually still work correctly in this implementation (since `verifyPin()` reads straight from the database, not from any in-memory state) — but in a system where login state lived only in server memory (e.g., a plain JavaScript object instead of a database), that same verification attempt would fail with something like "login not found," even though the user did everything right.

**The 60-second cleanup sweep (`cleanupExpired`) is what eventually resolves this**, not the restart itself. The row isn't actively "stuck" — it will be correctly deleted once its 5-minute expiry passes, by whichever server process happens to be running the periodic sweep at that time. This is precisely why the cleanup job needs to be independent of any specific request or process lifecycle: it has to clean up state regardless of *which* server instance created it or whether that instance is even still alive.

## Takeaway

Persisting pending authentication state to a real database (rather than memory) doesn't eliminate the restart problem, but it changes its nature from "silent total data loss" to "a recoverable, observable condition that a background cleanup process will eventually resolve." That's a meaningfully better failure mode, and it's the core argument for why `pinService.js` uses SQLite rather than a plain in-memory object — even for a small project like this one.
