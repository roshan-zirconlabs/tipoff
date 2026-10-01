# Tipoff security pass — Slither 0.11.6 + Krait (26 Sep 2026)

Scope: `contracts/src/Tipoff.sol` (741 LOC, commit: working tree, v2 at 0x82A3…7318 on Monad testnet).
PoCs: `.audit/poc/Poc.t.sol` — `FOUNDRY_TEST=.audit/poc forge test -vv` (all 3 reproduce).

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| H-1 | High | Sponsor claws back the bounty with sham hits; the real hire then pays scouts 0 | **Fixed** (declared hits sponsor-funded); residual: evidence-path self-dealing, documented |
| M-1 | Medium (live on testnet) | Unset workflow checks accept reports from any CRE workflow → bounty drain | **Fixed** (workflow id + owner required, always checked) |
| M-2 | Medium | The action tx reveals the candidate in the mempool; a front-run tip still counts | **Fixed** (`MIN_TIP_AGE` = 60 s) |
| L-1 | Low | Push payouts: one blacklisted recipient bricks `settle`, which blocks `withdrawRemainder` | **Fixed** (`owed` + `withdrawOwed`) |
| L-2 | Low | Owner can repoint the forwarder instantly (no timelock) and fabricate hits | **Fixed** (2-day `RESOLVER_DELAY` once programs exist) |
| I-1 | Info | Same-second tips are rejected (`committedAt >= actedAt`); Monad has several blocks per second | Moot under `MIN_TIP_AGE` |

Fixes landed in v3 (`0xA7dD5FCE507A4b6F0a24aBdCB169DaA023746C36`). Regression tests in `test/Tipoff.t.sol`:
`test_shamDeclaredHitsCannotDrainTheBond`, `test_resolverConfig_requiresWorkflow_andRejectsForeignReports`,
`test_tipInsideMinAgeNeverCounts`, `test_settle_blocklistedScoutIsDeferred`, `test_resolverConfig_timelockedOncePrograms`.
The PoCs in `.audit/poc/` now fail at the fix points. Testnet still uses the CRE simulation forwarder, which doesn't
verify DON signatures, so testnet evidence stays unauthenticated whatever the workflow fields are; mainnet uses the
production forwarder with the real workflow id/owner.
| I-2 | Info | Slither: 18 results, all false positives or by-design (triage below) | — |

## H-1 Sponsor claws back the bounty with sham hits
`_recordHit` gives each hit `min(available, rewardPerHit)` first come, first served. A sponsor tips junk candidates from a
sybil address, `resolve`s each, and proves them. `available` hits 0, so the real hire's evidence hit is recorded with
`reward = 0` and `settled = true`, and the honest scout can't even prove. PoC: bounty 2,100 → sybil recovers 2,089, fee 10,
honest scout 0. This defeats the core promise ("backdoor deals still pay"); the only trace is public sham hits.
Fix options: (a) sponsor-declared hits draw from a separate, smaller budget than evidence hits; (b) the evidence hit
for a candidate takes priority: reserve `rewardPerHit` for evidence until `tailEnd`; (c) sponsor-declared hits pay only
after a challenge delay in which an evidence hit can supersede them; at minimum (d) surface "hits paid to wallets with no
other history" on the sponsor record and state the residual in the threat model.

## M-1 Unset workflow checks accept any workflow (live on testnet)
`onReport` skips the `workflowId`/`workflowOwner` checks when they are zero, which is what `Deploy.s.sol` sets. The
production KeystoneForwarder delivers every workflow's report to the receiver the workflow names, so any CRE user can
fabricate hits. The testnet deployment additionally uses the simulation forwarder, which doesn't verify DON signatures.
PoC: attacker tips 3 of their own candidates, reports each, drains 2,089 of 2,100.
Fix: in `setResolverConfig`, require non-zero `workflowId` and `workflowOwner` whenever `forwarder != 0`; set them in the
deploy script from env; add a regression test that a foreign workflow reverts.

## M-2 Front-running the action
`resolve`/`resolveFor` and the treasury's payment carry the candidate in plain calldata. A watcher tips that candidate
in an earlier-second block during the tipping window; `committedAt < actedAt` holds, so it's paid. PoC: honest 522,
front-runner 174. Fix: require `committedAt + MIN_TIP_AGE <= actedAt` (e.g. 1 hour, which also absorbs I-1's granularity),
and/or recommend private submission for sponsor transactions.

## L-1 Push payouts can brick settlement
`settle` transfers to every scout and `feeRecipient` in one transaction. A USDC-blacklisted scout (or fee recipient)
reverts it; `openHits` never decrements and `withdrawRemainder` is blocked forever. Fix: skip/escrow failed transfers
(pull pattern for the failing recipient).

## L-2 Owner is trusted to not fabricate evidence
`setResolverConfig` takes effect immediately. The owner (or a stolen owner key) can point `forwarder` at itself and
report hits. Fix: timelock resolver changes, or make them apply only to programs created afterwards; document the trust.

## I-1 Same-second tips
Monad blocks are ~0.4 s but `block.timestamp` is in seconds, so a tip in an earlier block of the same second as the
action is rejected. Conservative (never pays a late tip); M-2's `MIN_TIP_AGE` makes it moot.

## I-2 Slither triage
- `arbitrary-send-erc20` ×2 — FP: `from` is `msg.sender` or the verified EIP-712 signer (stake is signed).
- `uninitialized-state _hits` — FP: written through storage pointers.
- `missing-zero-check setResolverConfig` — zero forwarder intentionally disables evidence (but see M-1).
- `reentrancy-benign` ×2 — FP: Slither failed to build IR for OZ `ReentrancyGuardTransient`, so it can't see
  `nonReentrant`; the only prior call is an allow-listed token's `permit`.
- `timestamp` ×9 — by design (day-scale windows).
- `cyclomatic-complexity proveTip`, `unindexed-event-address ResolverConfigured` — informational.

## Checked and not found
Reentrancy (guards + CEI), signature replay (EIP-712 domain + nonces + deadline), relayer tampering (stake and
envelopes signed), curve math overflow/div-by-zero (bounded, `curveDepth > 0`), stake accounting (invariant
`stakesAreNeverLost` + solvency), rank ordering (fuzzed), withdraw/evidence boundary (`<=` vs `>` consistent).
