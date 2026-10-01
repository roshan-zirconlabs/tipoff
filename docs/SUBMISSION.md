# Tipoff — submission kit

One product, two submissions:

- **Monad Metropolis:** Social, Attention & Culture track, plus bounties. The priority. Due **Oct 14 03:59 UTC**
  (Oct 13 evening US).
- **Colosseum Crypto World's Fair:** general prizes. There's no Monad track. Due **Oct 12, 2026**.

Checked against the live pages on 30 Sep 2026:

- **Monad:** "Live Product Link: deployed on Monad Mainnet **or Testnet**". The CRE bounty says "Build, **simulate**, or
  deploy". **Mainnet is not required.**
- **Colosseum:** no chain requirement. Judged as a startup: founder-market fit, insight, execution, market,
  communication, viability, traction.

## From the Discord (organisers' answers, 16–30 Sep)

- **One main track, unlimited bounties.** Confirmed by the admins (`_paperbag`, `mikeweb`). We enter Social,
  Attention & Culture + CRE + Envio + both Mera bounties.
- **A monorepo is preferred** (the form takes one repo link). ✅ Ours is one.
- **Post progress on the Metropolis portal first.** "The platform should be your priority, use it as much as
  possible." Mentors are reached through the portal's mentorship feature, and they reply slowly because of timezones.
- **Envio mentor is Denham,** via the portal. Heads-up from another team: Envio's Development plan has soft limits, and
  a deployment could be gone before judging. Confirm ours stays up.
- **Judging runs Oct 14–27.** The live app, relayer gas, keeper and indexer must stay up until **Oct 27+**.
- **Submissions are private until Oct 13,** then shown on the portal.
- **Testing instructions** belong in the submission and README; a PWA is accepted where mobile is asked for.
- **Tenderly** (Console, Simulations, Monitoring, Node) is free for qualified teams until Nov 3, via the portal's
  Notion page. Optional.
- **Colosseum:** a finalist asked whether the rules' interview applies to all finalists; it's unanswered. Assume a
  15-minute interview if shortlisted, and be ready to present.

## Status against every requirement

