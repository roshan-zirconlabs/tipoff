import { CandidateKind, candidateId } from "@tipoff/core";
import { describe, expect, it } from "vitest";
import { type EvidencePayment, freshWalletNote, payeeOf } from "../lib/trust";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const T = "0x3333333333333333333333333333333333333333";

describe("payeeOf", () => {
  it("finds exactly the transfer that paid the hit's candidate", () => {
    const cid = candidateId({ kind: CandidateKind.Wallet, value: B });
    const transfers = [
      { from: T, to: A, value: 5n },
      { from: T, to: B, value: 7n },
    ] as const;
    expect(payeeOf(cid, [...transfers])).toEqual(transfers[1]);
    expect(payeeOf(candidateId({ kind: CandidateKind.Wallet, value: T }), [...transfers])).toBeNull();
  });
});

describe("freshWalletNote", () => {
  const p = (fresh: boolean) => ({ fresh }) as EvidencePayment;
  it("stays quiet unless a payee had never transacted", () => {
    expect(freshWalletNote([])).toBeNull();
    expect(freshWalletNote([p(false)])).toBeNull();
    expect(freshWalletNote([p(true), p(false)])).toMatch(/^1 of 2 evidence hits were paid/);
    expect(freshWalletNote([p(true)])).toMatch(/^1 of 1 evidence hit was paid/);
  });
});
