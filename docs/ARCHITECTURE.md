# Tipoff — Architecture & Contract Plan

Product name: **Tipoff**. Target: Monad Metropolis (Social, Attention & Culture) and
Colosseum Crypto World's Fair (general pool). Deadline that binds: **12 Oct 2026, 23:59 PT**.

> Sponsors fund a bounty for a kind of opportunity ("founders we will fund", "artists we will sign").
> Scouts submit sealed picks. When the sponsor acts on a pick, the earliest scouts are paid —
> **and if the sponsor acts without resolving, public evidence resolves it for them.**

---

## 1. Design principles

1. **Chain is the source of truth.** No application database. Monad holds programs, picks and payouts;
   Envio is a read model; the browser holds keys.
2. **One contract, no proxy.** A single immutable `Tipoff` singleton. The owner can only allow tokens and
   configure the resolver — it can never touch funds.
3. **Users never need gas or a seed phrase.** Passkey (Mera) → EOA, EIP-712 signed intents, a relayer pays gas.
4. **Losing picks are never revealed.** Only picks that win are opened, at claim time. A scout's hit rate is still
   verifiable (`hits / public pick count`).
5. **Enforcement over trust.** The bounty is locked for the whole tail period, and an evidence resolver (Chainlink CRE)
   can settle a candidate the sponsor paid, with or without the sponsor.
6. **Pin current versions; add nothing we don't need.** No wagmi, no ORM, no auth provider, no state library.

---

## 2. System overview

```
                         ┌──────────────────────────── Monad (chain 143 / testnet 10143) ───────────────────────────┐
                         │                                                                                          │
  Browser (Next.js)      │   Tipoff.sol                                        USDC (Circle, native)           │
  ┌──────────────────┐   │   ├─ createProgramFor()  ◄── bounty locked until tail    0x7547…b603 mainnet             │
  │ Passkey (Mera)   │   │   ├─ commitTipFor()     ◄── sealed picks, ordered       0x534b…43A3 testnet             │
  │  PRF ─► HKDF ─┬─► EVM key (signs EIP-712)       ├─ resolve()            ◄── sponsor, voluntary                    │
  │               └─► X25519 key (opens envelopes)  ├─ onReport()           ◄── Chainlink CRE forwarder (evidence)   │
  │ seal / commit    │ ──EIP-712──►  Relayer ──tx──►├─ proveTip()          ◄── winning picks only                     │
  │ sponsor dashboard│   (Next.js route, pays gas)  ├─ settle()             ──► pays top-K scouts + fee                │
  └───────┬──────────┘   │                          └─ withdrawRemainder()  ──► sponsor, after tail                  │
          │ GraphQL      │                                   │ events                                               │
          ▼              └───────────────────────────────────┼──────────────────────────────────────────────────────┘
  Envio HyperIndex (hosted) ◄────────────────────────────────┘
   Program · Pick · Hit · Scout record · Sponsor record              Chainlink CRE workflow (TS, bun)
                                                                     cron + log trigger ─► read USDC Transfers from
                                                                     declared treasuries (+ Deezer/MusicBrainz labels)
                                                                     ─► DON consensus ─► writeReport ─► onReport()
```

---

## 3. Verified stack (checked 25 Sep 2026)

