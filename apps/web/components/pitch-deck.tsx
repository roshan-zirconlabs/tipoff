"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Bolt, Check, Clock, Close, Eye, Fingerprint, Lock, Plus, Receipt } from "./icons";
import { Logo } from "./logo";
import { ButtonLink } from "./ui";

/* ─── Small presentational helpers, on-brand ──────────────────────────────────────────────────────────────────── */

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

function Kicker({ children }: { children: ReactNode }) {
  return <span className="inline-block text-signal">{children}</span>;
}

/** A node in a flow diagram: a mono label over a title, in a soft card. */
function FlowNode({
  step,
  title,
  sub,
  tone = "default",
  icon,
}: {
  step?: string;
  title: string;
  sub?: string;
  tone?: "default" | "signal" | "ink";
  icon?: ReactNode;
}) {
  const tones = {
    default: "border-rule bg-card",
    signal: "border-signal/40 bg-signal-wash",
    ink: "border-transparent bg-ink text-paper",
  };
  return (
    <div className={`flex min-w-0 flex-col gap-2 rounded-2xl border p-5 text-left sm:p-6 ${tones[tone]}`}>
      {step ? <span className="eyebrow">{step}</span> : null}
      <div className="flex items-center gap-2.5">
        {icon ? <span className={tone === "signal" ? "text-signal-ink" : undefined}>{icon}</span> : null}
        <p className="text-lg font-semibold leading-tight tracking-[-0.02em] sm:text-xl">{title}</p>
      </div>
      {sub ? (
        <p className={`text-sm leading-relaxed ${tone === "ink" ? "text-paper/70" : "text-ink-2"}`}>{sub}</p>
      ) : null}
    </div>
  );
}

function Connector() {
  return (
    <div className="flex items-center justify-center text-ink-3" aria-hidden="true">
      <ArrowRight className="hidden shrink-0 md:block" />
      <span className="h-6 w-px bg-rule-strong md:hidden" />
    </div>
  );
}

/* ─── Charts (on-brand inline SVG; single-hue magnitude, so no categorical palette) ───────────────────────────── */

/**
 * Conviction curve: stake buys weight on a curve with diminishing returns, so money can't buy the top spot. Shape is
 * illustrative; the point is the concavity. Two dots show 10× the stake buying only ~3× the weight.
 */
function ConvictionCurve() {
  const W = 480;
  const H = 240;
  const L = 16;
  const R = 16;
  const T = 18;
  const B = 34;
  const pw = W - L - R;
  const ph = H - T - B;
  const base = T + ph;
  const f = (t: number) => t ** 0.45; // concave-increasing: fast then flat
  const pts = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40;
    return [L + t * pw, base - f(t) * ph] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${L + pw} ${base} L${L} ${base} Z`;
  const dot = (t: number) => [L + t * pw, base - f(t) * ph] as const;
  const [ax, ay] = dot(0.1);
  const [bx, by] = dot(0.95);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Weight rises with stake on a curve that flattens: ten times the stake buys roughly three times the weight."
    >
      <title>Conviction curve with diminishing returns</title>
      {/* baseline + axis labels */}
      <line x1={L} y1={base} x2={L + pw} y2={base} stroke="var(--rule-strong)" strokeWidth="1" />
      <path d={area} fill="color-mix(in oklab, var(--signal) 14%, transparent)" />
      <path d={line} fill="none" stroke="var(--signal)" strokeWidth="2.5" strokeLinecap="round" />
      {/* 10x stake guide */}
      <line x1={ax} y1={base} x2={ax} y2={ay} stroke="var(--rule-strong)" strokeWidth="1" strokeDasharray="3 3" />
      <line x1={bx} y1={base} x2={bx} y2={by} stroke="var(--rule-strong)" strokeWidth="1" strokeDasharray="3 3" />
      <circle cx={ax} cy={ay} r="5" fill="var(--signal)" stroke="var(--card)" strokeWidth="2" />
      <circle cx={bx} cy={by} r="5" fill="var(--signal)" stroke="var(--card)" strokeWidth="2" />
      <text x={ax + 8} y={ay - 6} className="numeric" fontSize="12" fill="var(--ink-2)">
        small stake
      </text>
      <text x={bx} y={by - 10} textAnchor="end" className="numeric" fontSize="12" fill="var(--ink)">
        10× stake · ~3× weight
      </text>
      <text x={L} y={H - 10} className="numeric" fontSize="11" fill="var(--ink-3)">
        stake behind a tip →
      </text>
      <text x={L} y={T + 4} className="numeric" fontSize="11" fill="var(--ink-3)">
        ↑ conviction weight
      </text>
    </svg>
  );
}

/** Horizontal magnitude bars for the discovery budgets Tipoff is adjacent to. Single hue; values labelled directly. */
function MarketBars() {
  const data = [
    { label: "Influencer marketing", v: 22 },
    { label: "Affiliate & referral", v: 18 },
    { label: "Record-label A&R", v: 4 },
  ];
  const max = 24;
  const barH = 30;
  const gap = 20;
  const labelW = 148;
  const trackX = labelW + 12;
  const W = 520;
  const trackW = W - trackX - 56;
  const H = data.length * (barH + gap);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Annual spend to find talent and customers: influencer marketing about 22 billion dollars, affiliate and referral about 18 billion, record-label A&R about 4 billion."
    >
      <title>Discovery budgets already paid every year</title>
      {data.map((d, i) => {
        const y = i * (barH + gap) + 4;
        const w = Math.max(4, (d.v / max) * trackW);
        return (
          <g key={d.label}>
            <text x={labelW} y={y + barH / 2 + 4} textAnchor="end" fontSize="13" fill="var(--ink-2)">
              {d.label}
            </text>
            <rect
              x={trackX}
              y={y}
              width={trackW}
              height={barH}
              rx="6"
              fill="color-mix(in oklab, var(--ink) 7%, transparent)"
            />
            <rect x={trackX} y={y} width={w} height={barH} rx="6" fill="var(--signal)" />
            <text
              x={trackX + w + 10}
              y={y + barH / 2 + 5}
              className="numeric"
              fontSize="15"
              fontWeight="700"
              fill="var(--ink)"
            >
              ${d.v}B
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── The slides ──────────────────────────────────────────────────────────────────────────────────────────────── */

function Slide({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-5xl ${className}`}>
      <div className="rise [--rise-delay:0.05s]">{children}</div>
    </div>
  );
}

