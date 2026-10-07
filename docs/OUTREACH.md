# Outreach: ready to paste

Replace `https://tipoff-phi.vercel.app` with the Vercel URL before sending anything that has it. Nothing here claims users we don't have.
Update the numbers as real usage arrives.

---

## 1. Metropolis portal: progress update #1 (post today)

> **Tipoff: early-supporter rewards that can't be dodged** (Social, Attention & Culture)
>
> Fans tip off patrons (collectors, DAOs, labels) about creators they spotted first. When the patron pays that
> creator, even without announcing it, the fans who called it earliest get a finder's fee.
>
> **Shipped so far (live on Monad testnet):**
> - Tipoff contract (verified): bounties locked through a 90-day tail; sealed tips; a sealed bonding curve with stakes
>   that are always refunded; top-3 payout. 68 Foundry tests including fuzz and invariants, plus a Slither + Krait
>   security pass (the 5 issues it found are fixed, with regression tests).
> - **Chainlink CRE** workflow: watches a patron's declared treasury. A direct payment to a tipped creator becomes an
>   on-chain hit, even if the patron never declares it. Simulated with `--broadcast` on testnet.
> - **Envio HyperIndex**, live on Envio Cloud: powers the leaderboard, the "Called it" feed and public records.
> - **Mera** passkeys as the only account layer. One passkey derives the account key *and* an X25519 key that
>   end-to-end encrypts every tip to the patron.
> - Gasless for users (signed intents + a relayer), plus a one-tap test-dollar faucet for judges.
> - Social layer: shareable, verifiable "Called it" receipts; a scouts leaderboard with hit rates that can't be
>   padded; each scout's track record shown to patrons to cut through spam tips.
>
> **Next:** a Farcaster mini app (tip-off a creator by @handle from the feed), handle-based creator lookup, and
> onboarding our first real patrons and testers.
>
> Live: https://tipoff-phi.vercel.app · Repo: https://github.com/roshan-zirconlabs/tipoff

---

## 2. Metropolis portal: mentorship requests

**Envio (Denham)**
> Hi Denham! Tipoff (Social track) is live on Envio Cloud (HyperIndex v3, Monad testnet, low volume: under 1k
> events/day). It powers our leaderboard, the "Called it" feed and public records. It's on the Development plan,
> deployed Oct 1. Can you confirm it will stay up through judging (Oct 14–27)? And is there anything you'd like to see
> in how we use HyperIndex for the bounty?

**Mera (Monad Foundation)**
> Hi! Tipoff derives two keys from one Mera passkey's PRF: the account key, and an X25519 key that end-to-end encrypts
> every tip to its recipient, so only the patron can read it, and the scout can re-open it on any device. Does that
> fit "One Passkey, Many Keys" as a non-wallet use? And for "Mera-Powered UX": we use a stateless gas relayer that
> only submits signed intents and never holds funds. Is that acceptable, or does it count as a custody backend?

**Chainlink CRE**
> Hi! Our CRE workflow (TypeScript SDK) triggers on token transfers from a patron's declared treasury. It verifies the
> program's evidence spec against a hash stored on-chain, and reports a hit to our contract through the forwarder; the
> contract checks the forwarder, workflow ID and owner. It runs with `cre workflow simulate --broadcast` on Monad
> testnet, and the hits land on-chain. Is a simulated run with on-chain tx hashes enough for the bounty, or should we
> pursue deploy access?

**Social, Attention & Culture track mentor**
> Hi! Tipoff pays fans who spot creators early when a patron (collector, DAO, label) actually pays that creator, and
> CRE makes it enforceable even if the patron pays quietly. We'd love blunt feedback on two things. (1) Track fit: we
> position against creator coins ("you earn when someone buys after you") and tip apps. Does that land? (2) Traction:
> for "Traction & Path Forward", would a handful of real patron programs on testnet plus a tester group count, and
> what would impress you most?

---

## 3. Discord: #metropolis-general (once `https://tipoff-phi.vercel.app` exists)

> gm! Building **Tipoff** for Social, Attention & Culture.
>
> Fans send sealed tip-offs about creators to patrons (collectors, DAOs, labels). When the patron pays that creator,
> even without saying so, the fans who called it first get a finder's fee. Chainlink CRE turns the patron's own payment
> into the proof, tips are sealed with Mera passkey keys, and stakes are always refunded.
>
> Live on testnet: https://tipoff-phi.vercel.app. Passkey sign-in, a faucet in the menu, no gas.
>
> Looking for:
> - ~20 people to tip off a creator they think is about to blow up
> - 2–3 collectives, DAOs or artist communities who'd run a program (I'll set it up with you)
>
> Blunt feedback very welcome 🙏

---

## 4. Discord DM: EmpowerTours (music on Monad, Farcaster mini app)

They're a Metropolis team: artists mint music and get paid straight to their wallets on Monad. Their artists are exactly
the creators fans would tip, and their payments are exactly the evidence our CRE workflow reads.

> Hey! Saw EmpowerTours: music on Monad with artists paid straight to their wallets. Love it. I'm building Tipoff
> (Metropolis, Social track): fans tip off patrons about artists early, and get a finder's fee when the patron pays
> that artist. It's enforceable via Chainlink CRE, even if the payment is never announced.
>
> Idea: we run an "EmpowerTours discovery" program. Your community tips the artists they think will break, and when
> an artist you feature or pay hits a milestone, the fans who called it earliest get paid. Your listeners get a
> reason to discover and promote artists early. You get a ranked, crowd-sourced A&R signal. We'd both have a real
> integration to show judges. Open to a quick call?

---

## 5. Colosseum: weekly update video (≈60 s script)

> This week we turned Tipoff from a scouting tool into a creator product. Fans tip off patrons (collectors, DAOs,
> labels) about creators early, and get a finder's fee when the patron pays that creator, even quietly, because a
> Chainlink workflow treats the patron's own payment as proof.
>
> Shipped: a security pass with five fixes; a no-loss conviction curve (stakes are always refunded); public "called
> it" receipts; a leaderboard; scout reputation for patrons; and live indexing on Envio.
>
> Hardest problem: patrons dodging the fee by acting quietly. The 90-day lock plus evidence solves most of it. The
> residual, self-dealing through fresh wallets, we surface publicly instead of pretending it's solved.
>
> Next week: a Farcaster mini app, and our first real patrons.

---

## 6. Farcaster / X post (once `https://tipoff-phi.vercel.app` exists, no incentives attached)

> Creator coins pay you when someone buys after you.
> Tipoff pays you when the creator actually gets paid.
>
> Tip off a patron about an artist early → they pay the artist → you get a finder's fee. Enforced on @monad, even if
> they pay quietly.
>
> Live on testnet: https://tipoff-phi.vercel.app
