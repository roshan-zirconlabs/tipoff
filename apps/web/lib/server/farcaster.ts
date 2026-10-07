import "server-only";
import { normalizeHandle } from "@tipoff/core";
import { type Address, getAddress, isAddress } from "viem";
import type { FarcasterProfile } from "../farcaster-types";

// Farcaster's public read API: profile and verified wallets by username, no key required. Cached per process so a
// popular receipt doesn't hammer it; misses are cached briefly too.
const API = "https://api.farcaster.xyz";
const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: FarcasterProfile | null }>();

type UserResponse = {
  result?: { user?: { fid: number; username: string; displayName?: string; pfp?: { url?: string } } };
};
type VerificationsResponse = {
  result?: { verifications?: { address: string; protocol: string; isPrimary?: boolean }[] };
};

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { accept: "application/json" } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function lookupHandle(raw: string): Promise<FarcasterProfile | null> {
  const handle = normalizeHandle(raw);
  if (!handle) return null;
  const hit = cache.get(handle);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const user = (await getJson<UserResponse>(`${API}/v2/user-by-username?username=${encodeURIComponent(handle)}`))
    ?.result?.user;
  let value: FarcasterProfile | null = null;
  if (user?.fid) {
    const verifications =
      (await getJson<VerificationsResponse>(`${API}/v2/verifications?fid=${user.fid}`))?.result?.verifications ?? [];
    const eth = verifications.filter((v) => v.protocol === "ethereum" && isAddress(v.address));
    const pfp = user.pfp?.url && /^https:\/\//.test(user.pfp.url) ? user.pfp.url : null;
    value = {
      fid: user.fid,
      username: user.username,
      displayName: (user.displayName || user.username).slice(0, 60),
      pfp,
      primary: (() => {
        const p = eth.find((v) => v.isPrimary) ?? eth[0];
        return p ? getAddress(p.address) : null;
      })(),
      wallets: eth.map((v) => getAddress(v.address)) as Address[],
    };
  }
  cache.set(handle, { at: Date.now(), value });
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
  return value;
}

/** The handle's profile, only if `wallet` is one of the wallets they've verified (so a receipt can't borrow a face). */
export async function profileOwning(handle: string | null | undefined, wallet: Address | null) {
  if (!handle || !wallet) return null;
  const p = await lookupHandle(handle);
  return p?.wallets.some((w) => w.toLowerCase() === wallet.toLowerCase()) ? p : null;
}
