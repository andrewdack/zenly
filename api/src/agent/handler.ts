import OpenAI from "openai";
import { AGENT_SYSTEM } from "../prompts.js";
import * as store from "../store/sessions.js";
import { startLink } from "../util/deeplink.js";
import type { ParsedSession } from "../types.js";

const SESSION_RE = /<session>([\s\S]*?)<\/session>/i;

function parseSessionBlock(text: string): { reply: string; session: ParsedSession | null } {
  const match = text.match(SESSION_RE);
  if (!match) return { reply: text, session: null };

  let session: ParsedSession | null = null;
  try {
    const raw = JSON.parse(match[1].trim()) as Record<string, unknown>;
    const mode = raw.mode === "guardian" ? "guardian" : "task";
    if (mode === "guardian") {
      session = { mode, task: null, durationMinutes: null };
    } else if (raw.task) {
      session = {
        mode,
        task: String(raw.task),
        durationMinutes: raw.duration_minutes != null ? parseInt(String(raw.duration_minutes), 10) : null,
      };
    }
  } catch { /* malformed block — reply still goes through */ }

  return { reply: text.replace(SESSION_RE, "").trim(), session };
}

export function createAgentHandler(client: OpenAI, model: string, deeplinkScheme: string) {
  return async function handleMessage(from: string, text: string): Promise<string> {
    store.appendTurn(from, "user", text);

    const activeSession = store.getSession(from);
    const system = activeSession
      ? `${AGENT_SYSTEM}\n\ncurrent session stats: ${store.statsSummary(from)}`
      : AGENT_SYSTEM;

    try {
      const res = await client.chat.completions.create({
        model,
        max_tokens: 400,
        messages: [{ role: "system", content: system }, ...store.get(from).history],
      });

      const raw = res.choices[0]?.message?.content ?? "got it.";
      const { reply, session } = parseSessionBlock(raw);

      let outbound = reply || "got it.";
      if (session) {
        store.startSession(from, session);
        outbound = `${outbound}\n\ntap to start: ${startLink(deeplinkScheme, session)}`;
      }

      store.appendTurn(from, "assistant", raw);
      return outbound;
    } catch (err) {
      console.error("[agent] error:", err);
      return "zenly hit a snag — try again in a sec.";
    }
  };
}
