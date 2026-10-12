import Link from "next/link";
import { calls } from "@/lib/calls";
import type { CreatorView } from "@/lib/creator-view";
import { shortAddress, usdc } from "@/lib/format";
import type { Snapshot } from "@/lib/types";
import { AddressMark } from "./account";
import { CallCard } from "./call-card";

/**
 * A program's public outcome, server-rendered: every winning call (with the creator's face once revealed) and the
 * scouts ranked by what they earned here. Losing tips stay sealed; only their count is shown.
 */
export function ProgramResults({
  programId,
  snapshot,
  creators,
}: {
  programId: number;
  snapshot: Snapshot;
  creators: Map<string, CreatorView>;
}) {
  const wins = calls(snapshot).filter((c) => c.programId === programId);
  const tips = snapshot.tips.filter((t) => t.programId === programId);
  const scouts = new Map<string, { scout: `0x${string}`; tips: number; calls: number; earned: bigint }>();
  for (const t of tips) {
    const k = t.scout.toLowerCase();
    const row = scouts.get(k) ?? { scout: t.scout, tips: 0, calls: 0, earned: 0n };
    row.tips += 1;
    scouts.set(k, row);
  }
  for (const c of wins) {
    const row = scouts.get(c.scout.toLowerCase());
    if (!row) continue;
    row.calls += 1;
    row.earned += BigInt(c.amount ?? 0);
  }
  const board = [...scouts.values()]
    .sort((a, b) => (b.earned > a.earned ? 1 : b.earned < a.earned ? -1 : b.calls - a.calls || b.tips - a.tips))
    .slice(0, 8);

  return (
    <section id="results" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-rule pt-10">
        <div>
          <p className="eyebrow">Results</p>
          <h2 className="display mt-3 text-[clamp(2rem,4.5vw,3rem)]">
            {wins.length ? "Who called it." : "Nobody's been backed yet."}
          </h2>
        </div>
        <p className="numeric text-sm text-ink-3">
          {tips.length} sealed tip{tips.length === 1 ? "" : "s"} · {scouts.size} scout{scouts.size === 1 ? "" : "s"} ·{" "}
          {wins.length} call{wins.length === 1 ? "" : "s"}
        </p>
      </div>

      {wins.length ? (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wins.map((c) => (
            <li key={c.tipId}>
              <CallCard call={c} creator={creators.get(`${c.programId}:${c.candidateId}`)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 max-w-2xl text-ink-2">
          When the patron backs a creator, the scouts who named them first show up here with the creator's face and the
          payout. Tips that never win stay sealed.
        </p>
      )}

      {board.length ? (
        <div className="card mt-8 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <caption className="eyebrow px-5 pt-4 text-left">Scouts on this program</caption>
            <thead className="eyebrow border-b border-rule">
              <tr>
                <th className="px-5 py-3 font-normal">Scout</th>
                <th className="px-5 py-3 text-right font-normal">Tips</th>
                <th className="px-5 py-3 text-right font-normal">Calls</th>
                <th className="px-5 py-3 text-right font-normal">Earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {board.map((r) => (
                <tr key={r.scout} className="transition hover:bg-paper-2/60">
                  <td className="px-5 py-3">
                    <Link href={`/scouts/${r.scout}`} className="flex items-center gap-2 hover:underline">
                      <AddressMark address={r.scout} size={18} />
                      <span className="numeric">{shortAddress(r.scout)}</span>
                    </Link>
                  </td>
                  <td className="numeric px-5 py-3 text-right">{r.tips}</td>
                  <td className="numeric px-5 py-3 text-right">{r.calls}</td>
                  <td className="numeric px-5 py-3 text-right">${usdc(r.earned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
