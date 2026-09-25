import { bytesToHex } from "@noble/hashes/utils.js";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  CandidateKind,
  candidateId,
  commitmentOf,
  deriveKeys,
  open,
  openTip,
  SealError,
  seal,
  sealTip,
  type TipContext,
} from "../src/index.ts";

const prf = (fill: number) => new Uint8Array(32).fill(fill);
const hex = (b: Uint8Array) => `0x${bytesToHex(b)}` as const;

describe("deriveKeys", () => {
  it("is deterministic per passkey and separates keys", () => {
    const a = deriveKeys(prf(1));
    const b = deriveKeys(prf(1));
    const c = deriveKeys(prf(2));
    expect(hex(a.evmSecret)).toBe(hex(b.evmSecret));
    expect(hex(a.sealSecret)).toBe(hex(b.sealSecret));
    expect(hex(a.evmSecret)).not.toBe(hex(c.evmSecret));
    expect(hex(a.evmSecret)).not.toBe(hex(a.sealSecret)); // domain separation
    expect(a.sealPublic).toHaveLength(32);
  });

  it("yields a usable EVM account", () => {
    const account = privateKeyToAccount(hex(deriveKeys(prf(9)).evmSecret));
    expect(account.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("rejects PRF outputs that are not 32 bytes", () => {
    expect(() => deriveKeys(new Uint8Array(16))).toThrow();
  });
});

describe("seal / open", () => {
  const recipient = deriveKeys(prf(3));
  const aad = new Uint8Array([1, 2, 3]);
  const message = new TextEncoder().encode("the next great founder");

  it("round-trips", () => {
    const env = seal(recipient.sealPublic, message, aad);
    expect(new TextDecoder().decode(open(recipient.sealSecret, env, aad))).toBe("the next great founder");
  });

  it("is randomised (same plaintext, different envelope)", () => {
    expect(hex(seal(recipient.sealPublic, message, aad))).not.toBe(hex(seal(recipient.sealPublic, message, aad)));
  });

  it("fails with the wrong key, wrong context or a flipped bit", () => {
    const env = seal(recipient.sealPublic, message, aad);
    expect(() => open(deriveKeys(prf(4)).sealSecret, env, aad)).toThrow(SealError);
    expect(() => open(recipient.sealSecret, env, new Uint8Array([9]))).toThrow(SealError);
    const tampered = env.slice();
    tampered[tampered.length - 1]! ^= 1;
    expect(() => open(recipient.sealSecret, tampered, aad)).toThrow(SealError);
    expect(() => open(recipient.sealSecret, new Uint8Array(10), aad)).toThrow(SealError);
  });
});

describe("sealTip / openTip", () => {
  const sponsor = deriveKeys(prf(5));
  const scoutKeys = deriveKeys(prf(6));
  const ctx: TipContext = {
    chainId: 31337,
    contract: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    programId: 1n,
    scout: privateKeyToAccount(hex(scoutKeys.evmSecret)).address,
  };
  const candidate = { kind: CandidateKind.Wallet, value: "0x2222222222222222222222222222222222222222" } as const;

  const sealed = sealTip({
    ctx,
    sponsorSealKey: hex(sponsor.sealPublic),
    scoutSealPublic: scoutKeys.sealPublic,
    candidate,
    label: "Ada — building payments for gig workers",
    note: "Shipped three things in a month.",
  });

  it("commits to the candidate and salt", () => {
    expect(sealed.candidateId).toBe(candidateId(candidate));
    expect(sealed.commitment).toBe(commitmentOf(ctx.programId, ctx.scout, sealed.candidateId, sealed.salt));
  });

  it("opens for the sponsor and for the scout, and verifies the commitment", () => {
    for (const [secret, env] of [
      [sponsor.sealSecret, sealed.sponsorEnvelope],
      [scoutKeys.sealSecret, sealed.scoutEnvelope],
    ] as const) {
      const opened = openTip(secret, env, ctx, sealed.commitment);
      expect(opened.valid).toBe(true);
      expect(opened.candidate).toEqual(candidate);
      expect(opened.salt).toBe(sealed.salt);
      expect(opened.label).toContain("Ada");
    }
  });

  it("cannot be opened by the sponsor with the scout's envelope, or in another program", () => {
    expect(() => openTip(sponsor.sealSecret, sealed.scoutEnvelope, ctx, sealed.commitment)).toThrow(SealError);
    expect(() =>
      openTip(sponsor.sealSecret, sealed.sponsorEnvelope, { ...ctx, programId: 2n }, sealed.commitment),
    ).toThrow(SealError);
  });

  it("flags an envelope that does not match its commitment", () => {
    const opened = openTip(sponsor.sealSecret, sealed.sponsorEnvelope, ctx, `0x${"00".repeat(32)}`);
    expect(opened.valid).toBe(false);
  });

  it("keeps envelopes under the on-chain size limit", () => {
    const long = sealTip({
      ctx,
      sponsorSealKey: hex(sponsor.sealPublic),
      scoutSealPublic: scoutKeys.sealPublic,
      candidate,
      label: "x".repeat(500),
      note: "y".repeat(5000),
    });
    expect((long.sponsorEnvelope.length - 2) / 2).toBeLessThanOrEqual(1024);
  });
});
