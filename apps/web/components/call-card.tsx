import Link from "next/link";
import { AddressMark } from "@/components/account";
import type { Call } from "@/lib/calls";
import { dateTime, pad, shortAddress, usdc } from "@/lib/format";

export function daysLabel(days: number): string {
  if (days < 1) return "same day";
  const d = Math.round(days);
  return `${d} day${d === 1 ? "" : "s"} early`;
}

/** A call in the feed: who called it, how early, what it paid. */
export function CallCard({ call }: { call: Call }) {
  return (
    <Link
      href={`/calls/${call.tipId}`}
      className="card group flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:border-rule-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="numeric text-sm font-semibold text-signal-ink">#{pad(call.tipId)}</span>
        <span className="numeric rounded-full bg-signal-wash px-2.5 py-1 text-xs font-semibold text-signal-ink">
          {daysLabel(call.daysEarly)}
        </span>
      </div>
      <p className="mt-4 text-lg font-semibold leading-snug tracking-[-0.02em]">
        Called it for {call.patronName || shortAddress(call.patron)}
      </p>
      <p className="mt-1 text-sm text-ink-3">{call.programTitle}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-ink-2">
          <AddressMark address={call.scout} size={18} />
          <span className="numeric truncate">{shortAddress(call.scout)}</span>
        </span>
        <span className="numeric shrink-0 text-ink">
          {call.amount ? `$${usdc(call.amount)}` : "claimed"} · {dateTime(call.actedAt)}
        </span>
      </div>
    </Link>
  );
}
