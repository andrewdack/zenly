'use strict';

require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  deeplinkScheme: process.env.DEEPLINK_SCHEME || 'zenly',

  llm: {
    provider: (process.env.LLM_PROVIDER || 'anthropic').toLowerCase(),
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    // User-specified default for the hackathon. Override via ANTHROPIC_MODEL.
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o',
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    fromNumber: process.env.TWILIO_FROM_NUMBER || '',
  },
};

/** True when the selected LLM provider has an API key configured. */
config.llmConfigured = () => {
  if (config.llm.provider === 'openai') return Boolean(config.openai.apiKey);
  return Boolean(config.anthropic.apiKey);
};

config.twilioConfigured = () =>
  Boolean(config.twilio.accountSid && config.twilio.authToken && config.twilio.fromNumber);

module.exports = config;
