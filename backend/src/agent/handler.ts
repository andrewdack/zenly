import config from '../config';
import * as store from '../store/sessions';
import { AGENT_SYSTEM } from '../prompts';
import { getLLM } from '../llm';
import { startLink } from '../util/deeplink';
import type { ParsedSession } from '../types';

const SESSION_RE = /<session>([\s\S]*?)<\/session>/i;

interface ParseResult {
  reply: string;
  session: ParsedSession | null;
}

function parseSessionBlock(text: string): ParseResult {
  const match = text.match(SESSION_RE);
  if (!match) return { reply: text, session: null };

  let session: ParsedSession | null = null;
  try {
    const raw = JSON.parse(match[1].trim()) as Record<string, unknown>;
    if (raw.task && raw.duration_minutes && raw.contact_phone) {
      session = {
        task: String(raw.task),
        durationMinutes: parseInt(String(raw.duration_minutes), 10),
        contactPhone: String(raw.contact_phone),
      };
    }
  } catch (err) {
    console.warn('[agent] failed to parse <session> block:', (err as Error).message);
  }

  const reply = text.replace(SESSION_RE, '').trim();
  return { reply, session };
}

/** Process one inbound iMessage and return the reply to send back. */
export async function handleMessage(from: string, text: string): Promise<string> {
  if (!config.llmConfigured()) {
    return `Zenly echo: ${text}`;
  }

  try {
    const llm = getLLM();
    store.appendTurn(from, 'user', text);

    const activeSession = store.getSession(from);
    const system = activeSession
      ? `${AGENT_SYSTEM}\n\nCurrent session stats: ${store.statsSummary(from)}`
      : AGENT_SYSTEM;

    const raw = await llm.chat({ system, messages: store.get(from).history, maxTokens: 400 });
    const { reply, session } = parseSessionBlock(raw);

    let outbound = reply || 'Got it.';
    if (session) {
      store.startSession(from, session);
      outbound = `${outbound}\n\nTap to start: ${startLink(session)}`;
    }

    store.appendTurn(from, 'assistant', raw);
    return outbound;
  } catch (err) {
    console.error('[agent] error:', err);
    return "Zenly hit a snag — try that again in a sec.";
  }
}
