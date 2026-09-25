import { describe, expect, it } from "vitest";
import { relayRequest } from "../lib/relay-schema";

const sig = `0x${"ab".repeat(65)}`;
const b32 = `0x${"cd".repeat(32)}`;
const scout = "0x16773a3fB17A2Ac4E1c9216cD43Da829f33ACe4b";

describe("relayRequest", () => {
  const commit = {
    type: "commitTip",
    scout,
    programId: "1",
    commitment: b32,
    sponsorEnvelope: "0x0102",
    scoutEnvelope: "0x",
    deadline: "1800000000",
    signature: sig,
  };

  it("accepts a well-formed signed tip", () => {
    expect(relayRequest.safeParse(commit).success).toBe(true);
  });

  it("rejects unknown actions and malformed fields before anything touches the chain", () => {
    expect(relayRequest.safeParse({ ...commit, type: "drain" }).success).toBe(false);
    expect(relayRequest.safeParse({ ...commit, signature: "0x1234" }).success).toBe(false);
    expect(relayRequest.safeParse({ ...commit, scout: "0xnope" }).success).toBe(false);
    expect(relayRequest.safeParse({ ...commit, programId: "-1" }).success).toBe(false);
    expect(relayRequest.safeParse({ ...commit, commitment: "0x12" }).success).toBe(false);
  });

  it("caps envelope size at the contract's 1024-byte limit", () => {
    expect(relayRequest.safeParse({ ...commit, sponsorEnvelope: `0x${"00".repeat(1024)}` }).success).toBe(true);
    expect(relayRequest.safeParse({ ...commit, sponsorEnvelope: `0x${"00".repeat(1025)}` }).success).toBe(false);
  });

  it("bounds topK to the contract's range", () => {
    const create = {
      type: "createProgram",
      params: {
        token: scout,
        bounty: "3000",
        rewardPerHit: "1000",
        tipDeadline: "1",
        tailEnd: "2",
        claimWindow: 604800,
        topK: 6,
        maxTipsPerScout: 3,
        sealKey: b32,
        evidenceSpec: "0x",
        metadata: "{}",
      },
      sponsor: scout,
      deadline: "1",
      signature: sig,
      permit: { deadline: "1", v: 27, r: b32, s: b32 },
    };
    expect(relayRequest.safeParse(create).success).toBe(false);
    expect(relayRequest.safeParse({ ...create, params: { ...create.params, topK: 3 } }).success).toBe(true);
  });
});
