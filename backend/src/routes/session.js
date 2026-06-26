'use strict';

const express = require('express');
const store = require('../store/sessions');
const { startLink } = require('../util/deeplink');

const router = express.Router();

// POST /session/start — body: { userPhone, task, durationMinutes, contactPhone }
// Stores the session and returns the deep link. The agent normally calls
// startSession itself, but this endpoint lets you trigger a session directly.
router.post('/session/start', (req, res) => {
  const { userPhone, task, durationMinutes, contactPhone } = req.body || {};
  if (!userPhone || !task || !durationMinutes) {
    res.status(400).json({ error: 'userPhone, task, and durationMinutes are required' });
    return;
  }
  const session = store.startSession(userPhone, {
    task,
    durationMinutes: parseInt(durationMinutes, 10),
    contactPhone: contactPhone || null,
  });
  res.json({ session, deeplink: startLink({ task, durationMinutes }) });
});

// GET /session/:phone — polling handoff for the iOS app, alternative to the deep link.
router.get('/session/:phone', (req, res) => {
  const session = store.getSession(req.params.phone);
  if (!session) {
    res.json({ active: false });
    return;
  }
  res.json({
    active: true,
    session,
    stats: store.get(req.params.phone).stats,
    deeplink: startLink({ task: session.task, durationMinutes: session.durationMinutes }),
  });
});

module.exports = router;
