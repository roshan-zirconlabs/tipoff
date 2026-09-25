import { CandidateKind } from "@tipoff/core";
import { describe, expect, it } from "vitest";
import { type OpenedTipView, tipStatus } from "../lib/client/tips";
import type { HitView, ProgramView } from "../lib/types";

const CANDIDATE = `0x${"ab".repeat(32)}` as const;

function program(hit?: Partial<HitView>): ProgramView {
  return {
    id: 1,
    sponsor: "0x0000000000000000000000000000000000000001",
    token: "0x0000000000000000000000000000000000000002",
    bounty: "3000000000",
    available: "2000000000",
    rewardPerHit: "1000000000",
    tipDeadline: 1_000,
    tailEnd: 10_000,
    claimWindow: 500,
    createdAt: 0,
    topK: 2,
    maxTipsPerScout: 3,
    sealKey: `0x${"11".repeat(32)}`,
    tipCount: 3,
    openHits: 1,
    withdrawn: null,
    metadata: { v: 1, title: "t", brief: "", sponsorName: "", candidateKind: CandidateKind.Wallet },
    evidence: { v: 1, kind: "none" },
    createdTx: `0x${"00".repeat(32)}`,
    hits: hit
      ? [
          {
            programId: 1,
            candidateId: CANDIDATE,
            source: "sponsor",
            actedAt: 500,
            claimDeadline: 1_500,
            reward: "1000000000",
            proven: 0,
            settled: false,
            topTipIds: [],
            evidenceRef: `0x${"00".repeat(32)}`,
            actedTx: `0x${"00".repeat(32)}`,
            payouts: [],
            fee: "0",
            returned: "0",
            ...hit,
          },
        ]
      : [],
  };
}

function tip(over: Partial<OpenedTipView> = {}): OpenedTipView {
  return {
    tipId: 5,
    programId: 1,
    scout: "0x0000000000000000000000000000000000000003",
    commitment: `0x${"22".repeat(32)}`,
    committedAt: 100,
    sponsorEnvelope: "0x01",
    scoutEnvelope: "0x02",
    proven: false,
    txHash: `0x${"00".repeat(32)}`,
    plaintext: null,
    candidateId: CANDIDATE,
    valid: true,
    ...over,
  };
}

describe("tipStatus", () => {
  it("is sealed until the sponsor acts on the candidate", () => {
    expect(tipStatus(tip(), program(), 200).kind).toBe("sealed");
  });

  it("is claimable after a hit, inside the claim window", () => {
    expect(tipStatus(tip(), program({}), 800).kind).toBe("claimable");
  });

  it("does not count tips sent at or after the action", () => {
    expect(tipStatus(tip({ committedAt: 500 }), program({}), 800).kind).toBe("too-late");
  });

  it("is claimed once proven, and paid once settled with a payout", () => {
    expect(tipStatus(tip({ proven: true }), program({ proven: 1, topTipIds: [5] }), 800).kind).toBe("claimed");
    const paid = tipStatus(
      tip({ proven: true }),
      program({
        settled: true,
        payouts: [{ tipId: 5, scout: "0x0000000000000000000000000000000000000003", amount: "995000000" }],
      }),
      2_000,
    );
    expect(paid).toMatchObject({ kind: "paid", amount: "995000000" });
  });

  it("is outranked when earlier tips already fill every paid spot", () => {
    expect(tipStatus(tip(), program({ proven: 2, topTipIds: [1, 2] }), 800).kind).toBe("outranked");
  });

  it("can still claim when later tips hold the spots (it would displace them)", () => {
    expect(tipStatus(tip({ tipId: 5 }), program({ proven: 2, topTipIds: [6, 7] }), 800).kind).toBe("claimable");
  });

  it("is missed after the claim window", () => {
    expect(tipStatus(tip(), program({}), 1_501).kind).toBe("missed");
  });
});
