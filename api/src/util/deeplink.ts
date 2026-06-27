import type { ParsedSession } from "../types.js";

export function startLink(scheme: string, { task, durationMinutes }: Pick<ParsedSession, "task" | "durationMinutes">): string {
  const base = `${scheme}://session/start?task=${encodeURIComponent(task)}`;
  return durationMinutes != null ? `${base}&duration=${durationMinutes}` : base;
}
