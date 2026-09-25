# Tipoff — build plan

**Tipoff** — *call it first, get paid when they sign.* Sponsors fund a bounty, scouts send sealed tips, and the
earliest scouts are paid when the sponsor acts. If the sponsor acts without resolving, public evidence resolves it.

Hard deadline: **12 Oct 2026, 23:59 PT** (Colosseum). Monad closes 13 Oct 23:59 ET.
Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Platform fee | **0.5%** of each paid hit, hard cap **1%** in the contract (`MAX_FEE_BPS = 100`) | Scouts keep ~everything; the cap is a promise sponsors can verify. Revenue later comes from sponsor tooling (private dashboards, scout scoring), not a take rate |
| Scouts paid per hit | Top **3** by commit order: 4/7, 2/7, 1/7 (57 / 29 / 14%) | Rewards being first without making it winner-takes-all |
| First sponsor | **We sponsor the first program ourselves** with real USDC on mainnet | Allowed by both hackathons; honest in the write-up. We also ask 1–2 crypto funds/communities to co-sponsor or quote, which is a bonus, not a blocker |
| Name | **Tipoff** | Short, and says what you do: you tip off a sponsor early |

### Does self-sponsoring hurt judging?

Not meaningfully. Monad asks for "a working product… a demo, a short write-up, and a link to the code". Colosseum
scores functionality, impact, novelty, UX, open source and business plan. No criterion asks for paying customers.
What judges do punish is a demo that is obviously fake. So:
- the program is real: mainnet USDC, a public page, anyone can scout;
- the backdoor moment is real: we pay a nominee from our declared treasury and the resolver pays scouts;
- the write-up says plainly "first program sponsored by the team" and lists who we talked to.

## Milestones

### M1 — Local, end-to-end, testable ✅ (25 Sep)
- [x] Architecture + plan
- [x] Monorepo scaffold (pnpm 12, Node ≥ 24, Biome, TS 7)
- [x] `contracts/` — `Tipoff.sol`, `MockUSDC.sol`, 49 tests: unit, fuzz (1,024 runs), invariants, Solidity↔TS vectors
- [x] `packages/core` — keys (PRF → EVM + X25519), seal/open, commitment, EIP-712, payout math, evidence matching (25 tests)
- [x] Local stack — `pnpm dev`: anvil (Monad rules) + deploy + seeded demo program + local resolver/keeper
- [x] `apps/web` — landing, programs, sealed tip flow, sponsor dashboard (client-side decrypt), claims, records, relayer, dev tools (15 tests)
- [x] Browser verification — full lifecycle clicked through: tip → backdoor payment → evidence hit → sponsor hit → claim → settle → paid; light/dark; 375px

Fixed along the way: payout dust could make a later rank out-earn an earlier one (fuzzer found it); sponsors could
backdate `resolve` to dodge scouts (now stamps `block.timestamp`); passkey sponsors couldn't resolve/withdraw without
gas (added signed `resolveFor` / `withdrawRemainderFor`).

### M2 — Monad testnet
- [ ] Deploy to testnet (10143) with Circle testnet USDC
- [ ] Envio HyperIndex v3 indexer, replacing log reads in the web data layer
- [ ] CRE workflow (TS): `evm-payment` adapter, `cre workflow simulate --broadcast` against the mock forwarder
- [ ] Request CRE production deploy access (day 1 action for the team)

### M3 — Hardening
- [ ] Slither + Krait security pass, fixes + regression tests
- [ ] Relayer caps (per address / global gas budget), error states, retries
- [ ] Accessibility + performance pass

### M4 — Mainnet + live program
- [ ] Deploy to Monad mainnet (143), verify contracts
- [ ] Launch the self-sponsored program, share it, collect real tips
- [ ] Execute the "backdoor" payout live and record it

### M5 — Submissions
- [ ] Demo video (≤ 3 min), README, write-ups for Metropolis (Social track + Envio, CRE, Mera bounties) and Colosseum

## Testing rules
- Every contract rule in ARCHITECTURE §6.3 has a passing and a reverting test.
- Invariants: solvency, no double pay, no early sponsor withdrawal, rank depends only on commit order.
- `packages/core` crypto is tested against fixed vectors shared with Solidity tests.
- UI is verified in a real browser (console clean, mobile layout, full lifecycle) before a milestone is ticked.

## Design direction (web)
Not Zircon's space theme. **"Field notes"**: warm paper, ink, and a single signal colour (vermilion). Sealed tips
look like stamped envelopes with a pick number and block. Typography: Bricolage Grotesque (display + UI) and JetBrains
Mono (numbers, hashes, timestamps). Motion is short and physical (seal, stamp, slide), every animation means
something, and it respects `prefers-reduced-motion`. Light theme by default, with a proper dark theme.
