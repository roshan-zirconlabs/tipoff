import { describe, expect, it } from "vitest";
import { type EnvioData, snapshotFromEnvio } from "../lib/envio-map";

const CANDIDATE = `0x${"c1".repeat(32)}`;
const B32 = `0x${"00".repeat(32)}`;

const data: EnvioData = {
  Program: [
    {
      id: "1",
      sponsor: "0x02847d22c33f5f060bd27e69f1a413ad44cab213",
      token: "0x534b2f3a21130d7a60830c2df862319e593943a3",
      bounty: "3000000000",
      available: "2000000000",
      rewardPerHit: "1000000000",
      tipDeadline: "2000",
      tailEnd: "9000000",
      claimWindow: "604800",
      topK: 2,
      maxTipsPerScout: 3,
      sealKey: `0x${"11".repeat(32)}`,
      evidenceSpec: "0x",
      metadata: '{"title":"Founders"}',
      createdAt: "1000",
      createdTx: B32,
      tipCount: 3,
      openHits: 1,
      withdrawn: null,
    },
  ],
  Tip: ["1", "2", "3"].map((id) => ({
    id,
    programId: "1",
    scout: `0x${id.repeat(40)}`,
    commitment: B32,
    committedAt: `${1000 + Number(id)}`,
    sponsorEnvelope: "0x01",
    scoutEnvelope: "0x02",
    proven: id !== "2",
    provenFor: id !== "2" ? `1:${CANDIDATE}` : null,
    txHash: B32,
  })),
  Hit: [
    {
      id: `1:${CANDIDATE}`,
      programId: "1",
      candidateId: CANDIDATE,
      source: "evidence",
      actedAt: "5000",
      claimDeadline: "700000",
      reward: "1000000000",
      settled: false,
      evidenceRef: B32,
      actedTx: B32,
      fee: "0",
      returned: "0",
    },
  ],
  Payout: [],
};

describe("snapshotFromEnvio", () => {
  it("maps indexed rows to the same snapshot shape the log reader builds", () => {
    const s = snapshotFromEnvio(data, { now: 6000, block: 42 });
    expect(s).toMatchObject({ now: 6000, block: 42 });
    const [p] = s.programs;
    expect(p).toMatchObject({
      id: 1,
      tipDeadline: 2000,
      topK: 2,
      metadata: { title: "Founders" },
      available: "2000000000",
    });
    expect(p?.hits[0]).toMatchObject({ source: "evidence", topTipIds: [1, 3], proven: 2, settled: false });
    expect(s.tips.map((t) => t.tipId)).toEqual([3, 2, 1]);
  });

  it("caps ranked tips at the program's topK, earliest first", () => {
    const tight = { ...data, Program: data.Program.map((p) => ({ ...p, topK: 1 })) };
    expect(snapshotFromEnvio(tight, { now: 0, block: 0 }).programs[0]?.hits[0]?.topTipIds).toEqual([1]);
  });
});
