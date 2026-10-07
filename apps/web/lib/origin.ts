/**
 * Where this app is being served from, worked out per request so any domain attached later (a Vercel alias, a custom
 * domain) just works with no configuration. Pure, so it's testable; `lib/server/origin.ts` feeds it real headers.
 *
 * Order: the host the visitor actually used (`x-forwarded-host`, then `host`), Vercel's production domain, the
 * deployment's own URL, then localhost. Hosts are validated so a junk header can't inject anything into a page.
 */
export function originFrom(
  get: (name: string) => string | null | undefined,
  env: { VERCEL_PROJECT_PRODUCTION_URL?: string; VERCEL_URL?: string } = {},
): string {
  const host = firstValid(get("x-forwarded-host")) ?? firstValid(get("host"));
  if (host) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || /\.localhost(:\d+)?$/.test(host);
    const proto = (get("x-forwarded-proto") ?? "").split(",")[0]?.trim();
    return `${proto === "http" || proto === "https" ? proto : local ? "http" : "https"}://${host}`;
  }
  const vercel = firstValid(env.VERCEL_PROJECT_PRODUCTION_URL) ?? firstValid(env.VERCEL_URL);
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

/** A bare `host[:port]`, lowercased, or null. Takes the first entry of a comma-separated proxy list. */
function firstValid(raw: string | null | undefined): string | null {
  const v = raw
    ?.split(",")[0]
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  return v && /^(\[[0-9a-f:]+\]|[a-z0-9-]+(\.[a-z0-9-]+)*)(:\d{1,5})?$/.test(v) ? v : null;
}
