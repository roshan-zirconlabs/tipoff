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

## Monad testnet

Tipoff is deployed at [`0x196d4119944CD005AD917466B8e2e2Ec018FA547`](https://testnet.monadvision.com/address/0x196d4119944CD005AD917466B8e2e2Ec018FA547)
(chain 10143, source verified) with Circle's testnet USDC.

```bash
npx pnpm@12.6.0 dev:testnet     # app + keeper against testnet; needs apps/web/.env.testnet (RELAYER_PRIVATE_KEY)
npx pnpm@12.6.0 smoke:testnet   # full relayed lifecycle on testnet; needs ~12 USDC on the deployer (faucet.circle.com)
```

- **Evidence (Chainlink CRE):** `workflows/resolver`. After `cre login`, from `workflows/`:
  `cre workflow simulate resolver --target staging-settings --non-interactive --trigger-index 0 --evm-tx-hash <payment tx> --evm-event-index 0 --broadcast`
- **Indexer (Envio HyperIndex):** `indexer/`. Deploy to Envio Cloud, then set `ENVIO_GRAPHQL_URL` in
  `apps/web/.env.testnet`; set `LOGS_RPC_URL` to Envio HyperRPC with your API token for fast log reads.

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
# tipoff