const SLIDES: { id: string; render: () => ReactNode }[] = [
  {
    id: "cover",
    render: () => (
      <Slide className="text-center">
        <Eyebrow>The pitch · Tipoff on Monad</Eyebrow>
        <h1 className="display mt-6 text-[clamp(3rem,10vw,7rem)]">
          Call it first.
          <br />
          <span className="text-ink-2">Get paid when </span>
          <Kicker>they make it.</Kicker>
        </h1>
        <p className="mx-auto mt-8 max-w-xl text-lg leading-relaxed text-ink-2">
          Enforceable finder's fees for the fans who spot creators before the money does.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2 text-sm text-ink-3">
          <span className="numeric rounded-full border border-rule px-3 py-1">Social, Attention & Culture</span>
          <span className="numeric rounded-full border border-rule px-3 py-1">Live on Monad testnet</span>
        </div>
      </Slide>
    ),
  },
  {
    id: "problem",
    render: () => (
      <Slide>
        <Eyebrow>The problem</Eyebrow>
        <h2 className="display mt-4 max-w-3xl text-[clamp(2.2rem,5.5vw,4rem)]">
          Fans find them first. The money shows up last.
        </h2>
        <div className="mt-12 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <FlowNode step="Day 0" title="You spot them" sub="A fan or curator backs a creator nobody's watching yet." />
          <Connector />
          <FlowNode step="Later" title="They blow up" sub="An audience arrives. The pick was right." />
          <Connector />
          <FlowNode
            step="Payday"
            title="A label signs them"
            sub="A collector, DAO or label pays the creator real money."
            tone="ink"
          />
        </div>
        <div className="mt-8 flex items-center gap-4 rounded-2xl border border-signal/30 bg-signal-wash px-6 py-5">
          <p className="display text-[clamp(2rem,6vw,3.2rem)] text-signal-ink line-through decoration-2">$0</p>
          <p className="text-lg leading-snug text-ink-2">
            goes to the fan who called it first. Discovery creates the value and captures none of it.
          </p>
        </div>
      </Slide>
    ),
  },
  {
    id: "payable",
    render: () => (
      <Slide className="text-center">
        <Eyebrow>Why it's never been fixed</Eyebrow>
        <p className="display mt-8 text-[clamp(2.2rem,6vw,4.4rem)] leading-[1.05]">
          Being early was always <span className="text-ink-2">provable.</span>
          <br />
          It was never <Kicker>payable.</Kicker>
        </p>
        <p className="mx-auto mt-10 max-w-xl text-lg leading-relaxed text-ink-2">
          You can screenshot that you were there first. You just can't bill anyone for it — until the fee is enforceable
          and paid by a real event.
        </p>
      </Slide>
    ),
  },
  {
    id: "existing",
    render: () => (
      <Slide>
        <Eyebrow>What exists today</Eyebrow>
        <h2 className="display mt-4 max-w-3xl text-[clamp(2.2rem,5.5vw,4rem)]">
          Everything so far pays the wrong person.
        </h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-rule bg-rule md:grid-cols-3">
          {[
            {
              name: "Tip apps",
              line: "Cents, one way.",
              body: "Fans pay creators. Being early earns the fan nothing.",
            },
            {
              name: "Creator coins",
              line: "Fans are the exit.",
              body: "You profit only when a later fan buys in after you.",
            },
            {
              name: "Scout programs",
              line: "Easy to dodge.",
              body: "The patron can read your tip, wait, and pay the creator quietly.",
            },
          ].map((c) => (
            <div key={c.name} className="bg-card p-7">
              <div className="flex items-center gap-2 text-ink-3">
                <span className="grid size-6 place-items-center rounded-full border border-rule-strong">
                  <Close size={13} />
                </span>
                <span className="eyebrow">{c.name}</span>
              </div>
              <p className="mt-5 text-2xl font-semibold leading-tight tracking-[-0.02em]">{c.line}</p>
              <p className="mt-3 leading-relaxed text-ink-2">{c.body}</p>
            </div>
          ))}
        </div>
      </Slide>
    ),
  },
  {
    id: "insight",
    render: () => (
      <Slide>
        <Eyebrow>The insight</Eyebrow>
        <h2 className="display mt-4 max-w-3xl text-[clamp(2.2rem,5.5vw,4rem)]">
          Make the finder's fee <Kicker>enforceable</Kicker> and non-speculative.
        </h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <FlowNode
            icon={<Lock size={20} />}
            title="Can't be dodged"
            sub="The bounty is locked for a 90-day tail. On-chain evidence catches the payment either way."
            tone="signal"
          />
          <FlowNode
            icon={<Receipt size={20} />}
            title="Paid by a real event"
            sub="Fans earn when the patron actually pays the creator. No later buyer loses."
          />
          <FlowNode
            icon={<Check size={20} />}
            title="No-loss conviction"
            sub="Back a tip with a stake for a bigger share. It's always refunded — never a bet."
          />
        </div>
      </Slide>
    ),
  },
  {
    id: "how",
    render: () => (
      <Slide>
        <Eyebrow>How it works</Eyebrow>
        <h2 className="display mt-4 max-w-3xl text-[clamp(2.2rem,5.5vw,4rem)]">Three moves.</h2>
        <ol className="mt-12 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <li>
            <FlowNode step="01" title="A patron locks a bounty" sub="USDC, locked for a set number of hits." />
          </li>
          <li className="contents">
            <Connector />
          </li>
          <li>
            <FlowNode
              step="02"
              title="Fans send sealed tips"
              sub="Name the creator you spotted. Encrypted to the patron, timestamped on Monad."
              tone="signal"
            />
          </li>
          <li className="contents">
            <Connector />
          </li>
          <li>
            <FlowNode
              step="03"
              title="They pay. You get paid"
              sub="The earliest callers split the finder's fee."
              tone="ink"
            />
          </li>
        </ol>
      </Slide>
    ),
  },
  {
    id: "backdoor",
    render: () => (
      <Slide>
        <Eyebrow>The part nobody else does</Eyebrow>
        <h2 className="display mt-4 max-w-3xl text-[clamp(2.2rem,5.5vw,4rem)]">
          The deal they tried to hide <Kicker>still pays.</Kicker>
        </h2>
        <div className="mt-12 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <FlowNode
            icon={<Eye size={20} />}
            step="Quietly"
            title="Patron pays the creator"
            sub="Straight from its treasury. Nobody presses a button in Tipoff."
          />
          <Connector />
          <FlowNode
            step="Automatically"
            title="Chainlink CRE sees it"
            sub="A workflow watches the declared treasury and matches the payment."
            tone="signal"
          />
          <Connector />
          <FlowNode
            step="On-chain"
            title="The hit is recorded"
            sub="The finder's fee is owed, declared or not."
            tone="ink"
          />
        </div>
        <p className="mt-8 text-center text-ink-3">
          No oracle trust fall, no honor system. The payment itself is the evidence.
        </p>
      </Slide>
    ),
  },
  {
    id: "built",
    render: () => (
      <Slide>
        <Eyebrow>How we built it</Eyebrow>
        <h2 className="display mt-4 max-w-3xl text-[clamp(2.2rem,5.5vw,4rem)]">
          Sealed, enforceable, gasless — by design.
        </h2>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: <Fingerprint size={18} />,
              step: "Mera",
              title: "One passkey, two keys",
              body: "Face ID derives the wallet and the key that seals every tip.",
            },
            {
              icon: <Lock size={18} />,
              step: "Noble",
              title: "Sealed to the patron",
              body: "Each tip is X25519-encrypted. Nobody else can read who you called.",
            },
            {
              icon: <Bolt size={18} />,
              step: "Monad",
              title: "First is provable",
              body: "The commitment and timestamp fix your place in line on-chain.",
            },
            {
              icon: <Eye size={18} />,
              step: "Chainlink CRE",
              title: "Evidence, not honor",
              body: "A workflow watches the treasury and records hits from real payments.",
            },
            {
              icon: <Receipt size={18} />,
              step: "Envio",
              title: "Reads in ~0.3s",
              body: "Every event is indexed, so the public pages load instantly.",
            },
            {
              icon: <Check size={18} />,
              step: "Relayer",
              title: "No gas, no custody",
              body: "Signed intents are submitted for you. The relayer never holds funds.",
            },
          ].map((n) => (
            <div key={n.step} className="flex flex-col gap-2 rounded-2xl border border-rule bg-card p-5">
              <div className="flex items-center gap-2 text-signal-ink">
                {n.icon}
                <span className="eyebrow">{n.step}</span>
              </div>
              <p className="font-semibold leading-tight tracking-[-0.02em]">{n.title}</p>
              <p className="text-sm leading-relaxed text-ink-2">{n.body}</p>
            </div>
          ))}
        </div>
      </Slide>
    ),
  },
  {
    id: "conviction",
    render: () => (
      <Slide>
        <Eyebrow>The model · not a prediction market</Eyebrow>
        <h2 className="display mt-4 max-w-3xl text-[clamp(2.2rem,5.5vw,4rem)]">
          Conviction, <Kicker>not a bet.</Kicker>
        </h2>
        <div className="mt-10 grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-2xl border border-rule bg-card p-6">
            <ConvictionCurve />
          </div>
          <ul className="space-y-5">
            {[
              [
                "Stake buys a bigger share",
                "On a sealed curve with diminishing returns — each extra dollar buys less.",
              ],
              ["So money can't buy the top", "The biggest wallet can't outbid being first. Timing wins, not budget."],
              ["Always refunded, win or lose", "Stakes come back every time. Nobody is anyone else's exit liquidity."],
            ].map(([t, b]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-signal-wash text-signal-ink">
                  <Check size={14} />
                </span>
                <span>
                  <span className="font-semibold">{t}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-ink-2">{b}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Slide>
    ),
  },
  {
    id: "compare",
    render: () => (
      <Slide>
        <Eyebrow>Why fans switch</Eyebrow>
        <h2 className="display mt-4 max-w-3xl text-[clamp(2.2rem,5.5vw,4rem)]">What we do that the rest can't.</h2>
        <div className="mt-10 overflow-hidden rounded-3xl border border-rule">
          <table className="w-full text-left text-sm sm:text-base">
            <thead>
              <tr className="border-b border-rule bg-paper-2">
                <th className="px-4 py-4 font-normal text-ink-3 sm:px-6" />
                <th className="px-4 py-4 font-normal text-ink-3 sm:px-6">Tip apps</th>
                <th className="px-4 py-4 font-normal text-ink-3 sm:px-6">Creator coins</th>
                <th className="relative px-4 py-4 sm:px-6">
                  <span className="display text-lg text-ink">Tipoff</span>
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-signal" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {[
                ["Who pays you", "nobody", "the next buyer", "the patron"],
                ["Can you lose money", "—", "yes", "never"],
                ["What wins", "—", "biggest wallet", "being first"],
                ["When you're paid", "never", "if they exit", "when they make it"],
              ].map(([k, a, b, c]) => (
                <tr key={k}>
                  <th className="px-4 py-4 text-left font-medium sm:px-6">{k}</th>
                  <td className="px-4 py-4 text-ink-3 sm:px-6">{a}</td>
                  <td className="px-4 py-4 text-ink-3 sm:px-6">{b}</td>
                  <td className="bg-signal-wash px-4 py-4 font-semibold text-signal-ink sm:px-6">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Slide>
    ),
  },
  {
    id: "patrons",
    render: () => (
      <Slide>
        <Eyebrow>Who it's for</Eyebrow>
        <h2 className="display mt-4 max-w-3xl text-[clamp(2.2rem,5.5vw,4rem)]">
          Anyone who pays to find talent first.
        </h2>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: <Receipt size={18} />, name: "Labels & A&R", line: "Sign the artist a fan flagged first." },
            {
              icon: <Bolt size={18} />,
              name: "Brands & agencies",
              line: "Lock in brand-fit creators before they're expensive.",
            },
            {
              icon: <Plus size={18} />,
              name: "VCs & grant rounds",
              line: "Back the builder a scout spotted pre-traction.",
            },
            { icon: <Eye size={18} />, name: "DAOs & collectives", line: "Commission the artist the community found." },
            { icon: <Lock size={18} />, name: "Collectors & funds", line: "Buy in before the floor moves." },
            { icon: <Clock size={18} />, name: "Sports & esports", line: "Scout talent before the bidding war." },
          ].map((p) => (
            <div key={p.name} className="flex flex-col gap-2 rounded-2xl border border-rule bg-card p-5">
              <div className="flex items-center gap-2 text-signal-ink">
                {p.icon}
                <span className="font-semibold tracking-[-0.01em] text-ink">{p.name}</span>
              </div>
              <p className="text-sm leading-relaxed text-ink-2">{p.line}</p>
            </div>
          ))}
        </div>
      </Slide>
    ),
  },
  {
    id: "opportunity",
    render: () => (
      <Slide>
        <Eyebrow>The opportunity</Eyebrow>
        <h2 className="display mt-4 max-w-3xl text-[clamp(2.2rem,5.5vw,4rem)]">
          Discovery is already a <Kicker>$40B+</Kicker> line item.
        </h2>
        <div className="mt-10 grid items-center gap-10 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="text-sm text-ink-3">
              Spent every year to find talent and customers — none of it rewards the fan who was first.
            </p>
            <div className="mt-5">
              <MarketBars />
            </div>
            <p className="mt-2 text-xs text-ink-3">Industry estimates, 2025. Creator economy overall ≈ $190B/yr.</p>
          </div>
          <div className="rounded-2xl border border-rule bg-card p-6">
            <p className="eyebrow">Protocol revenue</p>
            <p className="mt-2 text-lg font-semibold leading-snug">0.5% of every finder's fee paid.</p>
            <p className="text-sm text-ink-2">Capped at 1% in the contract. Illustrative:</p>
            <dl className="mt-5 space-y-3">
              {[
                ["$10M fees paid", "$50K"],
                ["$100M fees paid", "$500K"],
                ["$1B fees paid", "$5M"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 border-t border-rule pt-3">
                  <dt className="text-sm text-ink-2">{k}</dt>
                  <dd className="numeric text-xl font-semibold text-signal-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Slide>
    ),
  },
  {
    id: "monad",
    render: () => (
      <Slide>
        <Eyebrow>Why Monad</Eyebrow>
        <h2 className="display mt-4 max-w-3xl text-[clamp(2.2rem,5.5vw,4rem)]">Built for the moment it happens.</h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <FlowNode
            icon={<Bolt size={20} />}
            title="Sub-second finality"
            sub="A tip's place in the queue is fixed the instant it's sealed."
          />
          <FlowNode
            icon={<Clock size={20} />}
            title="Cheap enough for every tip"
            sub="So every call lives on-chain, even the ones that stay sealed forever."
          />
          <FlowNode
            icon={<Fingerprint size={20} />}
            title="Gasless, passkey sign-in"
            sub="Face ID creates the account. No seed phrase, no extension, no gas — via Mera."
          />
        </div>
      </Slide>
    ),
  },
  {
    id: "close",
    render: () => (
      <Slide className="text-center">
        <Eyebrow>The close</Eyebrow>
        <p className="display mt-8 text-[clamp(2.4rem,7vw,5rem)] leading-[1.02]">
          Being early has always been a flex.
          <br />
          Now it's a <Kicker>receipt.</Kicker>
        </p>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/programs" size="lg">
            Try the live app <ArrowRight />
          </ButtonLink>
          <ButtonLink href="/calls" size="lg" variant="outline">
            See who called it <ArrowUpRight />
          </ButtonLink>
        </div>
        <p className="mt-8 text-sm text-ink-3">Live on Monad testnet · gasless · sealed tips · public receipts</p>
      </Slide>
    ),
  },
];

/* ─── The deck shell: full-screen, keyboard-driven, on-brand motion ───────────────────────────────────────────── */

const COUNT = SLIDES.length;

export function PitchDeck() {
  const [[page, dir], setPage] = useState<[number, number]>([0, 0]);
  const reduce = useReducedMotion();

  const go = useCallback((next: number, direction: number) => {
    const clamped = Math.max(0, Math.min(COUNT - 1, next));
    setPage(([cur]) => (clamped === cur ? [cur, direction] : [clamped, direction]));
  }, []);
  const next = useCallback(() => go(page + 1, 1), [go, page]);
  const prev = useCallback(() => go(page - 1, -1), [go, page]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        prev();
      } else if (e.key === "Home") {
        go(0, -1);
      } else if (e.key === "End") {
        go(COUNT - 1, 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, go]);

  // A click anywhere that isn't a control advances the deck — the way a presenter clicks through slides.
  function onSlideClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("a,button")) return;
    next();
  }

  const variants = {
    enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d > 0 ? 64 : -64 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : d > 0 ? -64 : 64 }),
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-paper">
      {/* Drifting lights, so the deck has the same lucid feel as the site. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="ambient-light ambient-a" />
        <div className="ambient-light ambient-b" />
      </div>

      {/* Top bar: brand, progress, exit. */}
      <header className="relative z-10 flex items-center gap-4 px-5 pt-5 sm:px-8">
        <Logo />
        <div className="mx-auto hidden w-full max-w-md items-center gap-1.5 sm:flex">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === page}
              onClick={() => go(i, i > page ? 1 : -1)}
              className="group h-2 flex-1 rounded-full"
            >
              <span
                className={`block h-1 rounded-full transition-all duration-300 ${
                  i === page ? "bg-signal" : i < page ? "bg-rule-strong" : "bg-rule group-hover:bg-rule-strong"
                }`}
              />
            </button>
          ))}
        </div>
        <Link
          href="/"
          aria-label="Exit the pitch"
          className="ml-auto grid size-9 place-items-center rounded-full border border-rule text-ink-2 transition hover:border-ink hover:text-ink"
        >
          <Close size={16} />
        </Link>
      </header>

      {/* Slide stage. */}
      <button
        type="button"
        aria-label="Next slide"
        onClick={onSlideClick}
        className="relative z-10 flex flex-1 cursor-default items-center px-6 py-6 text-left sm:px-10"
      >
        <AnimatePresence custom={dir} mode="wait" initial={false}>
          <motion.div
            key={SLIDES[page]?.id}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="w-full"
          >
            {SLIDES[page]?.render()}
          </motion.div>
        </AnimatePresence>
      </button>

      {/* Bottom controls. */}
      <footer className="relative z-10 flex items-center justify-between gap-4 px-5 pb-6 sm:px-8">
        <span className="numeric text-sm text-ink-3">
          {String(page + 1).padStart(2, "0")}{" "}
          <span className="text-rule-strong">/ {String(COUNT).padStart(2, "0")}</span>
        </span>
        <span className="hidden text-xs text-ink-3 md:block">Use ← → or click to move through</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prev}
            disabled={page === 0}
            aria-label="Previous slide"
            className="grid size-11 place-items-center rounded-full border border-rule text-ink-2 transition hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-35"
          >
            <ArrowRight className="rotate-180" />
          </button>
          <button
            type="button"
            onClick={next}
            disabled={page === COUNT - 1}
            aria-label="Next slide"
            className="grid size-11 place-items-center rounded-full bg-ink text-paper transition hover:bg-[color-mix(in_oklab,var(--ink)_86%,var(--signal))] disabled:pointer-events-none disabled:opacity-35"
          >
            <ArrowRight />
          </button>
        </div>
      </footer>
    </div>
  );
}
