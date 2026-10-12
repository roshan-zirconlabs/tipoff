import "server-only";
import { tipoffRevealsAbi } from "@tipoff/core";
import type { Address } from "viem";
import { calls } from "../calls";
import { config } from "../config";
import type { CreatorView } from "../creator-view";
import type { Snapshot } from "../types";
import { publicClient } from "./chain";
import { profileOwning } from "./farcaster";
import { evidenceCreators } from "./trust";

export type { CreatorView };

// A reveal's wallet never changes and its handle rarely does; a short cache keeps pages fast without going stale.
const cache = new Map<number, { at: number; creator: Address | null; handle: string }>();
const TTL_MS = 60_000;

async function revealOf(tipId: number) {
  const hit = cache.get(tipId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  if (!config.reveals) return null;
  try {
    const [creator, handle] = await publicClient.readContract({
      address: config.reveals,
      abi: tipoffRevealsAbi,
      functionName: "revealOf",
      args: [BigInt(tipId)],
    });
    const value = {
      at: Date.now(),
      creator: creator === "0x0000000000000000000000000000000000000000" ? null : creator,
      handle,
    };
    cache.set(tipId, value);
    return value;
  } catch {
    return null;
  }
}

/**
 * Creators of every winning call, keyed `programId:candidateId` (a hit names one creator, whichever scout revealed
 * it). Sources, best first: a commitment-checked reveal (wallet + handle), then the payee of an evidence payment.
 */
export async function resolveCreators(snapshot: Snapshot): Promise<Map<string, CreatorView>> {
  const out = new Map<string, CreatorView>();
  const all = calls(snapshot);
  const reveals = await Promise.all(all.map(async (c) => ({ c, r: await revealOf(c.tipId) })));
  await Promise.all(
    reveals.map(async ({ c, r }) => {
      if (!r?.creator) return;
      const key = `${c.programId}:${c.candidateId}`;
      const profile = r.handle ? await profileOwning(r.handle, r.creator).catch(() => null) : null;
      const prev = out.get(key);
      if (!prev || (!prev.profile && profile)) out.set(key, { wallet: r.creator, profile });
    }),
  );
  const payees = await evidenceCreators(snapshot.programs).catch(() => new Map<string, Address>());
  for (const [key, wallet] of payees) if (!out.has(key)) out.set(key, { wallet, profile: null });
  return out;
}
