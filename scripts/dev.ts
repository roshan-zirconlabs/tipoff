// One command for the whole local stack:
//   anvil (Monad execution rules) → deploy → seed a demo program with sealed tips → local evidence resolver → next dev
//
// The resolver here stands in for the Chainlink CRE workflow: it runs the same pure `matchPayments` from
// @tipoff/core against USDC transfers and delivers reports to Tipoff.onReport as the configured forwarder. It also
// settles hits whose claim window has closed (the keeper role).

import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CandidateKind,
  decodeEvidenceSpec,
  deriveKeys,
  encodeEvidenceSpec,
  encodeMetadata,
  matchPayments,
  mockUsdcAbi,
  type ResolvableProgram,
  sealTip,
  type TransferEvidence,
  tipoffAbi,
} from "@tipoff/core";
import {
  type Address,
  bytesToHex,
  createPublicClient,
  createTestClient,
  createWalletClient,
  encodeAbiParameters,
  erc20Abi,
  type Hex,
  http,
  parseEther,
  parseEventLogs,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const root = join(import.meta.dirname, "..");
const RPC = "http://127.0.0.1:8545";
// Anvil's well-known development keys. Never use these anywhere but a local chain.
const DEPLOYER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const RELAYER = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const RESOLVER = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
/** Seeds standing in for passkey PRF output — the demo sponsor can be "signed in as" from the dev toolbar. */
const DEMO_SPONSOR_SEED = `0x${"d5".repeat(32)}` as const;
const DEMO_SCOUT_SEEDS = [`0x${"a1".repeat(32)}`, `0x${"a2".repeat(32)}`, `0x${"a3".repeat(32)}`] as const;

const children: ChildProcess[] = [];
const log = (tag: string, msg: string) => console.log(`\x1b[2m[${tag}]\x1b[0m ${msg}`);

function shutdown() {
  for (const c of children) c.kill("SIGTERM");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function run(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd ?? root, env: { ...process.env, ...opts.env }, stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

async function waitForRpc(client: ReturnType<typeof createPublicClient>) {
  for (let i = 0; i < 60; i++) {
    try {
      await client.getChainId();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error("anvil did not start");
}

const fromHex = (hex: string) => Uint8Array.from(hex.slice(2).match(/.{2}/g) ?? [], (b) => Number.parseInt(b, 16));
function demoAccount(seed: string) {
  const keys = deriveKeys(fromHex(seed));
  return { account: privateKeyToAccount(bytesToHex(keys.evmSecret)), sealPublic: keys.sealPublic };
}

async function main() {
  const anvil = spawn("anvil", ["--network", "monad", "--chain-id", "31337", "--port", "8545", "--silent"], {
    stdio: "inherit",
  });
  children.push(anvil);
  const client = createPublicClient({ chain: foundry, transport: http(RPC) });
  await waitForRpc(client);
  log("chain", "anvil up on :8545 (Monad rules)");

  const resolverAccount = privateKeyToAccount(RESOLVER);
  await run(
    "forge",
    ["script", "script/Deploy.s.sol:Deploy", "--rpc-url", RPC, "--private-key", DEPLOYER, "--broadcast", "--silent"],
    { cwd: join(root, "contracts"), env: { FORWARDER: resolverAccount.address } },
  );
  const dep = JSON.parse(readFileSync(join(root, "contracts", "deployments", "31337.json"), "utf8")) as {
    tipoff: Address;
    usdc: Address;
    startBlock: number;
  };
  log("deploy", `Tipoff ${dep.tipoff} · USDC ${dep.usdc}`);

  writeFileSync(
    join(root, "apps", "web", ".env.local"),
    [
      "# Written by scripts/dev.ts — local chain only.",
      "NEXT_PUBLIC_CHAIN_ID=31337",
      `NEXT_PUBLIC_RPC_URL=${RPC}`,
      `NEXT_PUBLIC_TIPOFF_ADDRESS=${dep.tipoff}`,
      `NEXT_PUBLIC_USDC_ADDRESS=${dep.usdc}`,
      `NEXT_PUBLIC_START_BLOCK=${dep.startBlock}`,
      "NEXT_PUBLIC_FEE_BPS=50",
      "NEXT_PUBLIC_DEV_TOOLS=1",
      `NEXT_PUBLIC_DEMO_SPONSOR_SEED=${DEMO_SPONSOR_SEED}`,
      `RELAYER_PRIVATE_KEY=${RELAYER}`,
      "",
    ].join("\n"),
  );

  await seed(client, dep);
  startResolver(client, dep, resolverAccount);

  const next = spawn(join(root, "apps", "web", "node_modules", ".bin", "next"), ["dev", "--port", "3000"], {
    cwd: join(root, "apps", "web"),
    stdio: "inherit",
    env: process.env,
  });
  children.push(next);
  log("web", "http://localhost:3000");
}

async function seed(client: ReturnType<typeof createPublicClient>, dep: { tipoff: Address; usdc: Address }) {
  const test = createTestClient({ chain: foundry, mode: "anvil", transport: http(RPC) });
  const deployer = createWalletClient({ account: privateKeyToAccount(DEPLOYER), chain: foundry, transport: http(RPC) });
  const sponsor = demoAccount(DEMO_SPONSOR_SEED);
  await test.setBalance({ address: sponsor.account.address, value: parseEther("10") });
  await deployer.writeContract({
    address: dep.usdc,
    abi: mockUsdcAbi,
    functionName: "mint",
    args: [sponsor.account.address, parseUnits("25000", 6)],
  });

  const wallet = createWalletClient({ account: sponsor.account, chain: foundry, transport: http(RPC) });
  await wallet.writeContract({
    address: dep.usdc,
    abi: erc20Abi,
    functionName: "approve",
    args: [dep.tipoff, parseUnits("25000", 6)],
  });
  const now = (await client.getBlock()).timestamp;
  const tipDeadline = now + 14n * 86_400n;
  const hash = await wallet.writeContract({
    address: dep.tipoff,
    abi: tipoffAbi,
    functionName: "createProgram",
    args: [
      {
        token: dep.usdc,
        bounty: parseUnits("6000", 6),
        rewardPerHit: parseUnits("1500", 6),
        tipDeadline,
        tailEnd: tipDeadline + 90n * 86_400n,
        claimWindow: 30 * 86_400,
        topK: 3,
        maxTipsPerScout: 3,
        sealKey: bytesToHex(sponsor.sealPublic),
        evidenceSpec: encodeEvidenceSpec({
          v: 1,
          kind: "evm-payment",
          token: dep.usdc,
          treasuries: [sponsor.account.address],
          minAmount: `${parseUnits("100", 6)}`,
        }),
        metadata: encodeMetadata({
          v: 1,
          title: "Founders we'll fund this quarter",
          sponsorName: "Northlight Ventures (demo)",
          brief:
            "Pre-seed teams building consumer apps on Monad. If we write a cheque to someone you tipped, you get paid — whether or not we remember to say so.",
          lookingFor: "A shipping team, real users without paid acquisition, and a reason they're early.",
          candidateKind: CandidateKind.Wallet,
        }),
      },
    ],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const programId = parseEventLogs({ abi: tipoffAbi, logs: receipt.logs, eventName: "ProgramCreated" })[0]?.args
    .programId;
  if (!programId) throw new Error("seed: program not created");

  const founders: [Address, string, string][] = [
    [
      "0x7f3a51c2aa0c7f4b54e2a7c9ae0e5d1b6f02c21e",
      "Ada — payroll rails for gig workers",
      "400 riders in Lagos, zero ads.",
    ],
    [
      "0x19be8f3e1d6c8e2d3b9a0c4f7a2e5b6c8d0f04d7",
      "Kenji — ZK proving in the browser",
      "Rewrote a prover in a weekend.",
    ],
    ["0x7f3a51c2aa0c7f4b54e2a7c9ae0e5d1b6f02c21e", "Ada (again) — second scout on her", "Saw her demo at a meetup."],
  ];
  for (const [i, seedHex] of DEMO_SCOUT_SEEDS.entries()) {
    const scout = demoAccount(seedHex);
    const scoutKeys = deriveKeys(fromHex(seedHex));
    const [founder, label, note] = founders[i] as [Address, string, string];
    await test.setBalance({ address: scout.account.address, value: parseEther("1") });
    const sealed = sealTip({
      ctx: { chainId: 31337, contract: dep.tipoff, programId, scout: scout.account.address },
      sponsorSealKey: bytesToHex(sponsor.sealPublic),
      scoutSealPublic: scoutKeys.sealPublic,
      candidate: { kind: CandidateKind.Wallet, value: founder },
      label,
      note,
    });
    const w = createWalletClient({ account: scout.account, chain: foundry, transport: http(RPC) });
    await client.waitForTransactionReceipt({
      hash: await w.writeContract({
        address: dep.tipoff,
        abi: tipoffAbi,
        functionName: "commitTip",
        args: [programId, sealed.commitment, sealed.sponsorEnvelope, sealed.scoutEnvelope],
      }),
    });
  }
  log("seed", `demo program ${programId} with ${DEMO_SCOUT_SEEDS.length} sealed tips`);
}

function startResolver(
  client: ReturnType<typeof createPublicClient>,
  dep: { tipoff: Address; usdc: Address; startBlock: number },
  account: ReturnType<typeof privateKeyToAccount>,
) {
  const wallet = createWalletClient({ account, chain: foundry, transport: http(RPC) });
  const metadata = `0x${"00".repeat(64)}` as Hex; // workflow checks are off locally
  const reported = new Set<string>();
  const settled = new Set<string>();
  const transfers: TransferEvidence[] = [];
  const timestamps = new Map<bigint, bigint>();
  let from = BigInt(dep.startBlock);
  let busy = false;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const latest = await client.getBlock();
      if (latest.number >= from) {
        const logs = await client.getContractEvents({
          address: dep.usdc,
          abi: erc20Abi,
          eventName: "Transfer",
          fromBlock: from,
          toBlock: latest.number,
        });
        for (const l of logs) {
          if (!timestamps.has(l.blockNumber)) {
            timestamps.set(l.blockNumber, (await client.getBlock({ blockNumber: l.blockNumber })).timestamp);
          }
          transfers.push({
            token: dep.usdc,
            from: l.args.from as Address,
            to: l.args.to as Address,
            value: l.args.value as bigint,
            timestamp: timestamps.get(l.blockNumber) ?? 0n,
            txHash: l.transactionHash,
          });
        }
        from = latest.number + 1n;
      }

      const events = await client.getContractEvents({
        address: dep.tipoff,
        abi: tipoffAbi,
        fromBlock: BigInt(dep.startBlock),
      });
      const programs: ResolvableProgram[] = [];
      for (const e of events) {
        if (e.eventName !== "ProgramCreated") continue;
        const block = await client.getBlock({ blockNumber: e.blockNumber });
        programs.push({
          programId: e.args.programId as bigint,
          createdAt: block.timestamp,
          tailEnd: e.args.tailEnd as bigint,
          spec: decodeEvidenceSpec(e.args.evidenceSpec as Hex),
        });
      }
      const acted = new Set(
        events.filter((e) => e.eventName === "CandidateActed").map((e) => `${e.args.programId}:${e.args.candidateId}`),
      );

      for (const r of matchPayments(programs, transfers, dep.tipoff)) {
        const key = `${r.programId}:${r.candidateId}`;
        if (acted.has(key) || reported.has(key)) continue;
        reported.add(key);
        const report = encodeAbiParameters(
          [{ type: "uint256" }, { type: "bytes32" }, { type: "uint64" }, { type: "bytes32" }],
          [r.programId, r.candidateId, r.actedAt, r.evidenceRef],
        );
        try {
          await client.waitForTransactionReceipt({
            hash: await wallet.writeContract({
              address: dep.tipoff,
              abi: tipoffAbi,
              functionName: "onReport",
              args: [metadata, report],
            }),
          });
          log("resolver", `evidence: treasury paid ${r.paidTo} → program ${r.programId} hit recorded`);
        } catch (err) {
          log("resolver", `report rejected for program ${r.programId}: ${(err as Error).message.split("\n")[0]}`);
        }
      }

      // Keeper: pay out hits whose claim window closed.
      const done = new Set(
        events.filter((e) => e.eventName === "HitSettled").map((e) => `${e.args.programId}:${e.args.candidateId}`),
      );
      for (const e of events) {
        if (e.eventName !== "CandidateActed") continue;
        const key = `${e.args.programId}:${e.args.candidateId}`;
        if (done.has(key) || settled.has(key) || (e.args.reward as bigint) === 0n) continue;
        if ((e.args.claimDeadline as bigint) >= latest.timestamp) continue;
        settled.add(key);
        try {
          await client.waitForTransactionReceipt({
            hash: await wallet.writeContract({
              address: dep.tipoff,
              abi: tipoffAbi,
              functionName: "settle",
              args: [e.args.programId as bigint, e.args.candidateId as Hex],
            }),
          });
          log("keeper", `settled program ${e.args.programId} hit ${String(e.args.candidateId).slice(0, 10)}…`);
        } catch (err) {
          settled.delete(key);
          log("keeper", `settle failed: ${(err as Error).message.split("\n")[0]}`);
        }
      }
    } catch (err) {
      log("resolver", `tick failed: ${(err as Error).message.split("\n")[0]}`);
    } finally {
      busy = false;
    }
  };
  setInterval(tick, 2000);
  log("resolver", `watching treasuries as forwarder ${account.address}`);
}

main().catch((err) => {
  console.error(err);
  shutdown();
});
