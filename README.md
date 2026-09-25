# Tipoff

**Call it first. Get paid when they sign.** Sealed scout markets on Monad: sponsors lock a bounty, scouts send
sealed tips, and when the sponsor acts on a tipped candidate, the earliest scouts are paid, even if the sponsor acts
quietly, because evidence of the payment resolves the hit for them.

- Plan and decisions: [plan.md](plan.md)
- Architecture and contract spec: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Run it locally

Requires Node ≥ 24, [Foundry](https://getfoundry.sh) ≥ 1.8 (`foundryup`), and pnpm 12 (`npx pnpm@12.6.0`).

```bash
git submodule update --init --recursive
npx pnpm@12.6.0 install
node scripts/dev.ts
```

That one command starts a local chain with Monad's execution rules, deploys Tipoff, seeds a demo program with three
sealed tips, runs a local evidence resolver (standing in for Chainlink CRE) and a keeper, and serves the app at
http://localhost:3000.

Use the **Dev chain** button (bottom left) to fast-forward time, mint test USDC, switch between the demo sponsor and
scout identities, and pay a founder "off-platform" from the sponsor's treasury to watch evidence resolve the hit.
Passkeys work on `localhost` in Chrome and Safari; a throwaway dev key is available for automated testing.

## Test

```bash
cd contracts && forge test            # 49 tests: unit, fuzz, invariants, cross-language vectors
cd packages/core && npx vitest run    # 25 tests: crypto, hashing parity, evidence matching
cd apps/web && npx vitest run         # 15 tests: tip status machine, relay validation, formatting
npx biome check .                     # lint + format
```

## Layout

| Path | What |
|---|---|
| `contracts/` | `Tipoff.sol` (single immutable contract) and its Foundry tests |
| `packages/core/` | Shared TypeScript: keys, sealing, commitments, EIP-712, payout and evidence logic |
| `apps/web/` | Next.js 16 app: UI, relayer (`/api/relay`), event-derived read model |
| `scripts/dev.ts` | One-command local stack |
# tipoff
