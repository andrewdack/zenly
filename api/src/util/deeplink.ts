import type { ParsedSession } from "../types.js";

export function startLink(
  scheme: string,
  { mode, task, durationMinutes }: Pick<ParsedSession, "mode" | "task" | "durationMinutes">,
  phone?: string
): string {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (task) params.set("task", task);
  if (durationMinutes != null) params.set("duration", String(durationMinutes));
  // The user's own number, so the app can identify itself to /judge.
  if (phone) params.set("phone", phone);
  // iOS URLComponents doesn't decode "+", so keep %20 for spaces.
  return `${scheme}://session/start?${params.toString().replace(/\+/g, "%20")}`;
}
