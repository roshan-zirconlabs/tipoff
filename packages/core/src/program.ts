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

/** Geometric split mirroring Tipoff.payoutSplit: rank i gets 2^(n-1-i)/(2^n-1); rank 0 takes rounding dust. */
export function payoutSplit(net: bigint, n: number): bigint[] {
  if (n <= 0) return [];
  const denominator = (1n << BigInt(n)) - 1n;
  const rest = Array.from({ length: n - 1 }, (_, j) => (net * (1n << BigInt(n - 2 - j))) / denominator);
  const paid = rest.reduce((sum, a) => sum + a, 0n);
  return [net - paid, ...rest];
}

export function feeOf(reward: bigint, feeBps: number): bigint {
  return (reward * BigInt(feeBps)) / 10_000n;
}

/** Share of a hit each rank earns when `k` tips are proven, as fractions for display. */
export function rankShares(k: number): number[] {
  const denominator = 2 ** k - 1;
  return Array.from({ length: k }, (_, i) => 2 ** (k - 1 - i) / denominator);
}
