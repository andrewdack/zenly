'use strict';

const express = require('express');
const config = require('./config');

const smsRoute = require('./routes/sms');
const judgeRoute = require('./routes/judge');
const snitchRoute = require('./routes/snitch');
const sessionRoute = require('./routes/session');

const app = express();

// Twilio posts application/x-www-form-urlencoded; the app posts JSON (with base64 frames).
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '15mb' }));

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'zenly-backend',
    llmProvider: config.llm.provider,
    llmConfigured: config.llmConfigured(),
    twilioConfigured: config.twilioConfigured(),
  });
});

app.use(smsRoute);
app.use(judgeRoute);
app.use(snitchRoute);
app.use(sessionRoute);

app.listen(config.port, () => {
  console.log(`Zenly backend on :${config.port}`);
  console.log(`  LLM provider:   ${config.llm.provider} (configured: ${config.llmConfigured()})`);
  console.log(`  Twilio:         configured: ${config.twilioConfigured()}`);
  if (!config.llmConfigured()) {
    console.log('  NOTE: no LLM key — /webhook/sms will echo, /judge returns on_task:true.');
  }
});

module.exports = app;
