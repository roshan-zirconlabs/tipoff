"use client";

import { openTip, type TipPlaintext } from "@tipoff/core";
import { useMemo } from "react";
import type { Address, Hex } from "viem";
import { config } from "../config";
import type { HitView, ProgramView, Snapshot, TipView } from "../types";

export type OpenedTipView = TipView & {
  plaintext: TipPlaintext | null;
  candidateId: Hex | null;
  valid: boolean;
};

export type TipStatus =
  | { kind: "sealed" }
  | { kind: "claimable"; hit: HitView }
  | { kind: "claimed"; hit: HitView }
  | { kind: "paid"; hit: HitView; amount: string }
  | { kind: "outranked"; hit: HitView }
  | { kind: "too-late"; hit: HitView }
  | { kind: "missed"; hit: HitView };

/** Open envelopes with a seal key. Envelopes that fail to open are kept with `plaintext: null`. */
export function useOpenedTips(
  tips: TipView[],
  sealSecret: Uint8Array | null | undefined,
  which: "sponsor" | "scout",
): OpenedTipView[] {
  return useMemo(() => {
    if (!sealSecret) return [];
    return tips.map((t) => {
      try {
        const opened = openTip(
          sealSecret,
          which === "sponsor" ? t.sponsorEnvelope : t.scoutEnvelope,
          { chainId: config.chainId, contract: config.tipoff, programId: BigInt(t.programId), scout: t.scout },
          t.commitment,
        );
        const { candidateId, valid, ...plaintext } = opened;
        return { ...t, plaintext, candidateId, valid };
      } catch {
        return { ...t, plaintext: null, candidateId: null, valid: false };
      }
    });
  }, [tips, sealSecret, which]);
}

export function tipStatus(tip: OpenedTipView, program: ProgramView | undefined, now: number): TipStatus {
  const hit = program?.hits.find((h) => h.candidateId === tip.candidateId);
  if (!hit || !program) return { kind: "sealed" };
  const payout = hit.payouts.find((p) => p.tipId === tip.tipId);
  if (payout) return { kind: "paid", hit, amount: payout.amount };
  if (tip.committedAt >= hit.actedAt) return { kind: "too-late", hit };
  if (hit.settled) return tip.proven ? { kind: "outranked", hit } : { kind: "missed", hit };
  if (tip.proven) return { kind: "claimed", hit };
  if (now > hit.claimDeadline) return { kind: "missed", hit };
  // Would this tip still fit in the paid ranks?
  const earlierProven = hit.topTipIds.filter((id) => id < tip.tipId).length;
  if (hit.topTipIds.length >= program.topK && earlierProven >= program.topK) return { kind: "outranked", hit };
  return { kind: "claimable", hit };
}

export function mineOnly(snapshot: Snapshot | undefined, address: Address | undefined): TipView[] {
  if (!snapshot || !address) return [];
  return snapshot.tips.filter((t) => t.scout.toLowerCase() === address.toLowerCase());
}
