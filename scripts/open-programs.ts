// Opens demo programs on Monad testnet that stay open through judging, via the live app's relayer:
//
//   APP_URL=https://tip-off.vercel.app node scripts/open-programs.ts [--days 20]
//
// Low Tide's treasury is the deployer (the address the CRE staging workflow watches), so a "quiet payment" can be
// demonstrated live. Other patrons use their own wallet as treasury, so one payment never triggers hits elsewhere.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CandidateKind, encodeEvidenceSpec, encodeMetadata, type ProgramParams } from "@tipoff/core";
import { type Address, bytesToHex, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  APP,
  client,
  commitTip,
  createProgram,
  dep,
  fund,
  type Identity,
  identities,
  preflight,
  root,
  step,
} from "./lib/tipoff-client.ts";

const $ = (n: string) => parseUnits(n, 6);
const daysFlag = process.argv.indexOf("--days");
const days = daysFlag >= 0 ? Number(process.argv[daysFlag + 1]) : 20;
if (!Number.isInteger(days) || days < 1 || days > 60) throw new Error("--days must be a whole number of days, 1–60");
const deployerKey = readFileSync(join(root, "contracts", ".env"), "utf8").match(
  /^PRIVATE_KEY=\s*["']?(?:0x)?([0-9a-fA-F]{64})["']?\s*$/m,
)?.[1];
if (!deployerKey) throw new Error("contracts/.env needs PRIVATE_KEY");
const creTreasury = privateKeyToAccount(`0x${deployerKey}`).address;

type Spec = {
  patron: Identity;
  name: string;
  title: string;
  brief: string;
  looking: string;
  treasury: Address;
};

async function open(s: Spec) {
  await fund(s.patron, $("750"));
  const now = (await client.getBlock()).timestamp;
  const tipDeadline = now + BigInt(days * 86_400);
  const params: ProgramParams = {
    token: dep.token,
    bounty: $("750"),
    rewardPerHit: $("250"),
    tipDeadline,
    tailEnd: tipDeadline + 90n * 86_400n,
    claimWindow: 7 * 86_400,
    topK: 3,
    maxTipsPerScout: 3,
    baseWeight: $("50"),
    minStake: 0n,
    curveDepth: $("50"),
    sealKey: bytesToHex(s.patron.keys.sealPublic),
    evidenceSpec: encodeEvidenceSpec({
      v: 1,
      kind: "evm-payment",
      token: dep.token,
      treasuries: [s.treasury],
      minAmount: `${$("100")}`,
    }),
    metadata: encodeMetadata({
      v: 1,
      title: s.title,
      sponsorName: s.name,
      brief: `${s.brief} (A demo patron run by the Tipoff team on Monad testnet; payouts are in test dollars.)`,
      lookingFor: s.looking,
      candidateKind: CandidateKind.Wallet,
    }),
  };
  const id = await createProgram(s.patron, params);
  step("✓", `${s.name}: program ${id} "${s.title}", open ${days} days`);
  return id;
}

async function main() {
  await preflight();
  const who = identities("seed-identities.json", ["lowtide", "glasshouse", "signal", "ada", "bo", "cy", "di"] as const);

  const lowtide = await open({
    patron: who.lowtide,
    name: "Low Tide Records",
    title: "Season two signings",
    brief: "We sign two independent artists a season. Tip us off before everyone else hears them.",
    looking: "Unsigned artists with a real local crowd, releasing on their own.",
    treasury: creTreasury,
  });
  const glasshouse = await open({
    patron: who.glasshouse,
    name: "Glasshouse DAO",
    title: "Artists we'll commission, round two",
    brief: "We commission onchain artists for our collection. If we pay someone you tipped, you get a finder's fee.",
    looking: "A distinct style, a small crowd that keeps coming back, and a reason they're early.",
    treasury: who.glasshouse.account.address,
  });
  const signal = await open({
    patron: who.signal,
    name: "Signal FM",
    title: "Producers we'll book",
    brief: "An independent radio collective booking producers for our live sessions. Tell us who's next.",
    looking: "Producers with a sound of their own and sets people talk about.",
    treasury: who.signal.account.address,
  });

  step("·", "fans send a few sealed tip-offs so the boards aren't empty");
  const tip = async (
    scout: Identity,
    programId: bigint,
    patron: Identity,
    creator: Address,
    label: string,
    note: string,
    stake = "0",
  ) => {
    if (stake !== "0") await fund(scout, $(stake));
    await commitTip({
      scout,
      programId,
      patronSealKey: bytesToHex(patron.keys.sealPublic),
      candidate: { kind: CandidateKind.Wallet, value: creator },
      label,
      note,
      stake: $(stake),
    });
  };
  await tip(
    who.ada,
    lowtide,
    who.lowtide,
    "0x3c9e5b1d2f7a8c4e6b0d9f1a2c3e4b5d6f70a410",
    "Nala Bloom — alt-R&B, Leeds",
    "Her new single is everywhere in Leeds.",
  );
  await tip(
    who.bo,
    lowtide,
    who.lowtide,
    "0x6d8e0f2a4c6e8a0b2d4f6a8c0e2a4c6e8b0d2f41",
    "Juno — bedroom pop",
    "Hooks for days; first show sold out.",
    "25",
  );
  await tip(
    who.cy,
    glasshouse,
    who.glasshouse,
    "0x7f3a51c2aa0c7f4b54e2a7c9ae0e5d1b6f02c21e",
    "Mira Osei — generative textiles",
    "Every drop sells out to the same 40 collectors.",
  );
  await tip(
    who.di,
    signal,
    who.signal,
    "0x2a4c6e8a0c2e4a6c8e0a2c4e6a8c0e2a4c6e8a91",
    "Ren — lo-fi producer",
    "Sets on the community stream pull 200 live.",
    "10",
  );
  step("✓", `done. Open: ${APP}/programs`);
}

main().catch((err) => {
  console.error(`\x1b[31m✗\x1b[0m ${(err as Error).message}`);
  if (process.env.DEBUG) console.error((err as Error).stack);
  process.exit(1);
});
