import config from '../config';

function enc(value: string | number): string {
  return encodeURIComponent(String(value));
}

export function startLink({ task, durationMinutes }: { task: string; durationMinutes?: number | null }): string {
  const base = `${config.deeplinkScheme}://session/start?task=${enc(task)}`;
  return durationMinutes != null ? `${base}&duration=${enc(durationMinutes)}` : base;
}
