"use client";

import { calls } from "@/lib/calls";
import { useSnapshot } from "@/lib/client/snapshot";
import { pad, relative, usdc } from "@/lib/format";
import type { Snapshot } from "@/lib/types";

const FACTS = [
  "Sealed tips",
  "Bounties locked through a 90-day tail",
  "0.5% fee · capped at 1% in code",
  "Losing tips never revealed",
  "Paid by commit order",
  "Passkey accounts · no gas",
];

/** A running ledger of sealed tips — public position, private content. Falls back to the protocol's rules when quiet. */
export function Ledger({ initial }: { initial?: Snapshot | null }) {
  const { data } = useSnapshot(initial ?? undefined);
  const titles = new Map(data?.programs.map((p) => [p.id, p.metadata.title]) ?? []);
  // Wins first-class, then fresh tips (with their stake): what's happening, newest first.
  const events =
    data && data.tips.length >= 3
      ? [
          ...calls(data).map((c) => ({
            key: `c${c.tipId}`,
            at: c.actedAt,
            head: `#${pad(c.tipId)}`,
            body:
              c.daysEarly >= 1
                ? `called it ${Math.round(c.daysEarly)} day${Math.round(c.daysEarly) === 1 ? "" : "s"} early`
                : "called it",
            win: c.amount ? `earned $${usdc(c.amount)}` : "payout pending",
          })),
          ...data.tips.map((t) => ({
            key: `t${t.tipId}`,
            at: t.committedAt,
            head: `#${pad(t.tipId)}`,
            body: `sealed for “${titles.get(t.programId) ?? `Program ${t.programId}`}”${
              BigInt(t.stake) > 0n ? ` · $${usdc(t.stake)} staked` : ""
            }`,
            win: null as string | null,
          })),
        ]
          .sort((a, b) => b.at - a.at)
          .slice(0, 18)
      : null;
  const items = events
    ? events.map((e) => ({ key: e.key, head: e.head, body: e.body, win: e.win, tail: relative(e.at, data?.now ?? 0) }))
    : FACTS.map((f) => ({ key: f, head: "✦", body: f, win: null as string | null, tail: "" }));

  const row = (
    <ul className="flex shrink-0 items-center gap-10 pr-10">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-3 whitespace-nowrap text-sm">
          <span className="numeric font-semibold text-signal-ink">{i.head}</span>
          <span className="text-ink-2">{i.body}</span>
          {i.win ? (
            <span className="numeric rounded-full bg-signal-wash px-2 py-0.5 text-xs font-semibold text-signal-ink">
              {i.win}
            </span>
          ) : null}
          {i.tail ? <span className="numeric text-ink-3">{i.tail}</span> : null}
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-label="Recent sealed tips" className="border-y border-rule bg-paper-2/60 py-3.5">
      <div className="marquee flex overflow-hidden">
        <div className="flex [animation:marquee_48s_linear_infinite] hover:[animation-play-state:paused]">
          {row}
          <div aria-hidden="true">{row}</div>
        </div>
      </div>
    </section>
  );
}
