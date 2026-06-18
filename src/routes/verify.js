// src/routes/verify.js
//
// POST /verify
// Checks a submitted code against either a pending PIN login,
// or a user's TOTP secret — depending on which fields are sent.
//
// PIN flow:
//   Request body:  { "loginId": 7, "pin": "482913" }
//
// TOTP flow:
//   Request body:  { "userId": 1, "totp": "272077" }

const express = require('express');
const router = express.Router();
const { verifyPin } = require('../pinService');
const { verifyTotp } = require('../totpService');

router.post('/', async (req, res) => {
  const { loginId, pin, userId, totp } = req.body;

  // --- TOTP path ---
  if (userId && totp) {
    try {
      const isValid = await verifyTotp(userId, totp);
      if (isValid) {
        return res.status(200).json({ success: true, method: 'totp' });
      }
      return res.status(401).json({ success: false, reason: 'INVALID_TOTP' });
    } catch (err) {
      console.error('[routes/verify] TOTP verify error:', err.message);
      return res.status(400).json({ error: err.message });
    }
  }

  // --- SMS PIN path ---
  if (loginId && pin) {
    const result = verifyPin(loginId, pin);
    const statusCode = result.success ? 200 : 401;
    return res.status(statusCode).json({ ...result, method: 'pin' });
  }

  return res.status(400).json({
    error: 'Provide either { loginId, pin } or { userId, totp }',
  });
});

module.exports = router;