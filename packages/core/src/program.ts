import { type Address, type Hex, hexToString, isHex, stringToHex } from "viem";
import { CandidateKind } from "./candidate.ts";

/** Mirrors Tipoff.ProgramParams. */
export type ProgramParams = {
  token: Address;
  bounty: bigint;
  rewardPerHit: bigint;
  tipDeadline: bigint;
  tailEnd: bigint;
  claimWindow: number;
  topK: number;
  maxTipsPerScout: number;
  baseWeight: bigint;
  minStake: bigint;
  curveDepth: bigint;
  sealKey: Hex;
  evidenceSpec: Hex;
  metadata: string;
};

/** Human-facing description of a program, stored as JSON in `metadata`. */
export type ProgramMetadata = {
  v: 1;
  title: string;
  brief: string;
  sponsorName: string;
  candidateKind: CandidateKind;
  /** What a good tip looks like, shown to scouts. */
  lookingFor?: string;
};

/** How the evidence resolver recognises the sponsor acting. Stored as JSON bytes in `evidenceSpec`. */
export type EvidenceSpec =
  | { v: 1; kind: "evm-payment"; token: Address; treasuries: Address[]; minAmount: string }
  | { v: 1; kind: "none" };

export const DAY = 86_400;
export const MIN_TAIL_DAYS = 90;
export const MIN_CLAIM_DAYS = 7;
export const MAX_TOP_K = 5;
export const MAX_NOTE_CHARS = 280;
/** Mirrors Tipoff.MIN_TIP_AGE: a tip must predate the action by this many seconds to count. */
export const MIN_TIP_AGE = 60;

export function encodeMetadata(m: ProgramMetadata): string {
  return JSON.stringify(m);
}

export function decodeMetadata(raw: string): ProgramMetadata {
  try {
    const m = JSON.parse(raw) as Partial<ProgramMetadata>;
    return {
      v: 1,
      title: typeof m.title === "string" && m.title ? m.title : "Untitled program",
      brief: typeof m.brief === "string" ? m.brief : "",
      sponsorName: typeof m.sponsorName === "string" ? m.sponsorName : "",
      candidateKind: m.candidateKind === CandidateKind.DeezerArtist ? CandidateKind.DeezerArtist : CandidateKind.Wallet,
      lookingFor: typeof m.lookingFor === "string" ? m.lookingFor : undefined,
    };
  } catch {
    return { v: 1, title: "Untitled program", brief: "", sponsorName: "", candidateKind: CandidateKind.Wallet };
  }
}

export function encodeEvidenceSpec(spec: EvidenceSpec): Hex {
  return stringToHex(JSON.stringify(spec));
}

export function decodeEvidenceSpec(raw: Hex): EvidenceSpec {
  if (!isHex(raw) || raw === "0x") return { v: 1, kind: "none" };
  try {
    const spec = JSON.parse(hexToString(raw)) as EvidenceSpec;
    if (spec.kind === "evm-payment" && Array.isArray(spec.treasuries)) return spec;
  } catch {}
  return { v: 1, kind: "none" };
}

const mulDiv = (x: bigint, y: bigint, d: bigint) => (x * y) / d;

/**
 * The sealed bonding curve, mirroring Tipoff.curveShares: replayed in commit order, tip i with weight w buys
 * depth²·w / ((depth + S)(depth + S + w)) shares, S being the weight committed before it.
 */
export function curveShares(depth: bigint, weights: bigint[]): bigint[] {
  let before = 0n;
  return weights.map((w) => {
    const shares = mulDiv(mulDiv(depth, w, depth + before), depth, depth + before + w);
    before += w;
    return shares;
  });
}

/** Mirrors Tipoff.splitByShares: pro rata, rounding down, earliest tip takes the dust; equal split if all zero. */
export function splitByShares(net: bigint, shares: bigint[]): bigint[] {
  const n = shares.length;
  if (n === 0) return [];
  const total = shares.reduce((a, b) => a + b, 0n);
  const rest = shares.slice(1).map((s) => (total === 0n ? net / BigInt(n) : mulDiv(net, s, total)));
  return [net - rest.reduce((a, b) => a + b, 0n), ...rest];
}

/** What a hit pays each proven tip, given each tip's stake in commit order. */
export function payoutFor(net: bigint, stakes: bigint[], curve: { baseWeight: bigint; curveDepth: bigint }): bigint[] {
  return splitByShares(
    net,
    curveShares(
      curve.curveDepth,
      stakes.map((s) => curve.baseWeight + s),
    ),
  );
}

/**
 * Spot price of a share once `weight` has been committed to a candidate: (1 + S/depth)². Only the sponsor can compute
 * this for a live candidate, because only the sponsor can open the tips.
 */
export function impliedPrice(weight: bigint, depth: bigint): number {
  const x = 1 + Number(weight) / Number(depth);
  return x * x;
}

/**
 * How much a stake lifts a tip's shares versus the same tip unstaked, when `weightBefore` is already on the candidate.
 * It is smallest for the first tip on a candidate, so the value at weightBefore = 0 is a floor a scout can quote.
 */
export function stakeBoost(
  stake: bigint,
  curve: { baseWeight: bigint; curveDepth: bigint },
  weightBefore = 0n,
): number {
  const L = Number(curve.curveDepth);
  const S = Number(weightBefore);
  const b = Number(curve.baseWeight);
  const w = b + Number(stake);
  return (w * (L + S + b)) / (b * (L + S + w));
}

export function feeOf(reward: bigint, feeBps: number): bigint {
  return (reward * BigInt(feeBps)) / 10_000n;
}

/** Share of a hit each rank earns when `k` free tips are proven, as fractions for display. */
export function rankShares(k: number, curve: { baseWeight: bigint; curveDepth: bigint }): number[] {
  const shares = curveShares(curve.curveDepth, Array(k).fill(curve.baseWeight));
  const total = shares.reduce((a, b) => a + b, 0n);
  return shares.map((s) => (total === 0n ? 1 / k : Number(s) / Number(total)));
}
