function enc(value: string | number): string {
  return encodeURIComponent(String(value));
}

export function startLink(
  scheme: string,
  { task, durationMinutes }: { task: string; durationMinutes?: number | null }
): string {
  const base = `${scheme}://session/start?task=${enc(task)}`;
  return durationMinutes != null ? `${base}&duration=${enc(durationMinutes)}` : base;
}
