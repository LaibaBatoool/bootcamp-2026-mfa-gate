// src/notifier.js
// Mocks the "send PIN to user's device" step of an MFA flow.
//
// In a real system, this would call Twilio (SMS) or an email provider.
// Here we simulate delivery by:
//   1. Logging it clearly to the console (so you can "read" the PIN like
//      you would on your phone)
//   2. Appending a line to a local log file, so there's a persistent
//      record of every "message" that was sent
//
// This separation matters: pinService.js shouldn't care *how* the PIN
// gets delivered, just that it was. That's what lets us swap this file
// out for a real SMS/email integration later without touching anything else.

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'sent-messages.log');

/**
 * Simulates sending a PIN to a user's registered device.
 * @param {object} user - the user record (must have phone or email)
 * @param {string} pin - the 6-digit PIN to "deliver"
 */
function sendPin(user, pin) {
  const destination = user.phone || user.email || 'unknown-device';
  const timestamp = new Date().toISOString();

  const message = `[${timestamp}] To ${user.name} (${destination}): Your verification code is ${pin}. It expires in 5 minutes.`;

  // "Deliver" it — console output stands in for an actual SMS/email send.
  console.log(`[notifier] ${message}`);

  // Keep a persistent log too, so we have evidence of what was sent
  // even after the console scrolls away.
  fs.appendFileSync(LOG_PATH, message + '\n');
}

module.exports = {
  sendPin,
};