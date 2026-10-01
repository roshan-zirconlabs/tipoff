import { hashTypedData, toHex } from "viem";
import { describe, expect, it } from "vitest";
import {
  CandidateKind,
  candidateId,
  commitmentOf,
  curveShares,
  envelopesHash,
  hashProgramParams,
  payoutFor,
  rankShares,
  splitByShares,
  stakeBoost,
  tipoffDomain,
  tipoffTypes,
} from "../src/index.ts";

// Pinned in contracts/test/Vectors.t.sol — both suites must agree.
const SCOUT = "0x1111111111111111111111111111111111111111";
const FOUNDER = "0x2222222222222222222222222222222222222222";
const VERIFYING = "0x3333333333333333333333333333333333333333";
const SALT = "0x0000000000000000000000000000000000000000000000000000000000005a17";

const CANDIDATE = "0x14ad4897ee970425389d12ff39927db9a16d3b0fc272c700ef0c2c1ec3e4cfec";
const COMMITMENT = "0xb3f75372009b457621617e60f1e0c2d1b23a8739e08f5ee85442f8713812ab8f";
const ENVELOPES = "0xcdbb4b0a5b6e1152ec31ae7f09941bef1ef0618df54863b5eb65e3f6d66f34eb";
const PARAMS = "0x15c360cab24f0ddcce1fc0a1c84d856cd67e81e175fdad1dfe64808ade597391";
const COMMIT_DIGEST = "0x9f334b802b1b3d8b172d9377696ca9b94eb56714906a5e3de3ebc3523cf750f9";

describe("Solidity parity", () => {
  it("candidate id", () => {
    expect(candidateId({ kind: CandidateKind.Wallet, value: FOUNDER })).toBe(CANDIDATE);
  });

  it("commitment", () => {
    expect(commitmentOf(7n, SCOUT, CANDIDATE, SALT)).toBe(COMMITMENT);
  });

  it("envelopes hash", () => {
    expect(envelopesHash("0xaabb", "0xccdd")).toBe(ENVELOPES);
  });

  it("program params hash", () => {
    expect(
      hashProgramParams({
        token: "0x4444444444444444444444444444444444444444",
        bounty: 2_100_000_000n,
        rewardPerHit: 700_000_000n,
        tipDeadline: 1_800_000_000n,
        tailEnd: 1_807_776_000n,
        claimWindow: 2_592_000,
        topK: 3,
        maxTipsPerScout: 3,
        baseWeight: 100_000_000n,
        minStake: 1_000_000n,
        curveDepth: 100_000_000n,
        sealKey: toHex(0x5ea1n, { size: 32 }),
        evidenceSpec: toHex('{"kind":"evm-payment"}'),
        metadata: '{"title":"Vectors"}',
      }),
    ).toBe(PARAMS);
  });

  it("EIP-712 CommitTip digest", () => {
    expect(
      hashTypedData({
        domain: tipoffDomain(143, VERIFYING),
        types: tipoffTypes,
        primaryType: "CommitTip",
        message: {
          programId: 7n,
          commitment: COMMITMENT,
          stake: 5_000_000n,
          envelopesHash: ENVELOPES,
          nonce: 0n,
          deadline: 1_800_000_000n,
        },
      }),
    ).toBe(COMMIT_DIGEST);
  });
});

describe("curve mirrors the contract", () => {
  const curve = { baseWeight: 100_000_000n, curveDepth: 100_000_000n };

  it("free tips with base weight == depth buy 1/2, 1/6, 1/12 of the depth", () => {
    expect(curveShares(100_000_000n, [100_000_000n, 100_000_000n, 100_000_000n])).toEqual([
      50_000_000n,
      16_666_666n,
      8_333_333n,
    ]);
    expect(rankShares(3, curve).map((x) => Math.round(x * 9))).toEqual([6, 2, 1]);
  });

  it("matches the Solidity settle tests", () => {
    const net = 696_500_000n;
    // test_settle_stakeBuysSharesButTimingLeads: free tip, then a 900 USDC stake.
    const [early, late] = payoutFor(net, [0n, 900_000_000n], curve);
    expect(late).toBe((net * 41_666_666n) / (50_000_000n + 41_666_666n));
    expect(early! + late!).toBe(net);
    expect(early! > late!).toBe(true);
  });

  it("never creates or loses value", () => {
    for (const net of [0n, 1n, 7n, 999n, 123_456_789n, 2n ** 127n]) {
      for (const weights of [[1n], [1n, 1n], [5n, 10n ** 30n, 1n], [10n ** 12n, 3n, 3n, 3n, 3n]]) {
        const a = splitByShares(net, curveShares(1_000n, weights));
        expect(a.reduce((x, y) => x + y, 0n)).toBe(net);
      }
    }
    expect(splitByShares(10n, [0n, 0n, 0n])).toEqual([4n, 3n, 3n]);
    expect(splitByShares(5n, [])).toEqual([]);
  });

  it("stake boost is 1 unstaked, grows with stake, and is smallest for the first tip", () => {
    expect(stakeBoost(0n, curve)).toBe(1);
    expect(stakeBoost(100_000_000n, curve)).toBeCloseTo(4 / 3);
    expect(stakeBoost(10n ** 18n, curve)).toBeLessThan(2);
    // Matches the settle test: 900 USDC after 100 of weight lifts 16.67 shares to 41.67.
    expect(stakeBoost(900_000_000n, curve, 100_000_000n)).toBeCloseTo(41_666_666 / 16_666_666, 5);
  });
});
