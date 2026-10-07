import "server-only";
import { type Address, erc20Abi, type Hex, parseEventLogs } from "viem";
import { type EvidencePayment, payeeOf } from "../trust";
import type { ProgramView } from "../types";
import { publicClient } from "./chain";

// The payee of an evidence hit never changes, so it is cached for the life of the process; freshness is re-read.
const payees = new Map<string, { payee: Address; amount: bigint } | null>();
const NO_REF = `0x${"00".repeat(32)}`;

const evidenceHits = (programs: ProgramView[]) =>
  programs.flatMap((p) =>
    p.hits.filter((h) => h.source === "evidence" && h.evidenceRef !== NO_REF).map((h) => ({ program: p, hit: h })),
  );

async function payeeFor(program: ProgramView, hit: ProgramView["hits"][number]) {
  const key = `${program.id}:${hit.candidateId}`;
  if (!payees.has(key)) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: hit.evidenceRef as Hex });
      const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs })
        .filter((l) => l.address.toLowerCase() === program.token.toLowerCase())
        .map((l) => l.args);
      const match = payeeOf(hit.candidateId, transfers);
      payees.set(key, match ? { payee: match.to, amount: match.value } : null);
    } catch {
      return null; // RPC hiccup: leave uncached and try again next time
    }
  }
  return payees.get(key) ?? null;
}

/**
 * Who each evidence hit paid, keyed `programId:candidateId`. The payee hashes to the hit's candidate, so naming them on
 * a public receipt reveals nothing the payment didn't already make public.
 */
export async function evidenceCreators(programs: ProgramView[]): Promise<Map<string, Address>> {
  const out = new Map<string, Address>();
  await Promise.all(
    evidenceHits(programs).map(async ({ program, hit }) => {
      const p = await payeeFor(program, hit);
      if (p) out.set(`${program.id}:${hit.candidateId}`, p.payee);
    }),
  );
  return out;
}

/** Every evidence hit in these programs, with who was paid and whether that wallet has ever acted on its own. */
export async function evidencePayments(programs: ProgramView[]): Promise<EvidencePayment[]> {
  const out = await Promise.all(
    evidenceHits(programs).map(async ({ program, hit }) => {
      const found = await payeeFor(program, hit);
      if (!found) return null;
      const nonce = await publicClient.getTransactionCount({ address: found.payee }).catch(() => null);
      if (nonce === null) return null;
      return {
        programId: program.id,
        candidateId: hit.candidateId,
        payee: found.payee,
        amount: `${found.amount}`,
        txHash: hit.evidenceRef as Hex,
        fresh: nonce === 0,
      } satisfies EvidencePayment;
    }),
  );
  return out.filter((p): p is EvidencePayment => p !== null);
}
