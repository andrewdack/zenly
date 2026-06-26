import config from '../config';

function enc(value: string | number): string {
  return encodeURIComponent(String(value));
}

export function startLink({ task, durationMinutes }: { task: string; durationMinutes: number }): string {
  return `${config.deeplinkScheme}://session/start?task=${enc(task)}&duration=${enc(durationMinutes)}`;
}
