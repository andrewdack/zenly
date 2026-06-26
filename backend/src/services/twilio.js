'use strict';

const twilio = require('twilio');
const config = require('../config');

let client = null;
function getClient() {
  if (!client) client = twilio(config.twilio.accountSid, config.twilio.authToken);
  return client;
}

/**
 * Send an outbound SMS (used by the snitch route). No-op-with-warning when
 * Twilio isn't configured, so the rest of the pipeline still works in dev.
 * @returns {Promise<{sent: boolean, sid?: string, reason?: string}>}
 */
async function sendSMS(to, body) {
  if (!config.twilioConfigured()) {
    console.warn('[twilio] not configured — would have sent to %s: %s', to, body);
    return { sent: false, reason: 'twilio_not_configured' };
  }
  const msg = await getClient().messages.create({ to, from: config.twilio.fromNumber, body });
  return { sent: true, sid: msg.sid };
}

/** Build a TwiML reply for an inbound webhook. */
function twiml(message) {
  const response = new twilio.twiml.MessagingResponse();
  response.message(message);
  return response.toString();
}

module.exports = { sendSMS, twiml };
