import OpenAI from "openai";
import { AGENT_SYSTEM } from "../prompts.js";
import * as store from "../store/sessions.js";
import * as profile from "../store/profile.js";
import { startLink } from "../util/deeplink.js";
import type { ParsedSession } from "../types.js";

const SESSION_RE = /<session>([\s\S]*?)<\/session>/i;
const PROFILE_RE = /<profile>([\s\S]*?)<\/profile>/i;

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

/** Extract a <profile> block, returning the parsed name and the text with the block stripped. */
function parseProfileBlock(text: string): { reply: string; name: string | null } {
  const match = text.match(PROFILE_RE);
  if (!match) return { reply: text, name: null };

  let name: string | null = null;
  try {
    const raw = JSON.parse(match[1].trim()) as Record<string, unknown>;
    if (raw.name) name = String(raw.name).trim() || null;
  } catch { /* malformed — ignore */ }

  return { reply: text.replace(PROFILE_RE, "").trim(), name };
}

export function createAgentHandler(client: OpenAI, model: string, deeplinkScheme: string) {
  return async function handleMessage(from: string, text: string): Promise<string> {
    store.appendTurn(from, "user", text);

    const knownName = profile.getName(from);
    const parts = [AGENT_SYSTEM];
    parts.push(knownName ? `the user's name is ${knownName}.` : `you don't know the user's name yet — ask for it.`);
    const memories = profile.getMemories(from, 8);
    if (memories.length) {
      parts.push(`what you know about them:\n${memories.map((m) => `- ${m.fact}`).join("\n")}`);
    }
    if (store.getSession(from)) parts.push(`current session stats: ${store.statsSummary(from)}`);
    const system = parts.join("\n\n");

    try {
      const res = await client.chat.completions.create({
        model,
        max_tokens: 400,
        messages: [{ role: "system", content: system }, ...store.get(from).history],
      });

      const raw = res.choices[0]?.message?.content ?? "got it.";
      const afterProfile = parseProfileBlock(raw);
      if (afterProfile.name) profile.upsertUser(from, { name: afterProfile.name });
      const { reply, session } = parseSessionBlock(afterProfile.reply);

      let outbound = reply || "got it.";
      if (session) {
        store.startSession(from, session);
        outbound = `${outbound}\n\ntap to start: ${startLink(deeplinkScheme, session, from)}`;
      }

      store.appendTurn(from, "assistant", raw);
      return outbound;
    } catch (err) {
      console.error("[agent] error:", err);
      return "zenly hit a snag — try again in a sec.";
    }
  };
}
