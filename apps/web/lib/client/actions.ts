import {
  type CandidateRef,
  encodeEvidenceSpec,
  encodeMetadata,
  envelopesHash,
  hashProgramParams,
  type ProgramMetadata,
  type ProgramParams,
  permitTypes,
  sealTip,
  tipoffAbi,
  tipoffDomain,
  tipoffTypes,
} from "@tipoff/core";
import {
  type Address,
  createPublicClient,
  erc20Abi,
  type Hex,
  hexToBytes,
  http,
  parseSignature,
  parseUnits,
} from "viem";
import { chain, config } from "../config";
import type { RelayRequest, RelayResponse } from "../relay-schema";
import type { ProgramView } from "../types";
import type { Keys, Profile } from "./passkey";

export const browserClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

export class ActionError extends Error {}

async function post(body: RelayRequest): Promise<Extract<RelayResponse, { ok: true }>> {
  let res: Response;
  try {
    res = await fetch("/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ActionError("You're offline or the server is unreachable.");
  }
  const json = (await res.json().catch(() => null)) as RelayResponse | null;
  if (!json) throw new ActionError("The server sent an unexpected response.");
  if (!json.ok) throw new ActionError(json.error);
  return json;
}

/** Signatures expire 30 minutes after the *chain's* clock, which may be ahead of the wall clock on a dev chain. */
async function deadline(): Promise<bigint> {
  const block = await browserClient.getBlock({ blockTag: "latest" });
  return block.timestamp + 1800n;
}

async function nonce(owner: Address): Promise<bigint> {
  return browserClient.readContract({ address: config.tipoff, abi: tipoffAbi, functionName: "nonces", args: [owner] });
}

const domain = () => tipoffDomain(config.chainId, config.tipoff);

// ─── Scout ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function sendTip(input: {
  program: ProgramView;
  candidate: CandidateRef;
  label: string;
  note: string;
  /** Refundable stake in base units; 0 for a free tip. */
  stake: bigint;
  keys: Keys;
  profile: Profile;
}): Promise<{ tipId: number; hash: Hex; candidateId: Hex }> {
  const scout = input.keys.account.address;
  if (input.stake < BigInt(input.program.minStake)) {
    throw new ActionError(`This program needs at least ${Number(input.program.minStake) / 1e6} USDC behind each tip.`);
  }
  if (input.stake > 0n) {
    const balance = await usdcBalance(scout);
    if (balance < input.stake) {
      throw new ActionError(
        `Your account holds ${Number(balance) / 1e6} USDC; the stake needs ${Number(input.stake) / 1e6}.`,
      );
    }
  }
  const sealed = sealTip({
    ctx: { chainId: config.chainId, contract: config.tipoff, programId: BigInt(input.program.id), scout },
    sponsorSealKey: input.program.sealKey,
    scoutSealPublic: hexToBytes(input.profile.sealPublic),
    candidate: input.candidate,
    label: input.label,
    note: input.note,
  });
  const [n, d] = await Promise.all([nonce(scout), deadline()]);
  const signature = await input.keys.account.signTypedData({
    domain: domain(),
    types: tipoffTypes,
    primaryType: "CommitTip",
    message: {
      programId: BigInt(input.program.id),
      commitment: sealed.commitment,
      stake: input.stake,
      envelopesHash: envelopesHash(sealed.sponsorEnvelope, sealed.scoutEnvelope),
      nonce: n,
      deadline: d,
    },
  });
  const permit = input.stake > 0n ? await signPermit(input.keys, input.program.token, input.stake, d) : undefined;
  const res = await post({
    type: "commitTip",
    scout,
    programId: `${input.program.id}`,
    commitment: sealed.commitment,
    stake: `${input.stake}`,
    sponsorEnvelope: sealed.sponsorEnvelope,
    scoutEnvelope: sealed.scoutEnvelope,
    deadline: `${d}`,
    signature,
    permit,
  });
  return { tipId: res.tipId ?? 0, hash: res.hash, candidateId: sealed.candidateId };
}

export async function claimTip(tipId: number, candidateId: Hex, salt: Hex): Promise<Hex> {
  return (await post({ type: "proveTip", tipId: `${tipId}`, candidateId, salt })).hash;
}

export async function settleHit(programId: number, candidateId: Hex): Promise<Hex> {
  return (await post({ type: "settle", programId: `${programId}`, candidateId })).hash;
}

