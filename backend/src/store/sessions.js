'use strict';

// In-memory state keyed by the user's phone number. Swap for Redis later;
// the interface below is all the routes depend on.
const byPhone = new Map();

function blank(phone) {
  return {
    phone,
    history: [], // [{ role: 'user'|'assistant', content }] for the agent conversation
    session: null, // { task, durationMinutes, contactPhone, startedAt }
    stats: { nudges: 0, snitches: 0, lastOnTask: true },
  };
}

function get(phone) {
  if (!byPhone.has(phone)) byPhone.set(phone, blank(phone));
  return byPhone.get(phone);
}

function appendTurn(phone, role, content) {
  get(phone).history.push({ role, content });
}

function startSession(phone, { task, durationMinutes, contactPhone }) {
  const state = get(phone);
  state.session = {
    task,
    durationMinutes,
    contactPhone,
    startedAt: Date.now(),
  };
  state.stats = { nudges: 0, snitches: 0, lastOnTask: true };
  return state.session;
}

function getSession(phone) {
  return get(phone).session;
}

function recordNudge(phone) {
  get(phone).stats.nudges += 1;
}

function recordSnitch(phone) {
  get(phone).stats.snitches += 1;
}

/** Human-readable stats string for mid-session "how am I doing" replies. */
function statsSummary(phone) {
  const state = get(phone);
  if (!state.session) return "You don't have an active session right now.";
  const elapsedMin = Math.floor((Date.now() - state.session.startedAt) / 60000);
  const remaining = Math.max(0, state.session.durationMinutes - elapsedMin);
  return (
    `Task: ${state.session.task}. ${elapsedMin} min in, ~${remaining} min left. ` +
    `Nudges: ${state.stats.nudges}, snitches sent: ${state.stats.snitches}.`
  );
}

module.exports = {
  get,
  appendTurn,
  startSession,
  getSession,
  recordNudge,
  recordSnitch,
  statsSummary,
};
