'use strict';

const express = require('express');
const config = require('../config');
const prompts = require('../prompts');
const store = require('../store/sessions');
const { getLLM } = require('../llm');
const { sendSMS } = require('../services/twilio');

const router = express.Router();

// POST /snitch — body: { task, contactPhone, screenContent, userPhone? }
// Generates a funny shame message and texts it to the accountability contact.
router.post('/snitch', async (req, res) => {
  const { task, contactPhone, screenContent, userPhone } = req.body || {};
  if (!task || !contactPhone || !screenContent) {
    res.status(400).json({ error: 'task, contactPhone, and screenContent are required' });
    return;
  }

  let message;
  if (config.llmConfigured()) {
    try {
      const llm = getLLM();
      message = (
        await llm.chat({
          system: prompts.SNITCH_SYSTEM,
          messages: [{ role: 'user', content: prompts.snitchPrompt(task, screenContent) }],
          maxTokens: 120,
        })
      ).trim();
    } catch (err) {
      console.error('[snitch] llm error:', err);
    }
  }
  if (!message) {
    message = `Your friend swore they'd be "${task}" but got caught ${screenContent}. Just so you know. 👀`;
  }

  try {
    const result = await sendSMS(contactPhone, message);
    if (userPhone) store.recordSnitch(userPhone);
    res.json({ message, ...result });
  } catch (err) {
    console.error('[snitch] send error:', err);
    res.status(502).json({ error: 'send_failed', detail: err.message, message });
  }
});

module.exports = router;
