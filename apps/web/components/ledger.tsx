"use client";

import { useSnapshot } from "@/lib/client/snapshot";
import { pad, relative } from "@/lib/format";
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
  const items =
    data && data.tips.length >= 3
      ? data.tips.slice(0, 16).map((t) => ({
          key: `t${t.tipId}`,
          head: `#${pad(t.tipId)}`,
          body: `sealed for “${titles.get(t.programId) ?? `Program ${t.programId}`}”`,
          tail: relative(t.committedAt, data.now),
        }))
      : FACTS.map((f) => ({ key: f, head: "✦", body: f, tail: "" }));

  const row = (
    <ul className="flex shrink-0 items-center gap-10 pr-10">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-3 whitespace-nowrap text-sm">
          <span className="numeric font-semibold text-signal-ink">{i.head}</span>
          <span className="text-ink-2">{i.body}</span>
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
