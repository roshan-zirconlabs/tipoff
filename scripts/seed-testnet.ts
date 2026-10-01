// Seeds Monad testnet with a small, believable world for judges and testers. All through the app's relayer, paid
// in TestUSDC from the in-app faucet. Run with the app up in testnet mode (npx pnpm@12.6.0 dev:testnet):
//
//   node scripts/seed-testnet.ts            create programs, tips, a declared hit and a treasury payment
//   node scripts/seed-testnet.ts --claims   after CRE reports the payment: prove the tips on the evidence hit
//
// Paid calls appear once each hit's claim window (7 days) closes and the keeper settles it.
// Programs are clearly the team's own demo patrons; say so in the submission.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CandidateKind,
  encodeEvidenceSpec,
  encodeMetadata,
  type ProgramParams,
  testUsdcAbi,
  tipoffAbi,
} from "@tipoff/core";
import { type Address, bytesToHex, createWalletClient, erc20Abi, type Hex, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import {
  client,
  commitTip,
  createProgram,
  dep,
  fund,
  type Identity,
  identities,
  preflight,
  proveTip,
  RPC,
  resolve,
  root,
  step,
} from "./lib/tipoff-client.ts";

const $ = (n: string) => parseUnits(n, 6);
const REWARD = $("250");
const STATE = join(root, ".tipoff", "seed-state.json");

const CREATORS = {
  nala: "0x3c9e5b1d2f7a8c4e6b0d9f1a2c3e4b5d6f70a410",
  tomas: "0x5b21c7d9e3f4a6b8c0d2e4f6a8b0c2d4e6f8a1b3",
  juno: "0x6d8e0f2a4c6e8a0b2d4f6a8c0e2a4c6e8b0d2f41",
  mira: "0x7f3a51c2aa0c7f4b54e2a7c9ae0e5d1b6f02c21e",
  kenji: "0x19be8f3e1d6c8e2d3b9a0c4f7a2e5b6c8d0f04d7",
  ren: "0x2a4c6e8a0c2e4a6c8e0a2c4e6a8c0e2a4c6e8a91",
} as const satisfies Record<string, Address>;

type Pending = { tipId: string; candidateId: Hex; salt: Hex; programId: string; creator: string };
type State = { seededAt: number; pending: Pending[] };

const deployerKey = readFileSync(join(root, "contracts", ".env"), "utf8").match(
  /^PRIVATE_KEY=\s*["']?(?:0x)?([0-9a-fA-F]{64})["']?\s*$/m,
)?.[1];
if (!deployerKey) throw new Error("contracts/.env needs PRIVATE_KEY");
// The deployer is the demo treasury: the CRE workflow's staging config watches its payments.
const treasury = createWalletClient({
  account: privateKeyToAccount(`0x${deployerKey}`),
  chain: monadTestnet,
  transport: http(RPC),
});

function params(
  patron: Identity,
  o: { title: string; name: string; brief: string; looking: string; hours: number; bounty: bigint },
): ProgramParams {
  return {
    token: dep.token,
    bounty: o.bounty,
    rewardPerHit: REWARD,
    tipDeadline: 0n, // filled in by withTimes
    tailEnd: 0n,
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
      minAmount: `${$("100")}`,
    }),
    metadata: encodeMetadata({
      v: 1,
      title: o.title,
      sponsorName: o.name,
      brief: `${o.brief} (A demo patron run by the Tipoff team on Monad testnet; payouts are in test dollars.)`,
      lookingFor: o.looking,
      candidateKind: CandidateKind.Wallet,
    }),
  };
}

async function withTimes(p: ProgramParams, hours: number): Promise<ProgramParams> {
  const now = (await client.getBlock()).timestamp;
  const tipDeadline = now + BigInt(hours * 3600);
  return { ...p, tipDeadline, tailEnd: tipDeadline + 90n * 86_400n };
}

