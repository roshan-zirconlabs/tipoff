import { CandidateKind, candidateId } from "@tipoff/core";
import type { Address, Hex } from "viem";

export type EvidencePayment = {
  programId: number;
  candidateId: Hex;
  payee: Address;
  amount: string;
  txHash: Hex;
  /** The payee has never sent a transaction: the profile of a wallet made just to receive this payment. */
  fresh: boolean;
};

/**
 * Which transfer in the evidence transaction paid the hit's candidate. The candidate id is a hash of the payee's
 * wallet, so the match is exact, not a guess.
 */
export function payeeOf(
  hitCandidateId: Hex,
  transfers: { from: Address; to: Address; value: bigint }[],
): { to: Address; value: bigint } | null {
  const want = hitCandidateId.toLowerCase();
  return transfers.find((t) => candidateId({ kind: CandidateKind.Wallet, value: t.to }).toLowerCase() === want) ?? null;
}

/** A sentence scouts can weigh, or null when nothing stands out. */
export function freshWalletNote(payments: EvidencePayment[]): string | null {
  const fresh = payments.filter((p) => p.fresh).length;
  if (!fresh) return null;
  return `${fresh} of ${payments.length} evidence hit${payments.length === 1 ? " was" : "s were"} paid to a wallet that had never sent a transaction. That's normal for a new hire, but it's also what a sponsor paying itself would look like.`;
}
