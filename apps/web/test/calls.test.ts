import { CandidateKind, candidateId } from "@tipoff/core";
import { describe, expect, it } from "vitest";
import { calls, cleanLabel, reputationOf, standings, verifiedCreator } from "../lib/calls";
import type { HitView, ProgramView, Snapshot, TipView } from "../lib/types";

const A = "0x00000000000000000000000000000000000000aa" as const;
const B = "0x00000000000000000000000000000000000000bb" as const;
const CREATOR = "0x00000000000000000000000000000000000c0de1" as const;
const CID = candidateId({ kind: CandidateKind.Wallet, value: CREATOR });
const DAY = 86_400;

function snapshot(): Snapshot {
  const hit = {
    programId: 1,
    candidateId: CID,
    source: "evidence",
    actedAt: 50 * DAY,
    claimDeadline: 60 * DAY,
    reward: "1000",
    proven: 2,
    settled: true,
    topTipIds: [1, 3],
    payouts: [
      { tipId: 1, scout: A, amount: "750" },
      { tipId: 3, scout: B, amount: "250" },
    ],
  } as unknown as HitView;
  const program = {
    id: 1,
    sponsor: "0x00000000000000000000000000000000000000ff",
    metadata: { title: "Artists we'll commission", sponsorName: "Glasshouse DAO" },
    hits: [hit],
  } as unknown as ProgramView;
  const tip = (tipId: number, scout: `0x${string}`, day: number) =>
    ({ tipId, programId: 1, scout, committedAt: day * DAY }) as unknown as TipView;
  return { now: 70 * DAY, block: 1, programs: [program], tips: [tip(1, A, 9), tip(2, A, 20), tip(3, B, 40)] };
}

describe("calls", () => {
  it("turns each ranked winning tip into a public call with days early and payout", () => {
    const [first, second] = calls(snapshot());
    expect(first).toMatchObject({ tipId: 1, rank: 1, scout: A, daysEarly: 41, status: "paid", amount: "750" });
    expect(second).toMatchObject({ tipId: 3, rank: 2, scout: B, daysEarly: 10, amount: "250" });
  });

  it("ranks scouts by earnings with an unpaddable hit rate", () => {
    const [a, b] = standings(snapshot());
    if (!a || !b) throw new Error("expected two scouts");
    expect(a).toMatchObject({ scout: A, tips: 2, calls: 1, earned: 750n, hitRate: 0.5, medianDaysEarly: 41 });
    expect(b).toMatchObject({ scout: B, calls: 1, earned: 250n, hitRate: 1 });
    expect(reputationOf(a)).toBe("1/2 calls · 50%");
    expect(reputationOf(undefined)).toBeNull();
    expect(reputationOf({ ...a, calls: 0, tips: 1 })).toBe("1 tip, no calls yet");
  });
});

describe("receipt verification", () => {
  it("accepts only the wallet that hashes to the call's candidate", () => {
    const call = { candidateId: CID };
    expect(verifiedCreator(call, CREATOR)).toBe(CREATOR);
    expect(verifiedCreator(call, A)).toBeNull();
    expect(verifiedCreator(call, "0xnope")).toBeNull();
    expect(verifiedCreator(call, null)).toBeNull();
  });

  it("keeps scout labels short and plain", () => {
    expect(cleanLabel("  Mira <script>  ")).toBe("Mira script");
    expect(cleanLabel("x".repeat(80))).toHaveLength(48);
    expect(cleanLabel("")).toBeNull();
  });
});