async function seed() {
  const who = identities("seed-identities.json", ["lowtide", "glasshouse", "ada", "bo", "cy", "di"] as const);
  const wallet = (c: keyof typeof CREATORS) => ({ kind: CandidateKind.Wallet, value: CREATORS[c] }) as const;

  step(1, "funding patrons and staking scouts from the TestUSDC faucet");
  await fund(who.lowtide, $("750"));
  await fund(who.glasshouse, $("750"));
  await fund(who.bo, $("150"));
  await fund(who.di, $("25"));

  step(2, "opening two programs");
  const lowtide = await createProgram(
    who.lowtide,
    await withTimes(
      params(who.lowtide, {
        title: "Season one signings",
        name: "Low Tide Records",
        brief: "We sign two independent artists a season. Tip us off before everyone else hears them.",
        looking: "Unsigned, a real local crowd, releasing on their own.",
        hours: 2,
        bounty: $("500"),
      }),
      2,
    ),
  );
  const glasshouse = await createProgram(
    who.glasshouse,
    await withTimes(
      params(who.glasshouse, {
        title: "Artists we'll commission",
        name: "Glasshouse DAO",
        brief:
          "We commission onchain artists for our collection. If we pay someone you tipped, you get a finder's fee.",
        looking: "A distinct style, a small crowd that keeps coming back, and a reason they're early.",
        hours: 9 * 24,
        bounty: $("750"),
      }),
      9 * 24,
    ),
  );
  step(2, `programs ${lowtide} (closes in 2h) and ${glasshouse} (closes in 9 days)`);

  step(3, "fans send sealed tip-offs");
  const seal = (
    scout: Identity,
    programId: bigint,
    patron: Identity,
    c: keyof typeof CREATORS,
    label: string,
    note: string,
    stake?: string,
  ) =>
    commitTip({
      scout,
      programId,
      patronSealKey: bytesToHex(patron.keys.sealPublic),
      candidate: wallet(c),
      label,
      note,
      stake: stake ? $(stake) : 0n,
    });
  const nalaA = await seal(
    who.ada,
    lowtide,
    who.lowtide,
    "nala",
    "Nala Bloom — alt-R&B, Leeds",
    "Crowd sings every word at 200-cap shows.",
  );
  const nalaB = await seal(
    who.bo,
    lowtide,
    who.lowtide,
    "nala",
    "Nala Bloom",
    "Second single is everywhere in Leeds.",
    "50",
  );
  const tomas = await seal(
    who.cy,
    lowtide,
    who.lowtide,
    "tomas",
    "Tomás Vale — ambient guitar",
    "Loops live, sells tapes at the merch table.",
  );
  await seal(who.di, lowtide, who.lowtide, "juno", "Juno — bedroom pop", "Hooks for days, no release plan yet.");
  await seal(
    who.ada,
    glasshouse,
    who.glasshouse,
    "mira",
    "Mira Osei — generative textiles",
    "Every drop sells out to the same 40 collectors.",
  );
  await seal(
    who.bo,
    glasshouse,
    who.glasshouse,
    "kenji",
    "@kenji — onchain game streams",
    "Chat grew 5× since August, no ads.",
    "100",
  );
  await seal(who.di, glasshouse, who.glasshouse, "mira", "Mira Osei", "Saw her piece at the Monad meetup.", "25");
  await seal(
    who.cy,
    glasshouse,
    who.glasshouse,
    "ren",
    "Ren — pixel zines",
    "Mints a zine a week; readers collect every issue.",
  );

  step(4, "waiting 65s so the tips predate the patron's action by MIN_TIP_AGE");
  await new Promise((r) => setTimeout(r, 65_000));

  step(5, "Low Tide declares Nala (paying the reward from its own wallet); her fans claim");
  await resolve(who.lowtide, lowtide, nalaA.candidateId, REWARD);
  await proveTip(nalaA.tipId, nalaA.candidateId, nalaA.salt);
  await proveTip(nalaB.tipId, nalaB.candidateId, nalaB.salt);

  step(6, "…and quietly pays Tomás straight from its treasury, never declaring it");
  const last = await client.readContract({
    address: dep.token,
    abi: testUsdcAbi,
    functionName: "lastDrip",
    args: [treasury.account.address],
  });
  if (last === 0n || Number(last) + 3600 < Date.now() / 1000) {
    await client.waitForTransactionReceipt({
      hash: await treasury.writeContract({
        address: dep.token,
        abi: testUsdcAbi,
        functionName: "drip",
        args: [treasury.account.address],
      }),
    });
  }
  const payment = await treasury.writeContract({
    address: dep.token,
    abi: erc20Abi,
    functionName: "transfer",
    args: [CREATORS.tomas, $("100")],
  });
  await client.waitForTransactionReceipt({ hash: payment });

  const state: State = {
    seededAt: Date.now(),
    pending: [
      {
        tipId: `${tomas.tipId}`,
        candidateId: tomas.candidateId,
        salt: tomas.salt,
        programId: `${lowtide}`,
        creator: "tomas",
      },
    ],
  };
  writeFileSync(STATE, JSON.stringify(state, null, 2), { mode: 0o600 });
  console.log(`\nSeeded. Now let CRE find the quiet payment, from workflows/:

  cre workflow simulate resolver --target staging-settings --non-interactive --trigger-index 0 \\
    --evm-tx-hash ${payment} --evm-event-index 0 --broadcast

then claim the evidence hit:  node scripts/seed-testnet.ts --claims`);
}

async function claims() {
  if (!existsSync(STATE)) throw new Error("Nothing seeded yet");
  const state = JSON.parse(readFileSync(STATE, "utf8")) as State;
  const left: Pending[] = [];
  for (const p of state.pending) {
    const hit = await client.readContract({
      address: dep.tipoff,
      abi: tipoffAbi,
      functionName: "getHit",
      args: [BigInt(p.programId), p.candidateId],
    });
    if (hit.actedAt === 0n) {
      step("·", `${p.creator}: no hit yet (has CRE reported the payment?)`);
      left.push(p);
      continue;
    }
    await proveTip(BigInt(p.tipId), p.candidateId, p.salt);
    step("✓", `${p.creator}: tip #${p.tipId} claimed on the evidence hit`);
  }
  writeFileSync(STATE, JSON.stringify({ ...state, pending: left }, null, 2), { mode: 0o600 });
}

preflight()
  .then(() => (process.argv.includes("--claims") ? claims() : seed()))
  .catch((err) => {
    console.error(`\x1b[31m✗\x1b[0m ${(err as Error).message}`);
    process.exit(1);
  });