/** Stakes are refunded to the scout whoever sends this, so it needs no signature. */
export async function returnStake(tipId: number): Promise<Hex> {
  return (await post({ type: "returnStake", tipId: `${tipId}` })).hash;
}

/** A payout the contract holds because pushing it failed (e.g. a paused or blocklisted transfer). */
export async function owedTo(account: Address): Promise<bigint> {
  return browserClient.readContract({
    address: config.tipoff,
    abi: tipoffAbi,
    functionName: "owed",
    args: [config.usdc, account],
  });
}

export async function withdrawOwed(keys: Keys): Promise<Hex> {
  const account = keys.account.address;
  const [n, d] = await Promise.all([nonce(account), deadline()]);
  const signature = await keys.account.signTypedData({
    domain: domain(),
    types: tipoffTypes,
    primaryType: "WithdrawOwed",
    message: { token: config.usdc, nonce: n, deadline: d },
  });
  return (await post({ type: "withdrawOwed", token: config.usdc, account, deadline: `${d}`, signature })).hash;
}

/** Test dollars for judges and testers: TestUSDC on testnet (relayed, rate-limited), or the local dev mint. */
export async function getTestDollars(to: Address): Promise<void> {
  if (config.devTools) return devAction("faucet", { address: to });
  await post({ type: "drip", to });
}

export const canGetTestDollars = config.devTools || config.faucet;

// ─── Sponsor ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type NewProgram = {
  metadata: ProgramMetadata;
  bountyUsdc: string;
  rewardUsdc: string;
  tipDays: number;
  tailDays: number;
  claimDays: number;
  topK: number;
  maxTipsPerScout: number;
  treasuries: Address[];
  minPaymentUsdc: string;
  /** Curve depth and base weight, in USDC. Stakes around this size move a tip's share; far above it, barely. */
  convictionScaleUsdc: string;
  minStakeUsdc: string;
};

