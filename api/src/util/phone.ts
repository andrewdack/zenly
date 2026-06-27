/** Normalize user-entered phone targets and Spectrum composite ids for messaging/session keys.
 *
 * Demo identities:
 * - Andrew/user texts the session agent at +14156035536 from +15715197392.
 * - Snitches to the witness +15715996273 may arrive from +14156055823.
 *
 * Spectrum ids can concatenate both sides (for example `any;-;+14156035536;-;+15715197392`).
 * In that case, keep the human participant, not the Zenly sender number.
 */
const DEFAULT_ZENLY_AGENT_NUMBERS = new Set(["+14156035536", "+14156055823"]);

export function normalizePhoneTarget(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const candidates = phoneCandidates(trimmed);
  if (candidates.length === 0) return trimmed;

  const agentNumbers = zenlyAgentNumbers();
  return candidates.find((phone) => !agentNumbers.has(phone)) ?? candidates[0];
}

function phoneCandidates(raw: string): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  function add(value: string | null) {
    if (!value || seen.has(value)) return;
    seen.add(value);
    candidates.push(value);
  }

  // Composite Spectrum ids often use `;-;`; splitting prevents digit runs from
  // two phone numbers being glued into one invalid mega-number.
  if (raw.includes(";")) {
    for (const part of raw.split(/;+/)) add(toE164Phone(part));
  }

  // Handles bare E.164 snippets inside arbitrary ids.
  for (const match of raw.matchAll(/\+\d{7,15}/g)) add(toE164Phone(match[0]));

  // Handles normal user-entered values like `5715996273` or `+1 (571) 599-6273`.
  add(toE164Phone(raw));

  return candidates;
}

function toE164Phone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  // Handles formatted international input such as `+44 20 7123 4567`.
  if (trimmed.startsWith("+") && digits.length >= 7 && digits.length <= 15 && !digits.startsWith("0")) {
    return `+${digits}`;
  }

  return null;
}

function zenlyAgentNumbers(): Set<string> {
  const configured = process.env.ZENLY_AGENT_NUMBERS
    ?.split(",")
    .map((raw) => toE164Phone(raw))
    .filter((phone): phone is string => Boolean(phone));

  if (!configured?.length) return DEFAULT_ZENLY_AGENT_NUMBERS;
  return new Set([...DEFAULT_ZENLY_AGENT_NUMBERS, ...configured]);
}
