import { isAddress } from "viem";
import { z } from "zod";

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/, "hex");
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "bytes32");
const address = z.string().refine((v) => isAddress(v), "address");
const uint = z.string().regex(/^\d+$/, "uint").max(78);
const signature = z.string().regex(/^0x[0-9a-fA-F]{130}$/, "signature");

/** Every action the relayer will pay gas for. Anything else is rejected before touching the chain. */
export const relayRequest = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("createProgram"),
    params: z.object({
      token: address,
      bounty: uint,
      rewardPerHit: uint,
      tipDeadline: uint,
      tailEnd: uint,
      claimWindow: z.number().int().positive(),
      topK: z.number().int().min(1).max(5),
      maxTipsPerScout: z.number().int().min(1).max(65_535),
      sealKey: bytes32,
      evidenceSpec: hex.max(2 + 2 * 2048),
      metadata: z.string().max(4096),
    }),
    sponsor: address,
    deadline: uint,
    signature,
    permit: z.object({ deadline: uint, v: z.number().int().min(0).max(255), r: bytes32, s: bytes32 }),
  }),
  z.object({
    type: z.literal("commitTip"),
    scout: address,
    programId: uint,
    commitment: bytes32,
    sponsorEnvelope: hex.max(2 + 2 * 1024),
    scoutEnvelope: hex.max(2 + 2 * 1024),
    deadline: uint,
    signature,
  }),
  z.object({ type: z.literal("resolve"), programId: uint, candidateId: bytes32, deadline: uint, signature }),
  z.object({ type: z.literal("withdraw"), programId: uint, deadline: uint, signature }),
  z.object({ type: z.literal("proveTip"), tipId: uint, candidateId: bytes32, salt: bytes32 }),
  z.object({ type: z.literal("settle"), programId: uint, candidateId: bytes32 }),
]);

export type RelayRequest = z.infer<typeof relayRequest>;

export type RelayResponse =
  | { ok: true; hash: `0x${string}`; programId?: number; tipId?: number }
  | { ok: false; error: string; code?: string };
