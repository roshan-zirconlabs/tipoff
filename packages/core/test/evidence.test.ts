import { describe, expect, it } from "vitest";
import {
  CandidateInputError,
  CandidateKind,
  candidateId,
  decodeEvidenceSpec,
  encodeEvidenceSpec,
  matchPayments,
  parseCandidate,
  type ResolvableProgram,
  type TransferEvidence,
} from "../src/index.ts";

const USDC = "0x00000000000000000000000000000000000000e1";
const TIPOFF = "0x0000000000000000000000000000000000007100";
const TREASURY = "0x7777777777777777777777777777777777777777";
const OTHER_TREASURY = "0x8888888888888888888888888888888888888888";
const FOUNDER = "0x2222222222222222222222222222222222222222";

const program: ResolvableProgram = {
  programId: 1n,
  createdAt: 1_000n,
  tailEnd: 10_000n,
  spec: { v: 1, kind: "evm-payment", token: USDC, treasuries: [TREASURY, OTHER_TREASURY], minAmount: "1000000" },
};

const transfer = (over: Partial<TransferEvidence>): TransferEvidence => ({
  token: USDC,
  from: TREASURY,
  to: FOUNDER,
  value: 5_000_000n,
  timestamp: 2_000n,
  txHash: "0xabc",
  ...over,
});

describe("matchPayments", () => {
  it("reports a qualifying treasury payment as a hit on the recipient", () => {
    const [r, ...rest] = matchPayments([program], [transfer({})], TIPOFF);
    expect(rest).toHaveLength(0);
    expect(r?.candidateId).toBe(candidateId({ kind: CandidateKind.Wallet, value: FOUNDER }));
    expect(r?.actedAt).toBe(2_000n);
  });

  it("keeps the earliest qualifying payment per candidate", () => {
    const reports = matchPayments(
      [program],
      [transfer({ timestamp: 5_000n, txHash: "0x2" }), transfer({ timestamp: 3_000n, txHash: "0x1" })],
      TIPOFF,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]?.evidenceRef).toBe("0x1");
  });

  it("ignores payments that are not evidence of acting", () => {
    const ignored = [
      transfer({ from: FOUNDER }), // not a declared treasury
      transfer({ token: FOUNDER }), // wrong token
      transfer({ value: 999_999n }), // below the minimum
      transfer({ to: TIPOFF }), // funding the bounty
      transfer({ to: OTHER_TREASURY }), // moving money between own treasuries
      transfer({ timestamp: 999n }), // before the program
      transfer({ timestamp: 10_001n }), // after the tail
    ];
    expect(matchPayments([program], ignored, TIPOFF)).toEqual([]);
  });

  it("skips programs without payment evidence", () => {
    expect(matchPayments([{ ...program, spec: { v: 1, kind: "none" } }], [transfer({})], TIPOFF)).toEqual([]);
  });
});

describe("evidence spec encoding", () => {
  it("round-trips and tolerates garbage", () => {
    expect(decodeEvidenceSpec(encodeEvidenceSpec(program.spec))).toEqual(program.spec);
    expect(decodeEvidenceSpec("0x")).toEqual({ v: 1, kind: "none" });
    expect(decodeEvidenceSpec("0x7b7b")).toEqual({ v: 1, kind: "none" });
  });
});

describe("parseCandidate", () => {
  it("normalises wallets", () => {
    expect(parseCandidate(CandidateKind.Wallet, ` ${FOUNDER} `)).toEqual({
      kind: CandidateKind.Wallet,
      value: "0x2222222222222222222222222222222222222222",
    });
    expect(() => parseCandidate(CandidateKind.Wallet, "0x123")).toThrow(CandidateInputError);
  });

  it("accepts Deezer links and ids", () => {
    expect(parseCandidate(CandidateKind.DeezerArtist, "https://www.deezer.com/en/artist/27")).toEqual({
      kind: CandidateKind.DeezerArtist,
      value: "27",
    });
    expect(parseCandidate(CandidateKind.DeezerArtist, "0027").value).toBe("27");
    expect(() => parseCandidate(CandidateKind.DeezerArtist, "not an artist")).toThrow(CandidateInputError);
  });
});
