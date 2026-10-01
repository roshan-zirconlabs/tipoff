// Drives Tipoff on Monad testnet exactly as the web app does: EIP-712 intents and EIP-2612 permits, sent through the
// app's own relayer (POST /api/relay), so nothing here needs gas. Shared by the smoke test and the testnet seed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type CandidateRef,
  deriveKeys,
  envelopesHash,
  hashProgramParams,
  type ProgramParams,
  permitTypes,
  sealTip,
  tipoffAbi,
  tipoffDomain,
  tipoffTypes,
} from "@tipoff/core";
import { type Address, bytesToHex, createPublicClient, type Hex, http, parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

export const root = join(import.meta.dirname, "..", "..");
export const APP = process.env.APP_URL ?? "http://localhost:3000";
export const RPC = "https://testnet-rpc.monad.xyz";

type Deployment = { tipoff: Address; usdc: Address; testToken?: Address; startBlock: number };
const raw = JSON.parse(readFileSync(join(root, "contracts", "deployments", "10143.json"), "utf8")) as Deployment;
const zero = "0x0000000000000000000000000000000000000000";
/** The token the app pays in: TestUSDC (with a public faucet) when deployed, otherwise Circle USDC. */
export const dep = {
  ...raw,
  token: (raw.testToken && raw.testToken !== zero ? raw.testToken : raw.usdc) as Address,
  faucet: Boolean(raw.testToken && raw.testToken !== zero),
};
export const client = createPublicClient({ chain: monadTestnet, transport: http(RPC) });
export const domain = tipoffDomain(monadTestnet.id, dep.tipoff);

export type Identity = { keys: ReturnType<typeof deriveKeys>; account: ReturnType<typeof privateKeyToAccount> };

/** Named identities, persisted in .tipoff/ (gitignored) so reruns reuse them and never strand funds. */
export function identities<const N extends string>(file: string, names: readonly N[]): Record<N, Identity> {
  const path = join(root, ".tipoff", file);
  const saved = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, Hex>) : {};
  for (const n of names) saved[n] ??= bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  mkdirSync(join(root, ".tipoff"), { recursive: true });
  writeFileSync(path, JSON.stringify(saved, null, 2), { mode: 0o600 });
  return Object.fromEntries(
    names.map((n) => {
      const keys = deriveKeys(Uint8Array.from(Buffer.from((saved[n] as string).slice(2), "hex")));
      return [n, { keys, account: privateKeyToAccount(bytesToHex(keys.evmSecret)) }];
    }),
  ) as Record<N, Identity>;
}

