// End-to-end smoke test on Monad testnet through the app's real relayer (POST /api/relay), exactly the path the UI
// takes: signed EIP-712 intents and EIP-2612 permits, no gas for patron or scout, test dollars from the faucet.
//
//   1. a smoke patron opens a program with a 500 tUSD bond — treasury: the deployer (watched by the CRE config)
//   2. a smoke scout seals a tip on creator A backed by a 10 tUSD stake, and a free tip on creator B
//   3. after MIN_TIP_AGE, the patron declares A, paying the 250 reward itself by permit (the bond is untouched)
//   4. the scout claims A          5. the deployer (the treasury) pays creator B directly: evidence for CRE
//
// Needs the app running on :3000 in testnet mode (npx pnpm@12.6.0 dev:testnet). Identities persist in .tipoff/.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CandidateKind, encodeEvidenceSpec, encodeMetadata, MIN_TIP_AGE, testUsdcAbi, tipoffAbi } from "@tipoff/core";
import { type Address, bytesToHex, createWalletClient, erc20Abi, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import {
  client,
  commitTip,
  createProgram,
  dep,
  fund,
  identities,
  preflight,
  proveTip,
  RPC,
  resolve,
  root,
  step,
} from "./lib/tipoff-client.ts";

const $ = (n: string) => parseUnits(n, 6);
const BOUNTY = $("500");
const REWARD = $("250");
const STAKE = $("10");
const PAYMENT = $("100");
const CREATOR_A: Address = "0x7f3a51c2aa0c7f4b54e2a7c9ae0e5d1b6f02c21e";
const CREATOR_B: Address = "0x19be8f3e1d6c8e2d3b9a0c4f7a2e5b6c8d0f04d7";

const deployerKey = readFileSync(join(root, "contracts", ".env"), "utf8").match(
  /^PRIVATE_KEY=\s*["']?(?:0x)?([0-9a-fA-F]{64})["']?\s*$/m,
)?.[1];
if (!deployerKey) throw new Error("contracts/.env needs PRIVATE_KEY");
const treasury = createWalletClient({
  account: privateKeyToAccount(`0x${deployerKey}`),
  chain: monadTestnet,
  transport: http(RPC),
});

async function main() {
  await preflight();
  const { patron, scout } = identities("smoke-identities.json", ["patron", "scout"] as const);

  step(1, "funding from the TestUSDC faucet");
  await fund(patron, BOUNTY + REWARD);
  await fund(scout, STAKE);

  const now = (await client.getBlock()).timestamp;
  const programId = await createProgram(patron, {
    token: dep.token,
    bounty: BOUNTY,
    rewardPerHit: REWARD,
    tipDeadline: now + 86_400n,
    tailEnd: now + 86_400n + 90n * 86_400n,
    claimWindow: 7 * 86_400,
    topK: 3,
    maxTipsPerScout: 3,
    baseWeight: $("50"),
    minStake: 0n,
    curveDepth: $("50"),
    sealKey: bytesToHex(patron.keys.sealPublic),
    evidenceSpec: encodeEvidenceSpec({
      v: 1,
      kind: "evm-payment",
      token: dep.token,
      treasuries: [treasury.account.address],
      minAmount: `${PAYMENT}`,
    }),
    metadata: encodeMetadata({
      v: 1,
      title: "Smoke test: creators we'll back",
      sponsorName: "Tipoff smoke test",
      brief: "Automated end-to-end check on Monad testnet.",
      candidateKind: CandidateKind.Wallet,
    }),
  });
  step(2, `program ${programId} created gaslessly`);

  const tipA = await commitTip({
    scout,
    programId,
    patronSealKey: bytesToHex(patron.keys.sealPublic),
    candidate: { kind: CandidateKind.Wallet, value: CREATOR_A },
    label: "Creator A — smoke test",
    note: "Sealed by the smoke test.",
    stake: STAKE,
  });
  const tipB = await commitTip({
    scout,
    programId,
    patronSealKey: bytesToHex(patron.keys.sealPublic),
    candidate: { kind: CandidateKind.Wallet, value: CREATOR_B },
    label: "Creator B — the quiet deal",
    note: "Sealed by the smoke test.",
  });
  const recorded = await client.readContract({
    address: dep.tipoff,
    abi: tipoffAbi,
    functionName: "getTip",
    args: [tipA.tipId],
  });
  if (recorded.stake !== STAKE) throw new Error("stake was not recorded");
  step(
    3,
    `tips #${tipA.tipId} (creator A, ${STAKE / 1_000_000n} tUSD staked by permit) and #${tipB.tipId} (creator B) sealed`,
  );

  console.log(`   waiting ${MIN_TIP_AGE + 5}s: a tip only counts if it predates the action by MIN_TIP_AGE`);
  await new Promise((r) => setTimeout(r, (MIN_TIP_AGE + 5) * 1000));
  const resolved = await resolve(patron, programId, tipA.candidateId, REWARD);
  const program = await client.readContract({
    address: dep.tipoff,
    abi: tipoffAbi,
    functionName: "getProgram",
    args: [programId],
  });
  if (program.available !== BOUNTY) throw new Error("a declared hit drew on the bond");
  step(4, `patron declared creator A, paying the reward itself; bond intact · ${resolved.hash}`);

  const proven = await proveTip(tipA.tipId, tipA.candidateId, tipA.salt);
  const hit = await client.readContract({
    address: dep.tipoff,
    abi: tipoffAbi,
    functionName: "getHit",
    args: [programId, tipA.candidateId],
  });
  if (hit.proven !== 1) throw new Error("tip was not ranked");
  step(5, `scout claimed tip #${tipA.tipId} (rank 1, pays after the claim window) · ${proven.hash}`);

  const last = await client.readContract({
    address: dep.token,
    abi: testUsdcAbi,
    functionName: "lastDrip",
    args: [treasury.account.address],
  });
  if (
    (await client.readContract({
      address: dep.token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [treasury.account.address],
    })) < PAYMENT
  ) {
    if (last !== 0n && Number(last) + 3600 > Date.now() / 1000)
      throw new Error("treasury needs a faucet drip; rerun in an hour");
    await client.waitForTransactionReceipt({
      hash: await treasury.writeContract({
        address: dep.token,
        abi: testUsdcAbi,
        functionName: "drip",
        args: [treasury.account.address],
      }),
    });
  }
  const evidence = await treasury.writeContract({
    address: dep.token,
    abi: erc20Abi,
    functionName: "transfer",
    args: [CREATOR_B, PAYMENT],
  });
  await client.waitForTransactionReceipt({ hash: evidence });
  step(6, `treasury paid creator B directly · ${evidence}`);

  console.log(`\nAll relayed steps passed. For the CRE evidence step, from workflows/:

  cre workflow simulate resolver --target staging-settings --non-interactive --trigger-index 0 \\
    --evm-tx-hash ${evidence} --evm-event-index 0 --broadcast\n`);
}

main().catch((err) => {
  console.error(`\x1b[31m✗\x1b[0m ${(err as Error).message}`);
  process.exit(1);
});
