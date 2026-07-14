// src/temporal/workflow.js
//
// The MFA login Workflow — the overall process that Temporal orchestrates.
//
// IMPORTANT: Workflow code has strict rules:
//   - No direct I/O (no database calls, no console.log, no require of db.js)
//   - No randomness or Date.now() calls
//   - Must be deterministic — same inputs always produce same execution path
//
// All real work (database, notifier) happens in Activities, called via
// the proxyActivities wrapper. The Workflow itself just orchestrates.

const { proxyActivities, setHandler, condition, defineSignal, defineQuery } = require('@temporalio/workflow');

// How long to wait for the user to submit their PIN before giving up
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Signal: sent from Express route when user submits their PIN
const submitPinSignal = defineSignal('submitPin');

// Query: allows Express route to check current workflow status
const statusQuery = defineQuery('status');

// Proxy the activities — Temporal will call these on the Worker
const { generateAndSendPin, checkPin, cancelPendingLogin } = proxyActivities({
  startToCloseTimeout: '30 seconds',
});

/**
 * The main MFA login workflow.
 * 1. Generate and send a PIN
 * 2. Wait for the user to submit it (up to 5 minutes)
 * 3. Verify it and return the result
 */
async function mfaLoginWorkflow(userId) {
  let submittedPin = null;
  let verifyResult = null;
  let currentStatus = 'pending';

  // Step 1: generate PIN and send it
  const { loginId, expiresAt } = await generateAndSendPin(userId);
  currentStatus = 'awaiting_pin';

  // Register signal handler — Express will send this when user submits PIN
  setHandler(submitPinSignal, (pin) => {
    submittedPin = pin;
  });

  // Register query handler — lets Express check workflow state
  setHandler(statusQuery, () => currentStatus);

  // Step 2 + 3: wait for pin submission, verify, retry up to 3 times
  let attemptsLeft = 3;
  let receivedPin;

  while (attemptsLeft > 0) {
    submittedPin = null; // reset for next signal
    receivedPin = await condition(() => submittedPin !== null, LOGIN_TIMEOUT_MS);

    if (!receivedPin) {
      await cancelPendingLogin(loginId);
      currentStatus = 'expired';
      return { success: false, reason: 'EXPIRED', loginId };
    }

    currentStatus = 'verifying';
    verifyResult = await checkPin(loginId, submittedPin);
    if (verifyResult.success) break;

    attemptsLeft--;
    currentStatus = attemptsLeft > 0 ? 'awaiting_pin' : 'failed';
  }

  currentStatus = verifyResult.success ? 'success' : 'failed';
  return { ...verifyResult, loginId };
}

module.exports = { mfaLoginWorkflow };