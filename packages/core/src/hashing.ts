import { type Address, encodeAbiParameters, type Hex, keccak256, toBytes, toHex } from "viem";
import type { ProgramParams } from "./program.ts";

/** keccak256(abi.encode(programId, scout, candidateId, salt)) — mirrors Tipoff.commitmentOf. */
export function commitmentOf(programId: bigint, scout: Address, candidateId: Hex, salt: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "bytes32" }],
      [programId, scout, candidateId, salt],
    ),
  );
}

/** keccak256(abi.encode(keccak256(sponsorEnvelope), keccak256(scoutEnvelope))) — mirrors Tipoff.envelopesHash. */
export function envelopesHash(sponsorEnvelope: Hex, scoutEnvelope: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }],
      [keccak256(sponsorEnvelope), keccak256(scoutEnvelope)],
    ),
  );
}

/** Mirrors Tipoff.hashProgramParams. */
export function hashProgramParams(p: ProgramParams): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint128" },
        { type: "uint128" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint32" },
        { type: "uint8" },
        { type: "uint16" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [
        p.token,
        p.bounty,
        p.rewardPerHit,
        p.tipDeadline,
        p.tailEnd,
        p.claimWindow,
        p.topK,
        p.maxTipsPerScout,
        p.sealKey,
        keccak256(p.evidenceSpec),
        keccak256(toHex(toBytes(p.metadata))),
      ],
    ),
  );
}

export function randomBytes32(): Hex {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}
