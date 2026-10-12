# Demo video: script and checklist

Monad requires a **technical demo ≤ 3 minutes that shows the live product** (no slides, no code walkthrough), plus a
separate **pitch ≤ 2 minutes**. Colosseum wants a 2–3 minute presentation plus a product demo of ≤ 3 minutes. The demo
below works for both. Live app: https://tip-off.vercel.app

## Before you record (15 minutes)

- [ ] **Turn off "Reduce motion"** (macOS System Settings → Accessibility → Display). Otherwise the floating UI, tilt
      and smooth scroll are switched off.
- [ ] Use a clean Chrome profile at 1440×900 or 1920×1080, zoom 100%, bookmarks bar hidden, notifications off.
- [ ] Use two browser profiles: **Fan** and **Patron**. Create a passkey account in each. In each, tap **Get 1,000 test
      dollars** in the welcome card.
- [ ] As Patron, open a program from **For patrons** (title "Artists we'll sign", tipping 1 day). This program gives you
      the patron's private dashboard to show.
- [ ] As Fan, tip off a creator **by @handle** on that program, so their face appears on the patron board. Use a real
      Farcaster creator who has a verified wallet.
- [ ] As Fan, also tip off the **same creator** on **Low Tide Records: Season two signings**. Low Tide's treasury is
      the address Chainlink CRE watches, so that's where the quiet payment gets caught.
- [ ] Wait 60 seconds (a tip has to predate the patron's action by at least a minute).
- [ ] **Do one full win before recording, so a face is on the public results.** As Patron, tap **We backed them** on
      that creator. As Fan, open **My tips** → **Claim**. Claiming also makes the call public (or tap **Make public**).
      Now the program's **Results** section, `/calls` and the receipt show the creator's Farcaster photo and name.
      Seeded demo creators are test wallets with no Farcaster account, so they show as `0x…`. Only a real handle gets
      a face.
- [ ] For the quiet-payment scene, have a terminal ready in `tipoff/`. You'll run `node scripts/quiet-payment.ts --to
      <the creator wallet the Fan tipped on Low Tide>`, then the printed `cre workflow simulate …` command.
- [ ] Have these open in tabs: MonadVision (Tipoff contract), the program page scrolled to **Results**, that call's
      receipt, `/scouts`.

## The 3-minute demo (live product)

| Time | On screen | Say (roughly) |
|---|---|---|
| 0:00–0:15 | Landing page; move the cursor so the hero floats | "Fans spot creators first. When a label or collector later backs them, fans get nothing. Tipoff pays the fans who called it, and the patron can't dodge it." |
| 0:15–0:45 | Fan profile: **Sign in** (passkey, Face ID) → welcome card → **Get 1,000** | "Passkey sign-in with Mera. No seed phrase, no extension, no gas. One passkey derives the wallet *and* the key that seals tips." |
| 0:45–1:20 | Open a program → type **@handle** → the creator's face and verified wallet appear → add a stake → **Seal & send** → stamped tip number | "I name the creator by their Farcaster handle. Tipoff finds their verified wallet. The tip is encrypted to the patron in my browser; nobody else can read it. Its place in line is fixed on Monad. The stake buys a bigger share and is always refunded, so it's conviction, not a bet." |
| 1:20–1:50 | Patron profile → dashboard → conviction board (creator's face, conviction, scout track record) → **Bring your community** | "Only the patron can read tips. They're ranked by conviction: how many independent fans, how much stake, and each fan's public track record. That's how a patron cuts through spam." |
| 1:50–2:30 | Terminal: `quiet-payment.ts` → MonadVision tx → `cre workflow simulate --broadcast` → refresh the program: hit **resolved by evidence** | "Here's the part nobody else does. The patron pays the creator directly and never presses anything in Tipoff. Chainlink CRE watches the patron's declared treasury, sees the payment, and records the hit on-chain anyway. The bounty was locked for 90 days, so the fee can't be dodged." |
| 2:30–2:50 | Program page → scroll to **Results** (the creator's face, who called it, the payout) → the receipt → **Share on Farcaster** (the card preview) → `/scouts` | "Every win becomes a verifiable 'Called it' receipt, shareable as a Farcaster card. Scouts build a public hit rate that can't be padded, because every tip is on-chain even when it stays sealed." |
| 2:50–3:00 | Landing comparison ("Not a tip jar. Not a creator coin.") | "Creator coins pay you when someone buys after you. Tipoff pays you when the creator actually gets paid. Live on Monad testnet." |

**If time is tight,** cut the stake explanation and the leaderboard, but never the quiet-payment scene: it's the core
claim, and it's what the CRE bounty judges want to see ("a simulated run with on-chain execution").

## The 2-minute pitch (you on camera, a few slides allowed)

1. **You (15 s):** who you are, and your link to music and creator communities. This is 25% of the Social score, so be
   specific.
2. **The problem (25 s):** fans and curators discover creators first, then patrons capture the value. Scout deals rely
   on the patron admitting "we acted on your tip".
3. **What exists, and why it fails (20 s):**
   - Tip apps (Noice) move cents to creators.
   - Creator coins make fans the exit liquidity.
   - JPEG App (Base Batches) bet on photos and shut down.
4. **Tipoff (30 s):** enforceable finder's fees (a 90-day lock plus Chainlink CRE evidence), paid by a real event,
   no-loss stakes, sealed tips, public receipts.
5. **Traction (15 s):** real patrons and testers (numbers from `/scouts` and `/programs`), plus quotes.
6. **Business and next steps (15 s):**
   - A 0.5% fee on paid hits.
   - Start with small labels and music collectives.
   - Grow through receipts people share, and a Farcaster mini app.

## Recording tips

- Record the screen and voice separately if that's easier, then line them up; pauses get cut.
- Keep the cursor slow and deliberate. Hover the hero and one program card so the motion shows.
- Upload unlisted to YouTube or Loom, and check it plays logged-out.
- Put the live link and test steps in the video description and the submission form.
