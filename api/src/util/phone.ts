/** Normalize user-entered phone targets for messaging.
 *
 * The app's phone pad often stores a local US number like `5715996273`, while
 * Photon/Spectrum's iMessage provider wants a bare E.164 target. Keep non-phone
 * targets unchanged so local/dev providers can still handle their own formats.
 */
export function normalizePhoneTarget(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  // Spectrum sometimes hands us composite ids like `any;-;+15715996273`.
  const embeddedE164 = trimmed.match(/\+\d{7,15}/)?.[0];
  if (embeddedE164) return embeddedE164;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  // Handles formatted international input such as `+44 20 7123 4567`.
  if (trimmed.startsWith("+") && digits.length >= 7 && digits.length <= 15 && !digits.startsWith("0")) {
    return `+${digits}`;
  }

  return trimmed;
}
