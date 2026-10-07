/**
 * Farcaster usernames ("fnames"): lowercase letters, digits and hyphens, up to 16 characters, optionally an ENS name
 * ending in .eth. Accepts what people type: "@nala", "Nala", "https://farcaster.xyz/nala".
 */
export function normalizeHandle(raw: string): string | null {
  const s = raw
    .trim()
    .replace(/^https?:\/\/(?:www\.)?(?:farcaster\.xyz|warpcast\.com)\//i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,15}(?:\.eth)?$/.test(s) ? s : null;
}

/** True when the input looks like a handle rather than a wallet or a link to one. */
export function looksLikeHandle(raw: string): boolean {
  const s = raw.trim();
  return !/0x[0-9a-fA-F]{6}/.test(s) && normalizeHandle(s) !== null && (s.startsWith("@") || !/^\d+$/.test(s));
}
