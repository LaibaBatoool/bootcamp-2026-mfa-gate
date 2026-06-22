
//
// Implements the bonus TOTP (Time-based One-Time Password) flow —
// the same mechanism apps like Google Authenticator or Authy use.
//
// Key difference from the SMS PIN flow: there's nothing to "send" and
// nothing to store per login attempt. Both the server and the user's
// authenticator app independently derive the same code from a shared
// secret + the current time. We only need to store the secret once,
// at registration time — not a new row on every login.
//
// Note: otplib v13 uses a flat, async, options-object API
// (generate({ secret }), verify({ secret, token })) rather than the
// older `authenticator.generate(secret)` style from earlier versions.

const { generateSecret, generate, verify, generateURI } = require('otplib');
const qrcode = require('qrcode');
const { setTotpSecret, getUserById } = require('./users');

/**
 * Generates a new TOTP secret for a user and saves it to their user record.
 * This simulates "registering" for authenticator-app based MFA.
 *
 * @param {number} userId
 * @returns {string} the generated secret (normally you wouldn't show this
 *                    directly to the user — they'd scan a QR code instead)
 */
function registerTotp(userId) {
  const user = getUserById(userId);

  if (!user) {
    throw new Error(`No user found with id ${userId}`);
  }

  const secret = generateSecret();
  setTotpSecret(userId, secret);

  console.log(`[totpService] Generated TOTP secret for user ${userId}`);

  return secret;
}

/**
 * Builds the otpauth:// URI and renders it as a QR code (as a data URL),
 * so it can be displayed/saved and "scanned" by an authenticator app.
 *
 * @param {number} userId
 * @returns {Promise<string>} a base64 data URL of the QR code PNG
 */
async function generateQrCode(userId) {
  const user = getUserById(userId);

  if (!user || !user.totp_secret) {
    throw new Error(`User ${userId} has no TOTP secret. Call registerTotp() first.`);
  }

  const otpauthUri = generateURI({
    strategy: 'totp',
    issuer: 'BootcampMFAGate', // the "issuer" name shown in the authenticator app
    label: user.email || user.name,
    secret: user.totp_secret,
  });

  const qrDataUrl = await qrcode.toDataURL(otpauthUri);

  console.log(`[totpService] Generated QR code for user ${userId}`);

  return qrDataUrl;
}

/**
 * Verifies a TOTP code submitted by the user against their stored secret.
 * otplib automatically accounts for small clock drift (checks a small
 * window of adjacent time steps), which is standard TOTP behavior.
 *
 * @param {number} userId
 * @param {string} submittedCode
 * @returns {Promise<boolean>}
 */
async function verifyTotp(userId, submittedCode) {
  const user = getUserById(userId);

  if (!user || !user.totp_secret) {
    console.log(`[totpService] Verify failed: user ${userId} has no TOTP secret registered`);
    return false;
  }

  const result = await verify({ secret: user.totp_secret, token: submittedCode });
  const isValid = result.valid;

  console.log(
    `[totpService] TOTP verify for user ${userId}: ${isValid ? 'SUCCESS' : 'FAILED'}`
  );

  return isValid;
}

/**
 * Convenience helper for testing/demo purposes: generates the *current*
 * valid TOTP code for a user, the way their authenticator app would.
 * In a real system this would never live on the server — it's only here
 * so we can simulate "the user's phone" without building a separate app.
 *
 * @param {number} userId
 * @returns {Promise<string>}
 */
async function getCurrentTotpForUser(userId) {
  const user = getUserById(userId);

  if (!user || !user.totp_secret) {
    throw new Error(`User ${userId} has no TOTP secret. Call registerTotp() first.`);
  }

  return generate({ secret: user.totp_secret });
}

module.exports = {
  registerTotp,
  generateQrCode,
  verifyTotp,
  getCurrentTotpForUser,
};