| Requirement | Where | Status |
|---|---|---|
| Built during Sep 1 – Oct 13 | Monad | ✅ Repo history starts 25 Sep 2026 |
| Public GitHub repo, readable by `metropolis@hackathon.monad.xyz` | Monad | ⬜ **You:** make public or add access |
| Repo link (private allowed with access for `hackathon@colosseum.com`) | Colosseum | ⬜ **You** |
| Live product link on Monad testnet + judge access instructions | Monad | 🟡 App works on testnet; **needs hosting** (Vercel, your account) |
| Technical demo video ≤ 3 min, live product, not slides | Both | ⬜ Script below |
| Pitch video ≤ 2 min (Monad) / 2–3 min presentation (Colosseum) | Both | ⬜ Outline below |
| Logo / graphic (JPG/PNG/WEBP ≤ 3 MB) | Both | ⬜ Export from `apps/web/components/logo.tsx` |
| Go-to-market, demand validation, team background | Colosseum | ⬜ Draft below; add your background |
| Weekly one-minute update videos (recommended) | Colosseum | ⬜ **You:** post this week's |
| Traction: "any real community engagement, even a small test group" | Monad (20%) | ⬜ **Most important gap.** Plan below |
| Progress updates on the Metropolis portal | Monad (organisers' ask) | ⬜ **You:** post one now, then every few days |
| Stay live through judging (Oct 14–27) | Monad | ⬜ Hosting + relayer MON + keeper + indexer |

## Positioning

**One line:** Creator coins pay you when someone buys after you. Tipoff pays you when the creator actually gets
paid, and the patron can't dodge it.

**Problem.** Fans and curators discover creators long before patrons do: collectors, DAOs, labels, grant rounds. That
discovery is worth money, but it's never paid:

- Tip apps (Noice, Tipn, Degen on Farcaster) move cents from fans to creators. Being early earns the fan nothing.
- Creator coins and attention markets reward early fans only when later fans buy. Most fans end up as someone's
  exit.
- Scout and referral programs depend on the patron honestly admitting "we acted on your tip". The patron can read a
  tip, wait, and pay the creator directly.

**Insight.** Make the finder's fee enforceable and non-speculative:

1. **Can't be dodged.** The patron's bounty is locked through a 90-day tail. A Chainlink CRE workflow watches the
   patron's declared treasury, so paying the creator directly *is* the evidence, declared or not.
2. **Paid by a real event.** Fans earn when the patron pays the creator. No later buyer loses.
3. **No-loss conviction.** Fans can back a tip with a stake. It buys a bigger share on a sealed bonding curve and is
   always refunded. Not a bet.
4. **Sealed and first.** Tips are encrypted to the patron, so nobody can copy a call. The on-chain timestamp proves
   who was first. Losing tips are never revealed.
5. **Public, verifiable bragging rights.** A winning tip becomes a "called it" receipt with a share card, and the
   scout's hit rate can't be padded.

**Why it's social (track fit).** Track question: "does participation or attention translate into real, verifiable
economic stake for the people generating it?" Tipoff pays the people who generate discovery, verifiably on-chain. The
social loop is:

1. Tip off a creator.
2. Get paid when they make it.
3. Share the receipt.
4. Build a public track record.
5. Patrons weigh your tips by that record.

This is the track's own suggested idea #04 ("early-supporter registries that cryptographically prove and financially
reward fans who were there before the audience arrived"), made enforceable.

**vs Paradigm's opportunity markets** (Aug 2025; a Paradigm GP judges this hackathon). Their proposal: sponsor-private
markets where scouts bet on outcomes. We credit the idea and change three things:

- Enforcement: the tail plus CRE evidence.
- No-loss stakes, instead of bets.
- A public reputation and receipt layer, instead of anonymous market positions.

**Why Monad.** The core loop needs these properties:

- Sub-second finality: a tip's queue position is fixed the instant it's sealed.
- Cheap enough that every tip is on-chain and relayed.
- Gasless via relayer, plus passkeys through Mera.

## Judge access (paste into the submission form)

1. Open **<live URL>** on a phone or laptop and tap **Sign in**. A passkey (Face ID or Touch ID) creates your account.
   There's no seed phrase, extension or gas.
2. Open the account menu and tap **Get 1,000 test dollars**. That's the TestUSDC faucet, relayed, so still no gas.
3. **As a fan:** open *Glasshouse DAO — Artists we'll commission*. Tip-off any wallet, optionally backed by a stake.
4. **As a patron:** tap **For patrons** and open a program. From your dashboard, read the sealed tips on the
   conviction board (ranked by weight and each scout's track record). Tap **We backed them** to pay a hit.
5. See **Called it** for public receipts, and **Scouts** for the leaderboard.

- Contracts, verified on MonadVision / Sourcify:
  - Tipoff: `0x50fd4cA4a9B3BB60D772FAd5ecdf4736a5F85707`
  - TestUSDC: `0xB98D8cd9D58249E2fC61e157EB5102745EF59F59`
- Demo patrons (Low Tide Records, Glasshouse DAO) are run by the team with test dollars. Each program's brief says so.

## Demo video (≤ 3 min, live product only)

1. **0:00–0:20.** Hook on the landing page: "Creator coins pay you when someone buys after you. Tipoff pays you when
   the creator gets paid."
2. **0:20–1:00.** A fan signs in with a passkey (no seed phrase), gets test dollars, opens Glasshouse DAO, and seals
   a tip on a creator with a small stake. Show "only the patron can read it" and the queue number.
3. **1:00–1:40.** The patron dashboard. Show the conviction board:
   - the price rises with independent conviction;
   - each tip carries its scout's track record ("1/2 calls · 50%"), which is how patrons cut through noise.
4. **1:40–2:25.** The backdoor. Low Tide paid Tomás straight from its treasury and never declared it. Show:
   - the treasury transfer on MonadVision;
   - `cre workflow simulate --broadcast` recording the hit;
   - Tomás's fan claiming it;
   - the "Resolved by evidence" badge.
5. **2:25–2:50.** Calls: the "called it" receipt with its verified creator wallet, and the share card on
   Farcaster/X. Then the Scouts leaderboard.
6. **2:50–3:00.** Close: "Every tip on-chain. Losing tips never revealed. Stakes always refunded. The fee can't be
   dodged."

## Pitch video (≤ 2 min)

1. **Who.** The team and why you care. **You:** name the specific creator scene you're part of.
2. **Problem.** In 20 seconds: early fans create a creator's discovery, patrons capture it.
3. **What exists and why it fails.** Tip apps, creator coins, scout programs: one line each.
4. **Tipoff.** Enforceable finder's fees; paid by real events; no-loss; public receipts.
5. **Traction.** Numbers from the test group (see below).
6. **Path.** Launch with 3–5 onchain-art and music patrons on Monad. Take 0.5% of paid hits. Distribute through a
   Farcaster mini app and receipts people share.

## Traction plan (do this week; it's 20% of the Social score)

- [ ] Recruit **3 real patrons**: a Monad collector group, an artist collective, a small label or grants round. Offer to
      run their program on testnet for free. Even one real patron beats any demo.
- [ ] Recruit **15–30 testers** from the Monad Discord and Farcaster: "tip-off a creator you think will blow up."
- [ ] Log real usage: sign-ups, tips sealed, programs, receipts shared. Screenshot the public Scouts page.
- [ ] Collect 3–5 quotes from testers and patrons for the pitch.

## Bounty write-ups

**Best workflow with CRE ($3k).**
- `workflows/resolver` is a TypeScript CRE workflow.
- Trigger: a USDC/TestUSDC `Transfer` log from a declared treasury.
- It fetches each live program's evidence spec over HTTP and checks it against the `evidenceHash` stored on-chain.
- It runs the same pure matcher the tests use, then `writeReport`s the hit to `Tipoff.onReport` through the forwarder.
- The contract enforces the forwarder address plus the workflow ID and owner.
- Proof on testnet: `cre workflow simulate --broadcast` recorded source-2 (evidence) hits on the seeded payment.
- This is the orchestration layer that makes the finder's fee enforceable. Without it, a patron could dodge.

**Best Use of Envio ($1k).**
- `indexer/` is a HyperIndex v3 indexer. It builds programs, tips, hits, payouts, stakes, scouts and patrons from
  events alone.
- The web app reads it over GraphQL when `ENVIO_GRAPHQL_URL` is set.
- It powers the core pages: the Scouts leaderboard, the calls feed and public records.
- **Needs:** an Envio Cloud deploy, with an API token for HyperRPC log reads. Ask in Discord.

**Mera: One Passkey, Many Keys ($2.5k).**
- One passkey's PRF output is HKDF'd into **two** keys: a secp256k1 account key, and an **X25519 sealing key**.
- Every tip is end-to-end encrypted to the patron's sealing key.
- The scout can also re-open their own tips on any device.
- That's a non-wallet use: private, sealed messaging between users, bound to the passkey.

**Best Mera-Powered UX ($2.5k).**
- Mera is the only account layer: no seed phrase, no extension, no email.
- A stateless gas relayer submits signed intents and never holds user funds.
- Worth confirming in Discord that a relayer doesn't count as a "custody backend".

## Disclosures

- The team runs the demo patrons, with test dollars. This is stated in each program's brief.
- Built on Monad testnet; no mainnet deployment (allowed by the rules).
- Uses open-source libraries (OpenZeppelin, viem, noble, Chainlink CRE SDK, Envio). No pre-existing product code.
- Credits Paradigm's opportunity-markets proposal as prior art.
