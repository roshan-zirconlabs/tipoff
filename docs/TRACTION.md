# Traction plan and what we learned from JPEG App (7 Oct 2026)

Traction is 20% of the Social, Attention & Culture score ("any real community engagement, even a small test group"),
and Founder & Market Readiness is another 25%. Monad submissions close **Oct 14, 09:29 IST**. Everything below is
doable by then.

## Lessons from JPEG App (Base Batches 003, sunset)

**What it was** ([Ethereum's post](https://x.com/ethereum/status/1974164370864361787),
[sunset post](https://x.com/jpegapp/status/2068933705872330985),
[cohort writeup](https://www.dtso.org/startups/base-batches-003)):
- A social prediction game on Base: daily themed photo games where people bet on photos, and "the highest bet on a
  photo wins the pool". The cohort writeup called it "opinion markets on photo content".
- It reached hundreds of beta users, then sunset with "exploring new form factors".

**Where we overlap:** culture plus money plus being early, on an L2-speed chain, scored socially.

**Where we differ:**

| | JPEG App | Tipoff |
|---|---|---|
| Who pays winners | other players (a pool of bets) | a patron, out of a real payment to a creator |
| Can you lose money? | yes (bets) | no (stakes are refunded) |
| What decides a win | the highest bet (pay to win) | being first, plus conviction, on a curve that rewards timing over money |
| Cadence | daily themed games (a habit loop) | programs that run for weeks |
| Content | photos, visual and instant | creators, which we now show with Farcaster photos and names |
| Cold start | one-sided: anyone can post and bet | two-sided: needs patrons, *then* fans |

**Our inferences about why it sunset** (not stated by the team):
- betting games need constant liquidity and novelty;
- pay-to-win pools push out casual players;
- they carry regulatory weight.

**What we take from it:**
1. **A faster loop.** JPEG's daily cadence was its strength; our weeks-long programs are slow. Pitch "seasons" and
   short programs (1–7 days, with a 7-day claim window), and show judges a program that resolves inside the judging
   window.
2. **Visual first.** We now show creators as people (Farcaster photo, name, verified wallet), not `0x…`.
3. **Two-sided cold start is our biggest risk.** Solve the patron side by hand first (below). JPEG never had a patron
   side, and we do.
4. **Stay out of gambling dynamics.** No-loss stakes and timing-first payouts are a real difference. Say it in the
   pitch.

## Real patrons: the outreach list

Each patron opens a program from an invite link (`node scripts/patron-invite.ts …`), signs in with their own passkey,
and taps "Get test dollars". It takes about two minutes, and tips are sealed to *their* key.

| # | Who | Why them | How to reach | Status |
|---|---|---|---|---|
| 1 | **EmpowerTours** (Metropolis team) | Music on Monad mainnet as a Farcaster mini app; artists are paid "direct to their wallet"; booking escrow, press kits | Discord `empowertours` (active in #metropolis-general); X [@EmpowerTours](https://x.com/EmpowerTours); [empowertours.xyz](https://empowertours.xyz) | DM drafted (OUTREACH.md §4) |
| 2–5 | Small labels / collectives **you know** | Evan: "music collectives and smaller labels already scout talent" | Your network; DM with an invite link | ⬜ |
| 6+ | Farcaster music curators (`/music` and similar channels) | They already post "who's next"; a program gives that a payoff | Cast with the program link (it renders as a card) | ⬜ |

**Invite link for EmpowerTours:**

```bash
node scripts/patron-invite.ts --site https://tipoff-phi.vercel.app \
  --name "EmpowerTours" --title "Artists we'll feature next" \
  --brief "Tip us off about artists on the rise. If we feature or book someone you called first, you get a finder's fee." \
  --looking "Independent artists with a real local crowd and music worth a license" --bounty 750 --reward 250 --days 7
```

## Real fans (target: 20–30 scouts with real tips before Oct 13)

- [ ] Post the tester call in `#metropolis-general` (OUTREACH.md §3) and share it in Farcaster music channels.
- [ ] Ask every tester to tip off **by @handle**, so creators show up as people.
- [ ] Ask 3–5 testers for one sentence of feedback each, for the pitch video.

## What to show judges (by Oct 13)

- The numbers: unique scouts, tips sealed, programs, patrons that aren't us. They're public on `/scouts` and
  `/programs`. Take screenshots on Oct 12.
- One real patron's program, ideally with a declared hit inside the window.
- Quotes from 3–5 testers or patrons.
- Be honest about the split: say which programs are ours (demo) and which are real.
