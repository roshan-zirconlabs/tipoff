// End-to-end smoke test on Monad testnet through the app's real relayer (POST /api/relay), exactly the path the UI
// takes: signed EIP-712 intents, a USDC permit, no gas for sponsor or scout.
//
//   1. a smoke sponsor (topped up to 6 USDC by the deployer) opens a program — treasury: the deployer
//   2. a smoke scout seals tips on founders A and B    3. the sponsor resolves A          4. the scout claims A
//   5. the deployer (the declared treasury) pays founder B 1 USDC directly — evidence for the CRE workflow to report
//
// Needs: the app running on :3000 in testnet mode (pnpm dev:testnet) and ~7 testnet USDC on the deployer
// (contracts/.env PRIVATE_KEY) from https://faucet.circle.com. Smoke identities persist in .tipoff/ (gitignored) so a
// failed run never strands funds; the app is checked before any money moves.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CandidateKind,
  deriveKeys,
  encodeEvidenceSpec,
  encodeMetadata,
  envelopesHash,
  hashProgramParams,
  type ProgramParams,
  permitTypes,
  sealTip,
  tipoffAbi,
  tipoffDomain,
  tipoffTypes,
} from "@tipoff/core";
import {
  type Address,
  bytesToHex,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  type Hex,
  http,
  parseSignature,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const root = join(import.meta.dirname, "..");
const APP = process.env.APP_URL ?? "http://localhost:3000";
const RPC = "https://testnet-rpc.monad.xyz";
const dep = JSON.parse(readFileSync(join(root, "contracts", "deployments", "10143.json"), "utf8")) as {
  tipoff: Address;
  usdc: Address;
};
const rawKey = readFileSync(join(root, "contracts", ".env"), "utf8").match(
  /^PRIVATE_KEY=\s*["']?(?:0x)?([0-9a-fA-F]{64})["']?\s*$/m,
)?.[1];
const deployerKey = rawKey ? (`0x${rawKey}` as Hex) : undefined;
if (!deployerKey) throw new Error("contracts/.env needs PRIVATE_KEY");

const client = createPublicClient({ chain: monadTestnet, transport: http(RPC) });
const deployer = createWalletClient({
  account: privateKeyToAccount(deployerKey),
  chain: monadTestnet,
  transport: http(RPC),
});
const domain = tipoffDomain(monadTestnet.id, dep.tipoff);
const FOUNDER_A: Address = "0x7f3a51c2aa0c7f4b54e2a7c9ae0e5d1b6f02c21e";
const FOUNDER_B: Address = "0x19be8f3e1d6c8e2d3b9a0c4f7a2e5b6c8d0f04d7";

const step = (n: number, msg: string) => console.log(`\x1b[1m${n}.\x1b[0m ${msg}`);

const BOUNTY = parseUnits("6", 6);
const EVIDENCE_PAYMENT = parseUnits("1", 6);

/** Smoke-test identities, persisted so reruns reuse them (and any USDC they hold) instead of stranding it. */
function identities() {
  const file = join(root, ".tipoff", "smoke-identities.json");
  const saved = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { sponsor: Hex; scout: Hex }) : null;
  const seeds = saved ?? {
    sponsor: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
    scout: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
  };
  if (!saved) {
    mkdirSync(join(root, ".tipoff"), { recursive: true });
    writeFileSync(file, JSON.stringify(seeds, null, 2), { mode: 0o600 });
  }
  const load = (seed: Hex) => {
    const keys = deriveKeys(Uint8Array.from(Buffer.from(seed.slice(2), "hex")));
    return { keys, account: privateKeyToAccount(bytesToHex(keys.evmSecret)) };
  };
  return { sponsor: load(seeds.sponsor), scout: load(seeds.scout) };
}

async function preflight() {
  let snapshot: Response;
  try {
    snapshot = await fetch(`${APP}/api/snapshot`, { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error(`The app isn't reachable at ${APP}. Start it first: npx pnpm@12.6.0 dev:testnet`);
  }
  if (!snapshot.ok) throw new Error(`The app at ${APP} answered ${snapshot.status}; is it running in testnet mode?`);
  const evidence = await fetch(`${APP}/api/evidence`);
  if (!evidence.ok) throw new Error(`${APP}/api/evidence answered ${evidence.status}`);
}

async function relay(body: unknown): Promise<{ hash: Hex; programId?: number; tipId?: number }> {
  const res = await fetch(`${APP}/api/relay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; error?: string; hash: Hex; programId?: number; tipId?: number };
  if (!json.ok) throw new Error(`relay rejected: ${json.error}`);
  return json;
}

const deadline = async () => (await client.getBlock()).timestamp + 1800n;
const nonce = (a: Address) =>
  client.readContract({ address: dep.tipoff, abi: tipoffAbi, functionName: "nonces", args: [a] });

async function main() {
  await preflight();
  const { sponsor, scout } = identities();
  const usdcOf = (owner: Address) =>
    client.readContract({ address: dep.usdc, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
  const [deployerUsdc, sponsorUsdc] = await Promise.all([
    usdcOf(deployer.account.address),
    usdcOf(sponsor.account.address),
  ]);
  const topUp = sponsorUsdc >= BOUNTY ? 0n : BOUNTY - sponsorUsdc;
  if (deployerUsdc < topUp + EVIDENCE_PAYMENT) {
    throw new Error(
      `Deployer ${deployer.account.address} holds ${Number(deployerUsdc) / 1e6} USDC; this run needs ${
        Number(topUp + EVIDENCE_PAYMENT) / 1e6
      }. Get more at faucet.circle.com`,
    );
  }

  if (topUp > 0n) {
    step(1, `topping up sponsor ${sponsor.account.address} with ${Number(topUp) / 1e6} USDC`);
    await client.waitForTransactionReceipt({
      hash: await deployer.writeContract({
        address: dep.usdc,
        abi: erc20Abi,
        functionName: "transfer",
        args: [sponsor.account.address, topUp],
      }),
    });
  } else {
    step(1, `sponsor ${sponsor.account.address} already holds ${Number(sponsorUsdc) / 1e6} USDC`);
  }

  const now = (await client.getBlock()).timestamp;
  const params: ProgramParams = {
    token: dep.usdc,
    bounty: BOUNTY,
    rewardPerHit: parseUnits("3", 6),
    tipDeadline: now + 86_400n,
    tailEnd: now + 86_400n + 90n * 86_400n,
    claimWindow: 7 * 86_400,
    topK: 3,
    maxTipsPerScout: 3,
    sealKey: bytesToHex(sponsor.keys.sealPublic),
    evidenceSpec: encodeEvidenceSpec({
      v: 1,
      kind: "evm-payment",
      token: dep.usdc,
      treasuries: [deployer.account.address],
      minAmount: `${parseUnits("1", 6)}`,
    }),
    metadata: encodeMetadata({
      v: 1,
      title: "Smoke test: founders we'll fund",
      sponsorName: "Tipoff smoke test",
      brief: "Automated end-to-end check on Monad testnet.",
      candidateKind: CandidateKind.Wallet,
    }),
  };
  const d = await deadline();
  const permitSig = parseSignature(
    await sponsor.account.signTypedData({
      domain: { name: "USDC", version: "2", chainId: monadTestnet.id, verifyingContract: dep.usdc },
      types: permitTypes,
      primaryType: "Permit",
      message: {
        owner: sponsor.account.address,
        spender: dep.tipoff,
        value: params.bounty,
        nonce: await client.readContract({
          address: dep.usdc,
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
          args: [sponsor.account.address],
        }),
        deadline: d,
      },
    }),
  );
  const created = await relay({
    type: "createProgram",
    params: {
      ...params,
      bounty: `${params.bounty}`,
      rewardPerHit: `${params.rewardPerHit}`,
      tipDeadline: `${params.tipDeadline}`,
      tailEnd: `${params.tailEnd}`,
    },
    sponsor: sponsor.account.address,
    deadline: `${d}`,
    signature: await sponsor.account.signTypedData({
      domain,
      types: tipoffTypes,
      primaryType: "CreateProgram",
      message: { paramsHash: hashProgramParams(params), nonce: await nonce(sponsor.account.address), deadline: d },
    }),
    permit: { deadline: `${d}`, v: Number(permitSig.v ?? 27n), r: permitSig.r, s: permitSig.s },
  });
  const programId = BigInt(created.programId ?? 0);
  step(2, `program ${programId} created gaslessly · ${created.hash}`);

  async function tip(founder: Address, label: string) {
    const sealed = sealTip({
      ctx: { chainId: monadTestnet.id, contract: dep.tipoff, programId, scout: scout.account.address },
      sponsorSealKey: params.sealKey,
      scoutSealPublic: scout.keys.sealPublic,
      candidate: { kind: CandidateKind.Wallet, value: founder },
      label,
      note: "Sealed by the testnet smoke test.",
    });
    const td = await deadline();
    const res = await relay({
      type: "commitTip",
      scout: scout.account.address,
      programId: `${programId}`,
      commitment: sealed.commitment,
      sponsorEnvelope: sealed.sponsorEnvelope,
      scoutEnvelope: sealed.scoutEnvelope,
      deadline: `${td}`,
      signature: await scout.account.signTypedData({
        domain,
        types: tipoffTypes,
        primaryType: "CommitTip",
        message: {
          programId,
          commitment: sealed.commitment,
          envelopesHash: envelopesHash(sealed.sponsorEnvelope, sealed.scoutEnvelope),
          nonce: await nonce(scout.account.address),
          deadline: td,
        },
      }),
    });
    return { sealed, tipped: res };
  }

  const { sealed, tipped } = await tip(FOUNDER_A, "Ada — smoke test");
  const second = await tip(FOUNDER_B, "Kenji — smoke test (the quiet deal)");
  step(3, `tips #${tipped.tipId} (founder A) and #${second.tipped.tipId} (founder B) sealed`);

  const rd = await deadline();
  const resolved = await relay({
    type: "resolve",
    programId: `${programId}`,
    candidateId: sealed.candidateId,
    deadline: `${rd}`,
    signature: await sponsor.account.signTypedData({
      domain,
      types: tipoffTypes,
      primaryType: "Resolve",
      message: {
        programId,
        candidateId: sealed.candidateId,
        nonce: await nonce(sponsor.account.address),
        deadline: rd,
      },
    }),
  });
  step(4, `sponsor resolved founder A · ${resolved.hash}`);

  const proven = await relay({
    type: "proveTip",
    tipId: `${tipped.tipId}`,
    candidateId: sealed.candidateId,
    salt: sealed.salt,
  });
  const hit = await client.readContract({
    address: dep.tipoff,
    abi: tipoffAbi,
    functionName: "getHit",
    args: [programId, sealed.candidateId],
  });
  if (hit.proven !== 1) throw new Error("tip was not ranked");
  step(5, `scout claimed tip #${tipped.tipId} (rank 1, pays after the claim window) · ${proven.hash}`);

  const evidence = await deployer.writeContract({
    address: dep.usdc,
    abi: erc20Abi,
    functionName: "transfer",
    args: [FOUNDER_B, parseUnits("1", 6)],
  });
  await client.waitForTransactionReceipt({ hash: evidence });
  step(6, `treasury paid founder B directly · ${evidence}`);

  console.log(
    `\nAll relayed steps passed on Monad testnet. Tip #${second.tipped.tipId} on founder B becomes claimable once CRE reports the payment.\nFor the CRE evidence step (after \`cre login\`), from workflows/:\n`,
  );
  console.log(
    `  cre workflow simulate resolver --target staging-settings --non-interactive --trigger-index 0 \\\n    --evm-tx-hash ${evidence} --evm-event-index 0 --broadcast\n`,
  );
}

main().catch((err) => {
  console.error(`\x1b[31m✗\x1b[0m ${(err as Error).message}`);
  process.exit(1);
});
