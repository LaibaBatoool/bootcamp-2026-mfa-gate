// src/routes/login.js
// POST /login
// Starts a new login attempt for a user: generates a PIN, stores it
// with a 5-minute expiry, and "sends" it via the notifier.
//
// Request body:  { "userId": 1 }
// Response:      { "loginId": 7, "message": "PIN sent to registered device" }

const express = require('express');
const router = express.Router();
const { startLogin } = require('../pinService');

router.post('/', (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const loginId = startLogin(userId);
    res.status(201).json({
      loginId,
      message: 'PIN sent to registered device',
    });
  } catch (err) {
    console.error(`[routes/login] Error starting login:`, err.message);
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;