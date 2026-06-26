'use strict';

const express = require('express');
const config = require('../config');
const store = require('../store/sessions');
const prompts = require('../prompts');
const { getLLM } = require('../llm');
const { twiml } = require('../services/twilio');
const { startLink } = require('../util/deeplink');

const router = express.Router();

const SESSION_RE = /<session>([\s\S]*?)<\/session>/i;

/** Pull the <session>{...}</session> block out of the agent's reply, if present. */
function parseSessionBlock(text) {
  const match = text.match(SESSION_RE);
  if (!match) return { reply: text, session: null };
  let session = null;
  try {
    const raw = JSON.parse(match[1].trim());
    if (raw && raw.task && raw.duration_minutes && raw.contact_phone) {
      session = {
        task: String(raw.task),
        durationMinutes: parseInt(raw.duration_minutes, 10),
        contactPhone: String(raw.contact_phone),
      };
    }
  } catch (err) {
    console.warn('[sms] failed to parse <session> block:', err.message);
  }
  // Strip the machine block from the user-facing text.
  const reply = text.replace(SESSION_RE, '').trim();
  return { reply, session };
}

// POST /webhook/sms — Twilio inbound webhook.
router.post('/webhook/sms', async (req, res) => {
  const from = req.body.From || 'unknown';
  const body = (req.body.Body || '').trim();

  // Phase 2 baseline: no LLM key -> echo, so the webhook is verifiably working.
  if (!config.llmConfigured()) {
    res.type('text/xml').send(twiml(`Zenly echo: ${body}`));
    return;
  }

  try {
    const llm = getLLM();
    store.appendTurn(from, 'user', body);

    // Give the agent current stats so it can answer mid-session check-ins.
    const activeSession = store.getSession(from);
    const system = activeSession
      ? `${prompts.AGENT_SYSTEM}\n\nCurrent session stats: ${store.statsSummary(from)}`
      : prompts.AGENT_SYSTEM;

    const raw = await llm.chat({ system, messages: store.get(from).history, maxTokens: 400 });
    const { reply, session } = parseSessionBlock(raw);

    let outbound = reply || "Got it.";
    if (session) {
      store.startSession(from, session);
      outbound = `${outbound}\n\nTap to start: ${startLink(session)}`;
    }

    store.appendTurn(from, 'assistant', raw);
    res.type('text/xml').send(twiml(outbound));
  } catch (err) {
    console.error('[sms] agent error:', err);
    res.type('text/xml').send(twiml("Zenly hit a snag — try that again in a sec."));
  }
});

module.exports = router;
