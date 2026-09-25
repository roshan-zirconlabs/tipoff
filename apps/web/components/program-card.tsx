import Link from "next/link";
import { duration, usdc } from "@/lib/format";
import { type ProgramView, phaseOf } from "@/lib/types";
import { ArrowUpRight } from "./icons";
import { Badge, LiveDot } from "./ui";

export function ProgramCard({ program, now }: { program: ProgramView; now: number }) {
  const phase = phaseOf(program, now);
  const hits = program.hits.length;
  return (
    <Link
      href={`/programs/${program.id}`}
      className="card group relative flex h-full flex-col p-5 transition-[transform,box-shadow,border-color] duration-300 ease-[var(--ease-out-quint)] hover:-translate-y-0.5 hover:border-rule-strong hover:shadow-[0_22px_40px_-28px_rgb(var(--shadow)/0.45)] sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        {phase === "tipping" ? (
          <Badge tone="signal">
            <LiveDot /> Tipping open
          </Badge>
        ) : phase === "tail" ? (
          <Badge>Watching · tail</Badge>
        ) : (
          <Badge>Closed</Badge>
        )}
        <ArrowUpRight className="text-ink-3 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink" />
      </div>

      <h3 className="display mt-5 text-[1.7rem] leading-[1.02]">{program.metadata.title}</h3>
      <p className="mt-1.5 text-sm text-ink-3">
        by {program.metadata.sponsorName || "an anonymous sponsor"} · program {program.id}
      </p>
      {program.metadata.brief ? (
        <p className="mt-3 line-clamp-2 text-[0.95rem] leading-relaxed text-ink-2">{program.metadata.brief}</p>
      ) : null}

      <dl className="mt-auto grid grid-cols-3 gap-3 border-t border-rule pt-4 text-sm">
        <div>
          <dt className="eyebrow">Per hit</dt>
          <dd className="numeric mt-1 text-lg text-ink">${usdc(program.rewardPerHit, { compact: true })}</dd>
        </div>
        <div>
          <dt className="eyebrow">Tips</dt>
          <dd className="numeric mt-1 text-lg text-ink">{program.tipCount}</dd>
        </div>
        <div>
          <dt className="eyebrow">{phase === "tipping" ? "Closes in" : "Hits"}</dt>
          <dd className="numeric mt-1 text-lg text-ink">
            {phase === "tipping" ? duration(program.tipDeadline - now) : hits}
          </dd>
        </div>
      </dl>
    </Link>
  );
}