| Layer | Choice | Version | Why |
|---|---|---|---|
| Runtime | Node | ≥ 24 (LTS) | Envio requires ≥ 22, recommends 24 |
| Package manager | pnpm workspaces | 12.6.0 (pin via `packageManager`) | Local is 9.15.9 — upgrade via corepack |
| Contracts | Foundry | **1.8.3** | Monad docs require ≥ 1.8.0 and `network = "monad"`. Local is 1.7.1 → `foundryup` |
| Compiler | solc | 0.8.37 | Latest |
| Libraries | OpenZeppelin Contracts | v5.7.0 (latest GitHub release; npm `latest` tag still 5.6.1) | `SafeERC20`, `EIP712`, `Nonces`, `ReentrancyGuardTransient`, `Ownable2Step` |
| | forge-std | v1.16.2 | |
| Web | Next.js (App Router) | 16.3.6 | Server route for relayer, React Server Components for reads |
| | React / React DOM | 19.3.0 | |
| | TypeScript | 7.0.2 | Native (Go) compiler. **Requires** `experimental.useTypeScriptCli: true` in `next.config.ts` |
| | Tailwind CSS | 4.3.3 | |
| | TanStack Query | 5.103.2 | Server-state caching for GraphQL + chain reads |
| | zod | 4.6.5 | Validate every relayer input |
| Chain client | viem | 2.56.9 | Only chain library. **No wagmi** (no injected wallets needed) |
| Accounts | `@category-labs/mera` | 0.2.0 (**pin exact**, preview API) | Passkey PRF → EVM account; `./viem` exports `toViemAccount` |
| Crypto | `@noble/curves`, `@noble/ciphers`, `@noble/hashes` | 2.4.0 | X25519, XChaCha20-Poly1305, HKDF — audited, zero deps |
| Indexer | Envio HyperIndex | 3.12.1 (V3 stable since May 2026) | Monad supported; `indexer.onEvent` API; hosted GraphQL; **$1k bounty** |
| Evidence | `@chainlink/cre-sdk` (TS) | 1.22.0 (needs bun ≥ 1.2.21, CRE CLI ≥ 1.30) | Monad mainnet + testnet selectors, `logTrigger`, `filterLogs`, `HTTPClient`, `writeReport`. **$3k bounty** |
| Lint/format | Biome | 2.5.14 | One tool instead of ESLint + Prettier |
| Tests (TS) | Vitest | 5.0.2 | |

**Rejected on purpose:** wagmi/RainbowKit (no injected wallets), Prisma/Supabase (no DB), Privy/Dynamic (Mera is the
account layer — Mera bounty requires it to be the *entire* account layer), EIP-7702 gas sponsorship (Monad requires
delegated EOAs to keep ≥ 10 MON), `tlock-js` (0.9.0, last published Jul 2025), Spotify API (album `label` field
removed in the Feb 2026 dev-mode changes), proxies/upgradeability.

---

## 4. Repository layout

```
tipoff/
├─ package.json              # workspace root: scripts only; "packageManager": "pnpm@12.6.0", engines node>=24
├─ pnpm-workspace.yaml       # apps/*, packages/*, indexer, workflows/*
├─ biome.json
├─ .env.example              # every variable documented; .env is gitignored
├─ contracts/                # Foundry project (not a pnpm package)
│  ├─ foundry.toml           # solc 0.8.37, network="monad", rpc_endpoints, optimizer
│  ├─ src/
│  │  ├─ Tipoff.sol     # the only production contract
│  │  └─ interfaces/IReceiver.sol   # CRE consumer interface (ERC-165)
│  ├─ test/
│  │  ├─ Tipoff.t.sol           # unit + fuzz
│  │  ├─ Tipoff.invariants.t.sol
│  │  └─ mocks/MockUSDC.sol          # EIP-2612 permit
│  └─ script/Deploy.s.sol
├─ packages/
│  └─ core/                  # shared TS — no framework code
│     └─ src/
│        ├─ abi.ts           # generated from contracts/out by scripts/export-abi.ts
│        ├─ chains.ts        # monad (143) / monadTestnet (10143), addresses per chain
│        ├─ keys.ts          # PRF → { evm private key, x25519 keypair } via HKDF
│        ├─ seal.ts          # seal/open envelopes (X25519 + XChaCha20-Poly1305)
│        ├─ commitment.ts    # candidateId(), commitment(), random salt
│        ├─ typed-data.ts    # EIP-712 domain + types (single source for web + tests)
│        └─ payout.ts        # weights, mirrors Solidity for UI previews
├─ apps/
│  └─ web/                   # Next.js 16
│     ├─ app/
│     │  ├─ page.tsx                       # landing + live programs
│     │  ├─ programs/[id]/page.tsx         # public program page (rules, sponsor record, hits)
│     │  ├─ programs/[id]/pick/page.tsx    # scout: submit sealed pick
│     │  ├─ sponsor/new/page.tsx           # create + fund a program
│     │  ├─ sponsor/[id]/page.tsx          # private dashboard: decrypt picks client-side
│     │  ├─ scouts/[address]/page.tsx      # verifiable scout record
│     │  ├─ sponsors/[address]/page.tsx    # verifiable sponsor payout record
│     │  └─ api/relay/route.ts             # POST: validate → simulate → submit
│     ├─ lib/passkey.ts      # Mera ceremony + session lifecycle
│     ├─ lib/relayer.ts      # server-only viem wallet client, gas policy, rate limits
│     └─ lib/indexer.ts      # typed GraphQL queries to Envio
├─ indexer/                  # Envio HyperIndex v3
│  ├─ config.yaml            # chains: [143 | 10143], contract Tipoff, events
│  ├─ schema.graphql
│  └─ src/handlers.ts
└─ workflows/
   └─ resolver/              # Chainlink CRE workflow (bun)
      ├─ workflow.yaml / project.yaml
      ├─ main.ts
      └─ config.{staging,production}.json
```