export async function preflight() {
  let res: Response;
  try {
    res = await fetch(`${APP}/api/snapshot`, { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error(`The app isn't reachable at ${APP}. Start it first: npx pnpm@12.6.0 dev:testnet`);
  }
  if (!res.ok) throw new Error(`The app at ${APP} answered ${res.status}; is it running in testnet mode?`);
}

export async function relay(body: unknown): Promise<{ hash: Hex; programId?: number; tipId?: number }> {
  const res = await fetch(`${APP}/api/relay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body, (_, v) => (typeof v === "bigint" ? `${v}` : v)),
  });
  const json = (await res.json()) as { ok: boolean; error?: string; hash: Hex; programId?: number; tipId?: number };
  if (!json.ok) throw new Error(`relay rejected ${(body as { type: string }).type}: ${json.error}`);
  return json;
}

export const deadline = async () => (await client.getBlock()).timestamp + 1800n;
export const nonce = (a: Address) =>
  client.readContract({ address: dep.tipoff, abi: tipoffAbi, functionName: "nonces", args: [a] });
export const balanceOf = (a: Address) =>
  client.readContract({
    address: dep.token,
    abi: [
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ type: "address" }],
        outputs: [{ type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [a],
  });

/** EIP-2612 permit for Tipoff to pull `value`, signed against the token's own EIP-712 domain (EIP-5267). */
export async function permit(owner: Identity, value: bigint, d: bigint) {
  const [, name, version, chainId, verifyingContract] = await client.readContract({
    address: dep.token,
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
    ],
    functionName: "eip712Domain",
  });
  const permitNonce = await client.readContract({
    address: dep.token,
    abi: [
      {
        type: "function",
        name: "nonces",
        stateMutability: "view",
        inputs: [{ type: "address" }],
        outputs: [{ type: "uint256" }],
      },
    ],
    functionName: "nonces",
    args: [owner.account.address],
  });
  const sig = parseSignature(
    await owner.account.signTypedData({
      domain: { name, version, chainId: Number(chainId), verifyingContract },
      types: permitTypes,
      primaryType: "Permit",
      message: { owner: owner.account.address, spender: dep.tipoff, value, nonce: permitNonce, deadline: d },
    }),
  );
  return { deadline: `${d}`, v: Number(sig.v ?? 27n), r: sig.r, s: sig.s };
}

/** Top up from the TestUSDC faucet until `who` holds at least `need` (the faucet rate-limits per hour). */
export async function fund(who: Identity, need: bigint) {
  if (!dep.faucet) throw new Error("No TestUSDC on this deployment; fund from faucet.circle.com instead");
  if ((await balanceOf(who.account.address)) >= need) return;
  await relay({ type: "drip", to: who.account.address });
  if ((await balanceOf(who.account.address)) < need) {
    throw new Error(`${who.account.address} needs more than one faucet drip; rerun in an hour`);
  }
}

export async function createProgram(patron: Identity, params: ProgramParams) {
  const d = await deadline();
  const res = await relay({
    type: "createProgram",
    params,
    sponsor: patron.account.address,
    deadline: d,
    signature: await patron.account.signTypedData({
      domain,
      types: tipoffTypes,
      primaryType: "CreateProgram",
      message: { paramsHash: hashProgramParams(params), nonce: await nonce(patron.account.address), deadline: d },
    }),
    permit: await permit(patron, params.bounty, d),
  });
  return BigInt(res.programId ?? 0);
}

export async function commitTip(opts: {
  scout: Identity;
  programId: bigint;
  patronSealKey: Hex;
  candidate: CandidateRef;
  label: string;
  note: string;
  stake?: bigint;
}) {
  const stake = opts.stake ?? 0n;
  const sealed = sealTip({
    ctx: {
      chainId: monadTestnet.id,
      contract: dep.tipoff,
      programId: opts.programId,
      scout: opts.scout.account.address,
    },
    sponsorSealKey: opts.patronSealKey,
    scoutSealPublic: opts.scout.keys.sealPublic,
    candidate: opts.candidate,
    label: opts.label,
    note: opts.note,
  });
  const d = await deadline();
  const res = await relay({
    type: "commitTip",
    scout: opts.scout.account.address,
    programId: opts.programId,
    commitment: sealed.commitment,
    stake,
    sponsorEnvelope: sealed.sponsorEnvelope,
    scoutEnvelope: sealed.scoutEnvelope,
    deadline: d,
    signature: await opts.scout.account.signTypedData({
      domain,
      types: tipoffTypes,
      primaryType: "CommitTip",
      message: {
        programId: opts.programId,
        commitment: sealed.commitment,
        stake,
        envelopesHash: envelopesHash(sealed.sponsorEnvelope, sealed.scoutEnvelope),
        nonce: await nonce(opts.scout.account.address),
        deadline: d,
      },
    }),
    permit: stake > 0n ? await permit(opts.scout, stake, d) : undefined,
  });
  return { tipId: BigInt(res.tipId ?? 0), candidateId: sealed.candidateId, salt: sealed.salt, hash: res.hash };
}

/** A declared hit: the patron pays the reward itself, by permit. */
export async function resolve(patron: Identity, programId: bigint, candidateId: Hex, reward: bigint) {
  const d = await deadline();
  return relay({
    type: "resolve",
    programId,
    candidateId,
    deadline: d,
    signature: await patron.account.signTypedData({
      domain,
      types: tipoffTypes,
      primaryType: "Resolve",
      message: { programId, candidateId, nonce: await nonce(patron.account.address), deadline: d },
    }),
    permit: await permit(patron, reward, d),
  });
}

export const proveTip = (tipId: bigint, candidateId: Hex, salt: Hex) =>
  relay({ type: "proveTip", tipId, candidateId, salt });

export const step = (n: number | string, msg: string) => console.log(`\x1b[1m${n}.\x1b[0m ${msg}`);