async function permitDomain(token: Address) {
  try {
    const [, name, version, chainId, verifyingContract] = await browserClient.readContract({
      address: token,
      abi: [
        {
          type: "function",
          name: "eip712Domain",
          stateMutability: "view",
          inputs: [],
          outputs: [
            { type: "bytes1" },
            { type: "string" },
            { type: "string" },
            { type: "uint256" },
            { type: "address" },
            { type: "bytes32" },
            { type: "uint256[]" },
          ],
        },
      ] as const,
      functionName: "eip712Domain",
    });
    return { name, version, chainId: Number(chainId), verifyingContract };
  } catch {
    // Circle's FiatToken exposes name() and version() instead of EIP-5267.
    const name = await browserClient.readContract({ address: token, abi: erc20Abi, functionName: "name" });
    const version = await browserClient
      .readContract({
        address: token,
        abi: [
          { type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
        ],
        functionName: "version",
      })
      .catch(() => "2");
    return { name, version, chainId: config.chainId, verifyingContract: token };
  }
}

/** EIP-2612 permit for Tipoff to pull `value`, so neither sponsor nor scout sends an approval transaction. */
async function signPermit(keys: Keys, token: Address, value: bigint, d: bigint) {
  const owner = keys.account.address;
  const [pDomain, permitNonce] = await Promise.all([
    permitDomain(token),
    browserClient.readContract({
      address: token,
      abi: [
        {
          type: "function",
          name: "nonces",
          stateMutability: "view",
          inputs: [{ type: "address" }],
          outputs: [{ type: "uint256" }],
        },
      ] as const,
      functionName: "nonces",
      args: [owner],
    }),
  ]);
  const sig = parseSignature(
    await keys.account.signTypedData({
      domain: pDomain,
      types: permitTypes,
      primaryType: "Permit",
      message: { owner, spender: config.tipoff, value, nonce: permitNonce, deadline: d },
    }),
  );
  return { deadline: `${d}`, v: Number(sig.v ?? 27n), r: sig.r, s: sig.s };
}

export async function usdcBalance(owner: Address): Promise<bigint> {
  return browserClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
}

export async function createProgram(input: NewProgram & { keys: Keys; profile: Profile }): Promise<number> {
  const sponsor = input.keys.account.address;
  const now = (await browserClient.getBlock({ blockTag: "latest" })).timestamp;
  const tipDeadline = now + BigInt(Math.round(input.tipDays * 86_400));
  const params: ProgramParams = {
    token: config.usdc,
    bounty: parseUnits(input.bountyUsdc, 6),
    rewardPerHit: parseUnits(input.rewardUsdc, 6),
    tipDeadline,
    tailEnd: tipDeadline + BigInt(input.tailDays * 86_400),
    claimWindow: input.claimDays * 86_400,
    topK: input.topK,
    maxTipsPerScout: input.maxTipsPerScout,
    baseWeight: parseUnits(input.convictionScaleUsdc, 6),
    minStake: parseUnits(input.minStakeUsdc || "0", 6),
    curveDepth: parseUnits(input.convictionScaleUsdc, 6),
    sealKey: input.profile.sealPublic,
    evidenceSpec: encodeEvidenceSpec({
      v: 1,
      kind: "evm-payment",
      token: config.usdc,
      treasuries: input.treasuries.length ? input.treasuries : [sponsor],
      minAmount: `${parseUnits(input.minPaymentUsdc || "0", 6)}`,
    }),
    metadata: encodeMetadata(input.metadata),
  };

  const balance = await usdcBalance(sponsor);
  if (balance < params.bounty) {
    throw new ActionError(`Your account holds ${Number(balance) / 1e6} USDC; the bounty needs ${input.bountyUsdc}.`);
  }

  const [n, d] = await Promise.all([nonce(sponsor), deadline()]);
  const signature = await input.keys.account.signTypedData({
    domain: domain(),
    types: tipoffTypes,
    primaryType: "CreateProgram",
    message: { paramsHash: hashProgramParams(params), nonce: n, deadline: d },
  });
  const permit = await signPermit(input.keys, params.token, params.bounty, d);

  const res = await post({
    type: "createProgram",
    params: {
      token: params.token,
      bounty: `${params.bounty}`,
      rewardPerHit: `${params.rewardPerHit}`,
      tipDeadline: `${params.tipDeadline}`,
      tailEnd: `${params.tailEnd}`,
      claimWindow: params.claimWindow,
      topK: params.topK,
      maxTipsPerScout: params.maxTipsPerScout,
      baseWeight: `${params.baseWeight}`,
      minStake: `${params.minStake}`,
      curveDepth: `${params.curveDepth}`,
      sealKey: params.sealKey,
      evidenceSpec: params.evidenceSpec,
      metadata: params.metadata,
    },
    sponsor,
    deadline: `${d}`,
    signature,
    permit,
  });
  if (!res.programId) throw new ActionError("The program was created but its id wasn't returned. Refresh the page.");
  return res.programId;
}

/** Declare a hit. The sponsor pays its reward now (by permit); the locked bounty only backs evidence-resolved hits. */
export async function resolveCandidate(program: ProgramView, candidateId: Hex, keys: Keys): Promise<Hex> {
  const sponsor = keys.account.address;
  const programId = program.id;
  const reward = BigInt(program.rewardPerHit);
  const balance = await usdcBalance(sponsor);
  if (balance < reward) {
    throw new ActionError(
      `Backing a candidate pays its $${Number(reward) / 1e6} reward from your account, which holds $${Number(balance) / 1e6}.`,
    );
  }
  const [n, d] = await Promise.all([nonce(sponsor), deadline()]);
  const signature = await keys.account.signTypedData({
    domain: domain(),
    types: tipoffTypes,
    primaryType: "Resolve",
    message: { programId: BigInt(programId), candidateId, nonce: n, deadline: d },
  });
  const permit = await signPermit(keys, program.token, reward, d);
  return (await post({ type: "resolve", programId: `${programId}`, candidateId, deadline: `${d}`, signature, permit }))
    .hash;
}

export async function withdrawRemainder(programId: number, keys: Keys): Promise<Hex> {
  const sponsor = keys.account.address;
  const [n, d] = await Promise.all([nonce(sponsor), deadline()]);
  const signature = await keys.account.signTypedData({
    domain: domain(),
    types: tipoffTypes,
    primaryType: "WithdrawRemainder",
    message: { programId: BigInt(programId), nonce: n, deadline: d },
  });
  return (await post({ type: "withdraw", programId: `${programId}`, deadline: `${d}`, signature })).hash;
}

// ─── Dev tools ──────────────────────────────────────────────────────────────────────────────────────────────────────

export async function devAction(action: "faucet" | "warp" | "pay", body: unknown): Promise<void> {
  const res = await fetch(`/api/dev/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ActionError("Dev action failed.");
}
