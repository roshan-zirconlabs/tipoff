import { type Address, getAddress, type Hex, isAddressEqual } from "viem";
import { CandidateKind, candidateId } from "./candidate.ts";
import type { EvidenceSpec } from "./program.ts";

/** The slice of a program the resolver needs. */
export type ResolvableProgram = {
  programId: bigint;
  createdAt: bigint;
  tailEnd: bigint;
  spec: EvidenceSpec;
};

/** An ERC-20 Transfer observed on-chain. */
export type TransferEvidence = {
  token: Address;
  from: Address;
  to: Address;
  value: bigint;
  timestamp: bigint;
  txHash: Hex;
};

export type EvidenceReport = {
  programId: bigint;
  candidateId: Hex;
  actedAt: bigint;
  evidenceRef: Hex;
  /** For logs and UI: who got paid. */
  paidTo: Address;
};

/**
 * Turn observed treasury payments into Tipoff reports. A payment counts when it comes from a treasury the sponsor
 * declared, in the declared token, for at least the declared amount, inside the program's window — and is not a
 * deposit into Tipoff itself or a move between the sponsor's own treasuries. The earliest qualifying payment per
 * (program, candidate) wins.
 *
 * Pure and deterministic so the local dev resolver and the Chainlink CRE workflow share it.
 */
export function matchPayments(
  programs: ResolvableProgram[],
  transfers: TransferEvidence[],
  tipoff: Address,
): EvidenceReport[] {
  const best = new Map<string, EvidenceReport>();
  for (const program of programs) {
    const spec = program.spec;
    if (spec.kind !== "evm-payment") continue;
    const treasuries = spec.treasuries.map((t) => getAddress(t));
    const min = BigInt(spec.minAmount);
    for (const t of transfers) {
      if (!isAddressEqual(t.token, spec.token)) continue;
      if (!treasuries.some((tr) => isAddressEqual(tr, t.from))) continue;
      if (isAddressEqual(t.to, tipoff) || treasuries.some((tr) => isAddressEqual(tr, t.to))) continue;
      if (t.value < min) continue;
      if (t.timestamp < program.createdAt || t.timestamp > program.tailEnd) continue;

      const id = candidateId({ kind: CandidateKind.Wallet, value: getAddress(t.to) });
      const key = `${program.programId}:${id}`;
      const existing = best.get(key);
      if (!existing || t.timestamp < existing.actedAt) {
        best.set(key, {
          programId: program.programId,
          candidateId: id,
          actedAt: t.timestamp,
          evidenceRef: t.txHash,
          paidTo: getAddress(t.to),
        });
      }
    }
  }
  return [...best.values()].sort((a, b) => Number(a.actedAt - b.actedAt));
}
