import { createTestIndexer } from "envio";
import { describe, expect, it } from "vitest";

const SPONSOR = "0x02847D22C33f5F060Bd27e69F1a413AD44cab213";
const SCOUT_A = "0x16773a3fB17A2Ac4E1c9216cD43Da829f33ACe4b";
const SCOUT_B = "0xA1EEDaB277c2615Da83927cDDc89BCfC770DE634";
const USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const CANDIDATE = `0x${"c1".repeat(32)}`;
const B32 = `0x${"00".repeat(32)}`;

describe("Tipoff indexer", () => {
  it("builds programs, tips, hits, payouts and public records from events alone", async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            {
              contract: "Tipoff",
              event: "ProgramCreated",
              block: { timestamp: 1_000 },
              params: {
                programId: 1n,
                sponsor: SPONSOR,
                token: USDC,
                bounty: 3_000_000_000n,
                rewardPerHit: 1_000_000_000n,
                tipDeadline: 2_000n,
                tailEnd: 9_000_000n,
                claimWindow: 604_800n,
                topK: 3n,
                maxTipsPerScout: 3n,
                sealKey: `0x${"11".repeat(32)}`,
                evidenceSpec: "0x7b7d",
                metadata: '{"title":"Founders"}',
              },
            },
            {
              contract: "Tipoff",
              event: "TipCommitted",
              block: { timestamp: 1_100 },
              params: {
                programId: 1n,
                tipId: 1n,
                scout: SCOUT_A,
                commitment: B32,
                sponsorEnvelope: "0x01",
                scoutEnvelope: "0x02",
              },
            },
            {
              contract: "Tipoff",
              event: "TipCommitted",
              block: { timestamp: 1_200 },
              params: {
                programId: 1n,
                tipId: 2n,
                scout: SCOUT_B,
                commitment: B32,
                sponsorEnvelope: "0x03",
                scoutEnvelope: "0x04",
              },
            },
            {
              contract: "Tipoff",
              event: "CandidateActed",
              block: { timestamp: 5_000 },
              params: {
                programId: 1n,
                candidateId: CANDIDATE,
                source: 2n,
                actedAt: 5_000n,
                claimDeadline: 700_000n,
                reward: 1_000_000_000n,
                evidenceRef: B32,
              },
            },
            {
              contract: "Tipoff",
              event: "TipProven",
              params: { programId: 1n, candidateId: CANDIDATE, tipId: 1n, scout: SCOUT_A },
            },
            {
              contract: "Tipoff",
              event: "HitSettled",
              params: {
                programId: 1n,
                candidateId: CANDIDATE,
                tipIds: [1n],
                scouts: [SCOUT_A],
                amounts: [995_000_000n],
                fee: 5_000_000n,
                returned: 0n,
              },
            },
          ],
        },
      },
    });

    const program = await indexer.Program.getOrThrow("1");
    expect(program.tipCount).toBe(2);
    expect(program.available).toBe(2_000_000_000n);
    expect(program.openHits).toBe(0);
    expect(program.createdAt).toBe(1_000n);

    const hit = await indexer.Hit.getOrThrow(`1:${CANDIDATE}`);
    expect(hit.source).toBe("evidence");
    expect(hit.settled).toBe(true);
    expect(hit.fee).toBe(5_000_000n);

    expect(await indexer.Tip.getOrThrow("1")).toMatchObject({ proven: true, provenFor: `1:${CANDIDATE}` });
    expect((await indexer.Tip.getOrThrow("2")).proven).toBe(false);

    const a = await indexer.Scout.getOrThrow(SCOUT_A.toLowerCase());
    expect(a).toMatchObject({ tips: 1, wins: 1, earned: 995_000_000n });
    const b = await indexer.Scout.getOrThrow(SCOUT_B.toLowerCase());
    expect(b).toMatchObject({ tips: 1, wins: 0, earned: 0n });

    const sponsor = await indexer.Sponsor.getOrThrow(SPONSOR.toLowerCase());
    expect(sponsor).toMatchObject({ programs: 1, byEvidence: 1, bySponsor: 0, paidToScouts: 995_000_000n });
  });
});
