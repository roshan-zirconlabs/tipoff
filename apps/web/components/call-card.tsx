import Link from "next/link";
import type { Address } from "viem";
import { AddressMark } from "@/components/account";
import { Tilt } from "@/components/motion/tilt";
import type { Call } from "@/lib/calls";
import { dateTime, pad, shortAddress, usdc } from "@/lib/format";

export function daysLabel(days: number): string {
  if (days < 1) return "same day";
  const d = Math.round(days);
  return `${d} day${d === 1 ? "" : "s"} early`;
}

/** A call in the feed, the way people brag about it: who you called, when, and what happened. */
export function CallCard({ call, creator }: { call: Call; creator?: Address | null }) {
  const patron = call.patronName || shortAddress(call.patron);
  return (
    <Tilt className="h-full">
      <Link
        href={`/calls/${call.tipId}`}
        className="card group flex h-full flex-col p-5 transition-[box-shadow,border-color] duration-300 hover:border-rule-strong hover:shadow-[0_28px_50px_-30px_rgb(var(--shadow)/0.55)]"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="numeric text-sm font-semibold text-signal-ink">#{pad(call.tipId)}</span>
          <span className="numeric rounded-full bg-signal-wash px-2.5 py-1 text-xs font-semibold text-signal-ink">
            {daysLabel(call.daysEarly)}
          </span>
        </div>
        <p className="mt-4 flex items-center gap-2 text-lg font-semibold leading-snug tracking-[-0.02em]">
          Called{" "}
          {creator ? (
            <>
              <AddressMark address={creator} size={18} />
              <span className="numeric">{shortAddress(creator)}</span>
            </>
          ) : (
            "a creator"
          )}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
          Sealed {dateTime(call.committedAt)}. {patron} paid them {dateTime(call.actedAt)}.
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm">
          <span className="flex min-w-0 items-center gap-2 text-ink-3">
            <AddressMark address={call.scout} size={16} />
            <span className="numeric truncate">{shortAddress(call.scout)}</span>
          </span>
          <span className="numeric shrink-0 font-semibold text-ink">
            {call.amount ? `earned $${usdc(call.amount)}` : "payout pending"}
          </span>
        </div>
      </Link>
    </Tilt>
  );
}