ABI flow: `forge build` → `scripts/export-abi.ts` writes `packages/core/src/abi.ts` (`as const`) and
`indexer/abis/Tipoff.json`. No codegen dependency.

---

## 5. Program lifecycle

```
 Sponsor                    Scouts                     Evidence (CRE)            Anyone / relayer
   │ createProgramFor         │                           │                          │
   │ (bounty locked) ────────►│ commitTipFor (sealed) ×N │                          │
   │ reads picks privately    │ … until tipDeadline      │                          │
   │ acts in the real world ──┼───────────────────────────► sees payment/label       │
   │ resolve() (honest path)  │                           │ onReport() (enforcement) │
   │                          ▼                           ▼                          │
   │                 Hit(candidate) opened: actedAt, claimDeadline = now + claimWindow
   │                          │ proveTip (winners only; rank = commit order)        │
   │                          │                                                      │ settle() after claimDeadline
   │                          │ ◄──────────────── top-K paid, fee taken, rest back to pool
   │ withdrawRemainder() after tailEnd + claimWindow, once no open hits              │
```

Windows (set per program, validated at creation):
- `tipDeadline` — last moment to commit.
- `tailEnd` — last moment an action counts. **Minimum 90 days after `tipDeadline`** (the recruiting "introduction
  period", enforced in code).
- `claimWindow` — time winners have to prove a pick after a hit (default 30 days, minimum 7).

---

## 6. Contract spec — `Tipoff.sol`

Inherits: `EIP712("Tipoff","1")`, `Nonces`, `ReentrancyGuardTransient`, `Ownable2Step`, `IReceiver`.
Uses: `SafeERC20`. No proxy. No external calls except the allowed token.

### 6.1 Storage (packed; Monad warms storage per 128-slot page, so related fields stay contiguous)

```solidity
struct Program {
    address sponsor;          // slot 0
    uint64  tipDeadline;
    uint32  tipCount;
    address token;            // slot 1
    uint64  tailEnd;
    uint32  claimWindow;
    uint128 rewardPerHit;     // slot 2
    uint128 available;        // unallocated bounty
    bytes32 sealKey;          // slot 3: sponsor X25519 public key
    bytes32 evidenceHash;     // slot 4: keccak256 of evidence spec (full spec in event)
    uint64  createdAt;        // slot 5: start of the eligible action window
    uint8   topK;             // 1..5 scouts paid per hit
    uint16  maxTipsPerScout;
    uint32  openHits;         // hits not yet settled
}

struct Pick {
    address scout;            // slot 0
    uint64  committedAt;      // block.timestamp
    uint32  programId;
    bytes32 commitment;       // slot 1
}

struct Hit {
    uint64  actedAt;          // from evidence or sponsor
    uint64  claimDeadline;
    uint8   source;           // 1 = SPONSOR, 2 = EVIDENCE
    uint8   proven;           // number of entries used in topTipIds
    bool    settled;
    uint128 reward;           // allocated from Program.available at hit time
    uint256[5] topTipIds;    // sorted ascending (earliest first), bounded by topK
}

mapping(uint256 => Program) programs;
mapping(uint256 => Pick) picks;                                // tipId is a global counter = priority order
mapping(uint256 => mapping(address => uint16)) tipsByScout;
mapping(uint256 => mapping(bytes32 => Hit)) hits;             // programId => candidateId => Hit
mapping(address => bool) allowedToken;                         // USDC (+ AUSD)
address forwarder; bytes32 workflowId; address workflowOwner;  // CRE config
```

### 6.2 External interface

```solidity
// Sponsor — relayed. Pulls bounty with EIP-2612 permit, so the sponsor needs no MON.
function createProgramFor(ProgramParams calldata p, address sponsor, uint256 deadline,
                          bytes calldata sponsorSig, Permit calldata permit) external returns (uint256 programId);
function createProgram(ProgramParams calldata p) external returns (uint256 programId); // direct path

// Scout — relayed, or direct if the scout has MON (relayer cannot censor).
function commitTipFor(address scout, uint256 programId, bytes32 commitment,
                       bytes calldata sponsorEnvelope, bytes calldata scoutEnvelope,
                       uint256 deadline, bytes calldata sig) external returns (uint256 tipId);
function commitTip(uint256 programId, bytes32 commitment,
                    bytes calldata sponsorEnvelope, bytes calldata scoutEnvelope) external returns (uint256 tipId);

// Resolution
function resolve(uint256 programId, bytes32 candidateId) external;                   // sponsor only, stamps block.timestamp
function resolveFor(uint256 programId, bytes32 candidateId, uint256 deadline, bytes calldata sig) external;
function onReport(bytes calldata metadata, bytes calldata report) external;         // CRE forwarder only

// Claims (permissionless; payout always goes to pick.scout)
function proveTip(uint256 tipId, bytes32 candidateId, bytes32 salt) external;
function settle(uint256 programId, bytes32 candidateId) external;
function withdrawRemainder(uint256 programId) external;                              // sponsor only
function withdrawRemainderFor(uint256 programId, uint256 deadline, bytes calldata sig) external;

// Admin (cannot move funds)
function setAllowedToken(address token, bool allowed) external onlyOwner;
function setResolverConfig(address forwarder, bytes32 workflowId, address workflowOwner) external onlyOwner;
```

Events (everything the indexer and the sponsor dashboard need):
`ProgramCreated(programId, sponsor, token, bounty, rewardPerHit, topK, tipDeadline, tailEnd, claimWindow, sealKey, evidenceSpec)`,
`TipCommitted(programId, tipId, scout, commitment, sponsorEnvelope, scoutEnvelope)`,
`CandidateActed(programId, candidateId, actedAt, source, evidenceRef)`,
`TipProven(programId, candidateId, tipId, scout)`,
`HitSettled(programId, candidateId, tipIds, amounts, fee, returned)`,
`RemainderWithdrawn(programId, amount)`.

### 6.3 Rules the contract enforces

| Rule | Check |
|---|---|
| Bounty solvency | `bounty >= rewardPerHit`, `bounty % rewardPerHit == 0` (Paradigm's "first N": N hits fully collateralised) |
| Commit window | `block.timestamp <= tipDeadline`; `tipsByScout < maxTipsPerScout` |
| No sponsor self-scouting | `scout != sponsor` (limited — see §9) |
| Commitment | `keccak256(abi.encode(programId, scout, candidateId, salt)) == pick.commitment` |
| Pick predates the action | `pick.committedAt + MIN_TIP_AGE (60 s) <= hit.actedAt` — no copying public news, and no front-running the action's pending transaction, which names the candidate (audit M-2) |
| The bond backs evidence | A sponsor-declared hit is paid from the sponsor's wallet at `resolve` (permit via `resolveFor`); only evidence hits draw on the locked bounty. Sham declarations can't drain it (audit H-1). Unclaimed declared rewards go back to the sponsor, unclaimed evidence rewards back to the bond |
| Action inside the tail | `createdAt <= actedAt <= tailEnd`, one hit per `(program, candidate)` — reports are idempotent |
| Rank is commit order | `topTipIds` kept sorted by `tipId` on insertion, bounded by `topK` (O(K), K ≤ 5) — prove order never matters |
| Payout | sealed bonding curve (§6.4) replayed over the `n` tips actually proven, in commit order; split pro rata to shares (a lone finder gets 100%); **rank 0 takes rounding dust**; equal split if every share rounds to zero; fee set at deploy, hard cap `MAX_FEE_BPS = 100` (1%), deployed at 50 (0.5%) |
| Curve params | `baseWeight > 0`, `curveDepth > 0`, `stake >= minStake`, all fixed at creation and covered by the signed params hash |
| Stakes | pulled at commit (`safeTransferFrom` or permit); `returnStake(tipId)` is permissionless after `tipDeadline` and always pays `tip.scout`; settlement uses the stake recorded at commit, so returning it never changes a payout; `Program.staked` is tracked apart from the bounty and never blocks `withdrawRemainder` |
| Unclaimed | a hit with no proven tips returns its whole reward to `available` at settlement |
| No backdating | `resolve` stamps `block.timestamp`; only CRE evidence carries its own `actedAt`. Resolving before anyone tips is how a sponsor publicly excludes a candidate it already knew |
| Sponsor lock | `withdrawRemainder` only after `tailEnd + claimWindow` **and** `openHits == 0` |
| CRE auth | `msg.sender == forwarder`, metadata `workflowId`/`workflowOwner` **always** match (both required whenever a forwarder is set — the production forwarder delivers any workflow's report to the receiver it names; audit M-1); report decodes to `(programId, candidateId, actedAt, evidenceRef)` |
| Resolver changes | Immediate only before the first program exists, or to disable evidence; otherwise proposed and applied after `RESOLVER_DELAY` (2 days) via permissionless `applyResolverConfig` (audit L-2) |
| Payouts never block | `settle` pushes with `trySafeTransfer`; a refused transfer (e.g. USDC blocklist) is held in `owed` for the recipient's own `withdrawOwed`, never redirected (audit L-1) |
| Relayed intents | EIP-712 + `Nonces` + `deadline`; `envelopesHash` and `stake` are signed, so the relayer can't swap ciphertexts or inflate a stake |

EIP-712 types (single source in `packages/core/typed-data.ts`):

```
CommitTip(uint256 programId,bytes32 commitment,uint256 stake,bytes32 envelopesHash,uint256 nonce,uint256 deadline)
CreateProgram(bytes32 paramsHash,uint256 nonce,uint256 deadline)
Resolve(uint256 programId,bytes32 candidateId,uint256 nonce,uint256 deadline)
WithdrawRemainder(uint256 programId,uint256 nonce,uint256 deadline)
```

### 6.4 Sealed bonding curve (the conviction layer)

There is no order book and nothing to match: scouts aren't trading with each other, they're racing to name a candidate
first. The curve prices that race. Every tip carries weight `w = baseWeight + stake`. At settlement the proven tips are
replayed in commit order, and tip *i* buys

```
shares_i = L² · w_i / ((L + S_i)(L + S_i + w_i))      L = curveDepth, S_i = weight committed before it
```

which is the integral of a spot price `(1 + S/L)²`: shares get dearer as weight piles onto a candidate. The reward is
split pro rata to shares (`mulDiv` throughout, mirrored bit-for-bit in `packages/core` `curveShares`/`splitByShares`).

- **Sealed.** The chain sees each stake but never its candidate, so no public price exists while tipping is open. Only
  the sponsor, who can open every tip, sees each candidate's implied price. That's the sponsor dashboard's conviction
  board: candidates ranked by committed weight, with a projected split if the sponsor acted now.
- **Timing first.** A stake is bounded: shares `< L²/(L+S)`. With the app's default `baseWeight = curveDepth`, free tips
  split 6/9 · 2/9 · 1/9, and a stake can at most double a first tip's shares. An earlier free tip always beats any later
  tip, however large its stake.
- **No loss.** Stakes are refunded in full after tipping closes, win or lose. A stake costs the scout time value only,
  and it's locked, so flash loans can't fake conviction.

### 6.5 Monad-specific decisions

- **Gas is charged on the gas limit, not gas used.** The relayer sets `gas = estimate × 1.1` and never uses a default
  limit. There are no unbounded loops (`topK ≤ 5`).
- **No EIP-7702 for gas sponsorship.** Delegated EOAs must keep ≥ 10 MON on Monad. We use EIP-712 intents + relayer.
- **~400 ms blocks share timestamps.** Priority uses the `tipId` counter, never timestamps. Windows use `block.timestamp`.
- **No global mempool.** Front-running a sealed commitment gains nothing, because the pick content is hidden.
- **Contract size limit is 128 KB.** Not a constraint; we stay small anyway.
- Foundry: `network = "monad"` in `foundry.toml` so tests run with Monad execution rules.

---

## 7. Off-chain components

### 7.1 Keys from one passkey (Mera — "One Passkey, Many Keys")

```
prf = getPasskeyPrfOutput({ rpId })                              // one Face ID prompt
evmKey  = toSecp256k1Scalar(HKDF-SHA256(prf, salt="tipoff/v1", info="evm"))
sealKey = HKDF-SHA256(prf, salt="tipoff/v1", info="x25519")  // X25519 secret
account = toViemAccount(createSecp256k1SigningSession({ privateKey: evmKey }))
```

Only credential metadata is stored (localStorage). Keys live in memory; `session.end()` on tab hide/close.
Synced passkeys (iCloud / Google) reproduce the same account and seal key on every device.

### 7.2 Sealed envelopes

```
candidateId = keccak256(abi.encode(uint8 kind, bytes externalId))   // 1 = EVM address, 2 = Deezer artist, 3 = MusicBrainz MBID
salt        = random 32 bytes
commitment  = keccak256(abi.encode(programId, scout, candidateId, salt))
envelope    = ephX25519Pub(32) ‖ nonce(24) ‖ XChaCha20-Poly1305(key = HKDF(x25519(eph, recipient)),
                                                                 aad = chainId‖contract‖programId‖scout,
                                                                 msg = {kind, externalId, salt, note})
```

Two envelopes per pick: one to the sponsor's `sealKey` (private dashboard), one to the scout's own seal key, so the
scout can recover the salt and claim from any device. No server ever sees a plaintext pick.

### 7.3 Relayer (`apps/web/app/api/relay/route.ts`)

`zod` validates → recover the EIP-712 signer → `simulateContract` → `writeContract` with an explicit gas limit →
return the tx hash. It holds no user funds, only MON for gas. The contract caps picks per scout per program.
The relayer adds a per-address daily cap and a global daily gas budget. Its key comes from an env var for the
hackathon; move it to a KMS after.

### 7.3.1 Relayer limits and keeper

- **Budgets.** Monad charges the gas *limit*, so a relay's cost (`limit × maxFeePerGas`) is known before it is sent.
  Each relay is charged to its actor (the intent's signer, or the one-shot object a permissionless call acts on) and to a
  global daily cap (`RELAYER_ACTOR_DAILY_MON`, `RELAYER_DAILY_MON`). Below `RELAYER_MIN_BALANCE_MON` the relayer pauses and
  tells the user to send from a funded wallet; the direct contract paths always remain.
- **Nonces.** Sends are serialized in-process, so concurrent relays and keeper runs never reuse a nonce.
- **Keeper.** `GET /api/keeper` (Bearer `CRON_SECRET`) settles hits whose claim window closed and returns stakes once
  tipping closed, oldest first, capped per run. Every call is permissionless and pays the right party, so the keeper
  needs no trust; the secret only protects the relayer's gas. Scheduled by `apps/web/vercel.json`.
- **Held payouts.** A payout the token refuses (blocklist, pause) is held in `owed`; `withdrawOwedFor` lets a passkey
  scout pull it through the relayer, to the signer only.

### 7.4 Read model

M1 (built): `apps/web/lib/server/snapshot.ts` derives all state from Tipoff's own events, fetched incrementally —
the exact model the Envio indexer implements. M2 swaps its data source for Envio GraphQL without changing callers.

### 7.4.1 Indexer (Envio HyperIndex v3)

Entities: `Program`, `Pick` (commitment + both envelopes, so the sponsor dashboard reads from here), `Hit`, `Payout`,
`Scout` (picks, hits, earnings, hit rate), `Sponsor` (programs, hits by source, **evidence-resolved vs
self-resolved**, total paid, median time to pay). The sponsor record is computed only from contract events. This is
the ArbitraX track-record idea turned onto sponsors.

### 7.5 Evidence resolver (Chainlink CRE workflow)

- **Adapter A — `evm-payment` (primary, exact):** a log trigger / `filterLogs` on the program token's `Transfer`
  events *from* declared treasuries, with amount ≥ `minAmount`. `actedAt` = the transfer's block timestamp.
  `candidateId` = `(kind 1, to)`. DON consensus, then `writeReport`, then `onReport`.
- **Adapter B — `label-release` (stretch):** cron → Deezer `album.label` (public, no key), cross-checked with
  MusicBrainz release `label-info`. It passes only if both sources agree. `actedAt` = release date.
- Evidence spec per program (hash stored on-chain, full JSON emitted in `ProgramCreated`):
  `{ kind: "evm-payment", token, treasuries[≤5], minAmount }` or `{ kind: "label-release", labels[] }`.
- **Deploy access is gated.** Build and demo with `cre workflow simulate --broadcast` on testnet (MockForwarder
  `0xB9F7…d192`); production forwarders are mainnet `0x76c9…5E62` and testnet `0xF834…4482`. Request production
  deploy access on day 1. The CRE bounty accepts "build, simulate, or deploy".

---

## 8. Addresses & network constants (verified from official docs)

**Deployed:** Tipoff on Monad testnet at `0x50fd4cA4a9B3BB60D772FAd5ecdf4736a5F85707` (start block 67,037,405),
owner/fee recipient `0x02847D22…b213`, relayer `0xA1EEDaB2…E634`, forwarder = CRE simulation forwarder. Testnet USDC
permit domain verified on-chain: name `USDC`, version `2` (no EIP-5267).


| | Mainnet | Testnet |
|---|---|---|
| Chain ID | 143 | 10143 |
| RPC | `https://rpc.monad.xyz` (+ rpc1/2/3) | `https://testnet-rpc.monad.xyz` |
| USDC (Circle) | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` | `0x534b2f3A21130d7a60830c2Df862319e593943A3` |
| CRE forwarder | `0x76c9cf548b4179F8901cda1f8623568b58215E62` | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |
| CRE mock forwarder (simulation) | `0x9eF6468C5f37b976E57d52054c693269479A784d` | `0xB9F79d863261869B234c481D1f9A7af84AeAd192` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | — |

Sources: docs.monad.xyz (network information, differences, Foundry guide), developers.circle.com (USDC addresses),
docs.chain.link/cre (forwarder directory, supported networks).

---

## 9. Threat model

| Threat | Mitigation | Residual |
|---|---|---|
| Sponsor acts, never resolves | Evidence resolver settles it; bounty locked until `tailEnd + claimWindow` | — |
| Sponsor waits out the window | Tail ≥ 90 days, enforced | Deals after the tail aren't covered (same as recruiting) |
| Sponsor pays from an undeclared wallet | Treasuries are declared up front, and the sponsor record shows how each hit was resolved | **Not enforceable on-chain.** Stated openly |
| Sponsor sybil-scouts its own program to claw back the bounty | Declared hits are paid from the sponsor's wallet, so sham declarations never touch the bond (audit H-1). Rank = commit order, and the curve makes later shares dearer | **Evidence-path self-dealing:** a sponsor can pay a wallet it controls from a declared treasury, after its sybil tipped that wallet, and spend the bond on itself. Not preventable on-chain; it leaves a public treasury payment to a fresh wallet, which the sponsor record should surface |
| Whale buys a candidate's payout with a huge stake | Shares per tip are bounded (`< L²/(L+S)`); stakes are locked until tipping closes | Can crowd out later tips on the same candidate, which is the intended cost of arriving late |
| Scout copies public news | `committedAt < actedAt` | Label adapter uses the release date, so announcements before release are a gap → adapter B is a stretch goal |
| Scout sprays many candidates | Unbounded candidate space, `maxTipsPerScout`, relayer caps | Sybil accounts are cheap; later: a scout record weights sponsor attention |
| Relayer censorship | Direct `commitTip` path | — |
| CRE report replay | One hit per `(program, candidate)` | — |
| Reentrancy / odd tokens | Token allowlist (USDC/AUSD), `SafeERC20`, checks-effects-interactions, `ReentrancyGuardTransient` | — |
| Regulatory (event contracts / gambling) | Stakes are optional and always refunded in full, so a scout can't lose money. The sponsor funds all payouts, and picking is free | Needs legal review before scale |

---

## 10. Testing & verification

- **Foundry unit tests** — every rule in §6.3, including the revert paths.
- **Fuzz** — prove order vs rank (rank must depend only on `tipId`), payout math sums to reward minus fee, window boundaries.
- **Invariants** — `token.balanceOf(market) == Σ available + Σ unsettled hit rewards`; no pick is paid twice; the
  sponsor can never withdraw early; total paid ≤ bounty.
- **Static analysis** — `slither .` if installed; a `krait-quick` pass (available in this environment) before mainnet.
- **TS** — Vitest for `packages/core`: seal/open round-trip, HKDF determinism, and commitment parity with Solidity (same vectors).
- **End-to-end on testnet** — passkey → program → picks → sponsor pays the nominee from its treasury → CRE simulate
  `--broadcast` → prove → settle. This is also the demo script (the "backdoor deal still pays" moment).

---

## 11. Build order (today → 12 Oct)

| Days | Dates | Deliverable |
|---|---|---|
| 1 | 25–26 Sep | Scaffold monorepo; `foundryup` → 1.8.3; corepack pnpm 12; request CRE deploy access; Envio API token |
| 2–5 | 26–29 Sep | `Tipoff.sol` + unit/fuzz/invariant tests; testnet deploy |
| 5–8 | 29 Sep–2 Oct | `packages/core` (keys, seal, commitment, typed data) + parity tests; Envio indexer |
| 8–12 | 2–6 Oct | Web: passkey onboarding, create program (permit), sealed pick, sponsor dashboard, relayer |
| 10–13 | 4–7 Oct | CRE workflow adapter A (simulate + broadcast); prove/settle UI; scout + sponsor records |
| 13–15 | 7–9 Oct | Security pass; mainnet deploy; **launch one real program with real USDC** |
| 16–17 | 10–12 Oct | Demo video, both submissions, write-ups |

Stretch goals, only if ahead of schedule: adapter B (labels), Aurora Intents any-chain funding, AUSD.

---

## 12. Open decisions

Decided: fee 0.5% (hard cap 1%), topK 3, name Tipoff, the team sponsors the first live program. See [plan.md](../plan.md).
