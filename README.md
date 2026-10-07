# Tipoff: early-supporter rewards that can't be dodged

**Call it first. Get paid when they make it.** Fans tip off patrons (collectors, DAOs, labels) about creators they
spotted first. When the patron pays that creator, even without announcing it, the fans who called it earliest get a
finder's fee. A Chainlink CRE workflow treats the patron's own treasury payment as proof, and stakes are always
refunded, so fans can't lose money.

> Built for **Monad Metropolis** (Social, Attention & Culture, plus the Chainlink CRE, Envio and Mera bounties) and the
> **Colosseum Crypto World's Fair**. Live on Monad testnet.

## For judges: try it in two minutes

**Live app:** [tipoff-phi.vercel.app](https://tipoff-phi.vercel.app) (Monad testnet)

1. Tap **Sign in**. A passkey (Face ID or Touch ID) creates your account: no seed phrase, no extension, no gas.
2. The welcome card offers **Get 1,000 test dollars**. It's also in the account menu (TestUSDC; worthless; relayed, so
   no gas).
3. **As a fan:** open *Glasshouse DAO: Artists we'll commission* and tip off a creator **by their Farcaster @handle**.
   Tipoff finds their verified wallet and shows their face. A wallet, or any link containing one, also works.
   Optionally back the tip with a stake.
4. **As a patron:** **For patrons** → open a program. Your dashboard decrypts every tip on this device only and ranks
   creators by conviction, with each scout's track record shown alongside.
5. See **Called it** for public, verifiable receipts, and **Scouts** for the leaderboard. Receipts and programs
   unfurl as Farcaster mini app cards when shared.

Demo patrons (Low Tide Records, Glasshouse DAO) are run by the team with test dollars, and each program's brief says
so.

| | Address (Monad testnet, Sourcify-verified) |
|---|---|
| Tipoff | [`0x50fd4cA4a9B3BB60D772FAd5ecdf4736a5F85707`](https://testnet.monadvision.com/address/0x50fd4cA4a9B3BB60D772FAd5ecdf4736a5F85707) |
| TestUSDC (public faucet) | [`0xB98D8cd9D58249E2fC61e157EB5102745EF59F59`](https://testnet.monadvision.com/address/0xB98D8cd9D58249E2fC61e157EB5102745EF59F59) |

## Sponsor bounties: where to look

- **Chainlink CRE: the enforcement layer.**
  - Code: [`workflows/resolver`](workflows/resolver).
  - It triggers on a token transfer from a patron's declared treasury.
  - It checks the program's evidence spec against the hash stored on-chain.
  - It `writeReport`s the hit to `Tipoff.onReport`. The contract checks the forwarder, workflow ID and owner.
  - **On-chain proof (simulated with `--broadcast`):** the patron quietly pays a creator in
    [`0x9d79…777b`](https://testnet.monadvision.com/tx/0x9d7922bc38938e5ceb75246c924fb0f1ea5a51acdf55d6d3296a2f80609e777b).
    CRE then records the evidence hits
    [`0xe62b…84e5`](https://testnet.monadvision.com/tx/0xe62b2f6e248fe547ee61544c598e8221778857f4f9ef0dff53c928c0e57084e5)
    and
    [`0x4409…2ae6`](https://testnet.monadvision.com/tx/0x4409c149c92802bdec2269423404b3e8d19b348b21e84ca3c1bcb0d99f972ae6).
- **Envio HyperIndex: the whole read layer.**
  - Code: [`indexer/`](indexer).
  - Live on Envio Cloud: `https://indexer.dev.hyperindex.xyz/4b82532/v1/graphql`.
  - Every page reads from it: programs, the "Called it" feed, the leaderboard and public records. Replaying logs over
    the public RPC isn't viable (25 req/s, 100-block `eth_getLogs`).
- **Mera.**
  - Passkeys are the only account layer.
  - One passkey's PRF output derives two keys: a secp256k1 account key, and an **X25519 key that end-to-end encrypts
    every tip** to the patron (XChaCha20-Poly1305 with chain, contract, program and scout as associated data).
  - Code: [`apps/web/lib/client/passkey.ts`](apps/web/lib/client/passkey.ts) and
    [`packages/core/src/keys.ts`](packages/core/src/keys.ts).

More: [docs/SUBMISSION.md](docs/SUBMISSION.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[security pass](contracts/.audit/report.md) · [plan.md](plan.md)

## Run it locally

Requires Node ≥ 24, [Foundry](https://getfoundry.sh) ≥ 1.8 (`foundryup`), and pnpm 12 (`npx pnpm@12.6.0`).

```bash
git submodule update --init --recursive
npx pnpm@12.6.0 install
node scripts/dev.ts
```

That one command:
- starts a local chain with Monad's execution rules and deploys Tipoff;
- seeds a finished season (a paid call) and an open program;
- runs a local evidence resolver (standing in for Chainlink CRE) and a keeper;
- serves the app at http://localhost:3000.

Use the **Dev chain** button (bottom left) to:
- fast-forward time;
- mint test dollars;
- switch between the demo patron and scouts;
- pay a creator "off-platform" from the patron's treasury, to watch evidence resolve the hit.

## Monad testnet

```bash
npx pnpm@12.6.0 dev:testnet     # app against testnet via Envio; needs apps/web/.env.testnet (RELAYER_PRIVATE_KEY, ENVIO_GRAPHQL_URL)
npx pnpm@12.6.0 seed:testnet    # demo patrons, tips, a declared hit and a quiet payment for CRE
npx pnpm@12.6.0 smoke:testnet   # full relayed lifecycle through the app's relayer
node scripts/patron-invite.ts --name "<patron>" --title "<program>"   # pre-filled program link for a real patron
```

## Test

```bash
cd contracts && forge test            # 49 tests: unit, fuzz, invariants, cross-language vectors
cd packages/core && npx vitest run    # 25 tests: crypto, hashing parity, evidence matching
cd apps/web && npx vitest run         # 17 tests: tip status machine, relay validation, formatting, Envio mapping
cd indexer && npx vitest run          # Envio handlers over a simulated lifecycle (no Docker)
cd workflows/resolver && npx bun test # CRE workflow on the SDK mock runtime
npx biome check .                     # lint + format
```

## Layout

| Path | What |
|---|---|
| `contracts/` | `Tipoff.sol` (single immutable contract) and its Foundry tests |
| `packages/core/` | Shared TypeScript: keys, sealing, commitments, EIP-712, payout and evidence logic |
| `apps/web/` | Next.js 16 app: UI, relayer (`/api/relay`), event-derived read model |
| `indexer/` | Envio HyperIndex v3 indexer (config, schema, handlers) |
| `workflows/resolver/` | Chainlink CRE evidence workflow |
| `scripts/dev.ts` | One-command stack: local chain, or `--network testnet` |
| `scripts/smoke-testnet.ts` | End-to-end check on Monad testnet through the relayer |
| `scripts/preflight-mainnet.ts` | Read-only mainnet readiness checks (no funds move) |
| `apps/web/app/api/keeper` | Cron-triggered keeper: settles closed hits, returns unlocked stakes |
# tipoff
