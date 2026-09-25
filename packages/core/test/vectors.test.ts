import { hashTypedData, toHex } from "viem";
import { describe, expect, it } from "vitest";
import {
  CandidateKind,
  candidateId,
  commitmentOf,
  envelopesHash,
  hashProgramParams,
  payoutSplit,
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
const PARAMS = "0xa18916369e11f63ebb50f9f01fabbf57da6683e665b0e19a23a8b0d14e0571cf";
const COMMIT_DIGEST = "0x1b255811897a873da6523884705e8b324b442818091bf44d2fbbadbb8e52a13d";

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
          envelopesHash: ENVELOPES,
          nonce: 0n,
          deadline: 1_800_000_000n,
        },
      }),
    ).toBe(COMMIT_DIGEST);
  });
});

describe("payoutSplit mirrors the contract", () => {
  it("splits 4/7, 2/7, 1/7 with dust to rank 0", () => {
    expect(payoutSplit(696_500_000n, 3)).toEqual([398_000_000n, 199_000_000n, 99_500_000n]);
    expect(payoutSplit(10n, 5)).toEqual([7n, 2n, 1n, 0n, 0n]);
    expect(payoutSplit(5n, 1)).toEqual([5n]);
    expect(payoutSplit(5n, 0)).toEqual([]);
  });

  it("never creates or loses value and never pays earlier ranks less", () => {
    for (let n = 1; n <= 5; n++) {
      for (const net of [0n, 1n, 7n, 31n, 999n, 123_456_789n, 2n ** 127n]) {
        const a = payoutSplit(net, n);
        expect(a.reduce((x, y) => x + y, 0n)).toBe(net);
        for (let i = 1; i < n; i++) expect(a[i]! <= a[i - 1]!).toBe(true);
      }
    }
  });
});
