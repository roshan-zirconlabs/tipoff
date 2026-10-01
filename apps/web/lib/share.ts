import type { Address } from "viem";

/** The public URL of a call's receipt; `c` (creator wallet) is verified server-side before it is shown. */
export function receiptPath(tipId: number, creator?: Address | null, label?: string | null): string {
  const q = new URLSearchParams();
  if (creator) q.set("c", creator);
  if (creator && label) q.set("n", label);
  const qs = q.toString();
  return `/calls/${tipId}${qs ? `?${qs}` : ""}`;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function shareText(opts: { label: string | null; daysEarly: number; patron: string }): string {
  const who = opts.label ?? "a creator";
  const days = Math.max(1, Math.round(opts.daysEarly));
  return `I called ${who} ${days} day${days === 1 ? "" : "s"} before ${opts.patron} paid them. Sealed on Monad, paid by Tipoff.`;
}

export function shareLinks(url: string, text: string) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  return {
    x: `https://x.com/intent/post?text=${t}&url=${u}`,
    farcaster: `https://farcaster.xyz/~/compose?text=${t}&embeds[]=${u}`,
  };
}
