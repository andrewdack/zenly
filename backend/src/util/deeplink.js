'use strict';

const config = require('../config');

// Encode for a URL query that iOS URLComponents will parse. encodeURIComponent
// yields %20 for spaces; URLSearchParams would use "+", which URLComponents does
// NOT decode back to a space — so the app would receive a literal "+".
function enc(value) {
  return encodeURIComponent(String(value));
}

/** Build the tap-to-start link the agent texts the user. */
function startLink({ task, durationMinutes }) {
  return `${config.deeplinkScheme}://session/start?task=${enc(task)}&duration=${enc(durationMinutes)}`;
}

module.exports = { startLink };
