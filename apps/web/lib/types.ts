import type { EvidenceSpec, ProgramMetadata } from "@tipoff/core";
import type { Address, Hex } from "viem";

// JSON-safe view models. Amounts are base-unit strings; times are unix seconds (chain time).

export type HitView = {
  programId: number;
  candidateId: Hex;
  source: "sponsor" | "evidence";
  actedAt: number;
  claimDeadline: number;
  reward: string;
  proven: number;
  settled: boolean;
  topTipIds: number[];
  evidenceRef: Hex;
  actedTx: Hex;
  payouts: { tipId: number; scout: Address; amount: string }[];
  fee: string;
  returned: string;
};

export type ProgramView = {
  id: number;
  sponsor: Address;
  token: Address;
  bounty: string;
  available: string;
  rewardPerHit: string;
  tipDeadline: number;
  tailEnd: number;
  claimWindow: number;
  createdAt: number;
  topK: number;
  maxTipsPerScout: number;
  sealKey: Hex;
  tipCount: number;
  openHits: number;
  withdrawn: string | null;
  metadata: ProgramMetadata;
  evidence: EvidenceSpec;
  createdTx: Hex;
  hits: HitView[];
};

export type TipView = {
  tipId: number;
  programId: number;
  scout: Address;
  commitment: Hex;
  committedAt: number;
  sponsorEnvelope: Hex;
  scoutEnvelope: Hex;
  proven: boolean;
  txHash: Hex;
};

export type Snapshot = {
  /** Latest block timestamp — the clock every countdown uses. */
  now: number;
  block: number;
  programs: ProgramView[];
  tips: TipView[];
};

export type ProgramPhase = "tipping" | "tail" | "closed";

export function phaseOf(p: ProgramView, now: number): ProgramPhase {
  if (now <= p.tipDeadline) return "tipping";
  if (now <= p.tailEnd + p.claimWindow) return "tail";
  return "closed";
}

export type ScoutRecord = {
  address: Address;
  tips: number;
  programs: number;
  wins: number;
  earned: string;
};

export type SponsorRecord = {
  address: Address;
  programs: number;
  committed: string;
  hits: number;
  bySponsor: number;
  byEvidence: number;
  paidToScouts: string;
};

export function scoutRecord(snapshot: Snapshot, address: Address): ScoutRecord {
  const mine = snapshot.tips.filter((t) => t.scout.toLowerCase() === address.toLowerCase());
  let earned = 0n;
  let wins = 0;
  for (const p of snapshot.programs) {
    for (const h of p.hits) {
      for (const pay of h.payouts) {
        if (pay.scout.toLowerCase() === address.toLowerCase()) {
          earned += BigInt(pay.amount);
          wins += 1;
        }
      }
    }
  }
  return {
    address,
    tips: mine.length,
    programs: new Set(mine.map((t) => t.programId)).size,
    wins,
    earned: `${earned}`,
  };
}

export function sponsorRecord(snapshot: Snapshot, address: Address): SponsorRecord {
  const mine = snapshot.programs.filter((p) => p.sponsor.toLowerCase() === address.toLowerCase());
  let committed = 0n;
  let paid = 0n;
  let bySponsor = 0;
  let byEvidence = 0;
  for (const p of mine) {
    committed += BigInt(p.bounty);
    for (const h of p.hits) {
      if (h.source === "sponsor") bySponsor += 1;
      else byEvidence += 1;
      for (const pay of h.payouts) paid += BigInt(pay.amount);
    }
  }
  return {
    address,
    programs: mine.length,
    committed: `${committed}`,
    hits: bySponsor + byEvidence,
    bySponsor,
    byEvidence,
    paidToScouts: `${paid}`,
  };
}
