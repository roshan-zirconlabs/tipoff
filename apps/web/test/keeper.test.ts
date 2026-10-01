import { describe, expect, it } from "vitest";
import { GasBudget, serial } from "../lib/gas-budget";
import { dueWork } from "../lib/keeper";
import type { HitView, ProgramView, Snapshot, TipView } from "../lib/types";

const C = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as const;

function hit(over: Partial<HitView>): HitView {
  return {
    programId: 1,
    candidateId: C(1),
    source: "evidence",
    actedAt: 100,
    claimDeadline: 1_000,
    reward: "5",
    proven: 1,
    settled: false,
    topTipIds: [1],
    evidenceRef: C(0),
    actedTx: C(0),
    payouts: [],
    fee: "0",
    returned: "0",
    ...over,
  };
}

function snapshot(now: number, hits: HitView[], tips: Partial<TipView>[] = []): Snapshot {
  const program = { id: 1, tipDeadline: 500, hits } as unknown as ProgramView;
  return {
    now,
    block: 1,
    programs: [program],
    tips: tips.map((t, i) => ({ tipId: i + 1, programId: 1, stake: "0", stakeReturned: false, ...t }) as TipView),
  };
}

describe("dueWork", () => {
  it("settles only unsettled, funded hits whose claim window has closed, oldest first", () => {
    const s = snapshot(2_000, [
      hit({ candidateId: C(1), claimDeadline: 1_500 }),
      hit({ candidateId: C(2), claimDeadline: 1_200 }),
      hit({ candidateId: C(3), claimDeadline: 2_000 }), // closes at, not before, now
      hit({ candidateId: C(4), settled: true }),
      hit({ candidateId: C(5), reward: "0" }),
    ]);
    expect(dueWork(s)).toEqual([
      { type: "settle", programId: "1", candidateId: C(2) },
      { type: "settle", programId: "1", candidateId: C(1) },
    ]);
  });

  it("returns unreturned stakes once tipping has closed, after payouts, within the limit", () => {
    const tips = [{ stake: "10" }, { stake: "0" }, { stake: "7", stakeReturned: true }, { stake: "3" }];
    expect(dueWork(snapshot(400, [], tips))).toEqual([]); // tipping still open
    expect(dueWork(snapshot(600, [hit({})], tips))).toEqual([
      { type: "returnStake", tipId: "1" },
      { type: "returnStake", tipId: "4" },
    ]);
    expect(dueWork(snapshot(2_000, [hit({})], tips), 2)).toEqual([
      { type: "settle", programId: "1", candidateId: C(1) },
      { type: "returnStake", tipId: "1" },
    ]);
  });
});

describe("GasBudget", () => {
  it("caps each actor and the relayer as a whole, and resets after a day", () => {
    let now = 0;
    const b = new GasBudget({ perActorWei: 10n, globalWei: 15n }, () => now);
    expect(b.check("a", 10n)).toBeNull();
    b.charge("a", 10n);
    expect(b.check("a", 1n)).toBe("actor");
    expect(b.check("b", 5n)).toBeNull();
    b.charge("b", 5n);
    expect(b.check("c", 1n)).toBe("global");
    now += 86_400_001;
    expect(b.check("a", 10n)).toBeNull();
  });
});

describe("serial", () => {
  it("runs jobs one at a time in call order, even when one fails", async () => {
    const run = serial();
    const order: string[] = [];
    const job = (name: string, ms: number, fail = false) =>
      run(async () => {
        order.push(`start ${name}`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`end ${name}`);
        if (fail) throw new Error(name);
        return name;
      });
    const results = await Promise.allSettled([job("a", 20, true), job("b", 1), job("c", 5)]);
    expect(order).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled", "fulfilled"]);
  });
});
