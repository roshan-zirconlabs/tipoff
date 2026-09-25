import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { type Address, encodeAbiParameters, type Hex, keccak256, toBytes } from "viem";
import { type CandidateRef, candidateId } from "./candidate.ts";
import { commitmentOf, randomBytes32 } from "./hashing.ts";
import { MAX_NOTE_CHARS } from "./program.ts";
import { open, seal } from "./seal.ts";

/** What is inside a sealed tip. Only the sponsor and the scout can read it. */
export type TipPlaintext = {
  v: 1;
  candidate: CandidateRef;
  salt: Hex;
  /** Who the scout thinks this is, e.g. "Ada — building X". */
  label: string;
  /** Why now. Max 280 characters. */
  note: string;
};

export type TipContext = { chainId: number; contract: Address; programId: bigint; scout: Address };

export type SealedTip = {
  candidateId: Hex;
  salt: Hex;
  commitment: Hex;
  sponsorEnvelope: Hex;
  scoutEnvelope: Hex;
};

/** Associated data binding an envelope to one chain, contract, program and scout. */
export function tipAad(ctx: TipContext): Uint8Array {
  return toBytes(
    keccak256(
      encodeAbiParameters(
        [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "address" }],
        [BigInt(ctx.chainId), ctx.contract, ctx.programId, ctx.scout],
      ),
    ),
  );
}

function toHexBytes(bytes: Uint8Array): Hex {
  return `0x${bytesToHex(bytes)}`;
}

/** Build everything a scout submits: the commitment plus envelopes for the sponsor and for themselves. */
export function sealTip(input: {
  ctx: TipContext;
  sponsorSealKey: Hex;
  scoutSealPublic: Uint8Array;
  candidate: CandidateRef;
  label: string;
  note: string;
}): SealedTip {
  const salt = randomBytes32();
  const id = candidateId(input.candidate);
  const plaintext: TipPlaintext = {
    v: 1,
    candidate: input.candidate,
    salt,
    label: input.label.trim().slice(0, 80),
    note: input.note.trim().slice(0, MAX_NOTE_CHARS),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(plaintext));
  const aad = tipAad(input.ctx);
  return {
    candidateId: id,
    salt,
    commitment: commitmentOf(input.ctx.programId, input.ctx.scout, id, salt),
    sponsorEnvelope: toHexBytes(seal(hexToBytes(input.sponsorSealKey.slice(2)), bytes, aad)),
    scoutEnvelope: toHexBytes(seal(input.scoutSealPublic, bytes, aad)),
  };
}

export type OpenedTip = TipPlaintext & { candidateId: Hex; valid: boolean };

/**
 * Open an envelope and check it against the on-chain commitment. `valid` is false when the plaintext does not match
 * the commitment (a malformed or dishonest envelope) — such a tip can never be proven.
 */
export function openTip(sealSecret: Uint8Array, envelope: Hex, ctx: TipContext, commitment: Hex): OpenedTip {
  const bytes = open(sealSecret, hexToBytes(envelope.slice(2)), tipAad(ctx));
  const plaintext = JSON.parse(new TextDecoder().decode(bytes)) as TipPlaintext;
  const id = candidateId(plaintext.candidate);
  return {
    ...plaintext,
    candidateId: id,
    valid: commitmentOf(ctx.programId, ctx.scout, id, plaintext.salt) === commitment,
  };
}
