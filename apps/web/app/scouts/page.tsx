import type { Metadata } from "next";
import Link from "next/link";
import { AddressMark } from "@/components/account";
import { standings } from "@/lib/calls";
import { shortAddress, usdc } from "@/lib/format";
import { loadSnapshot } from "@/lib/server/snapshot";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Scouts",
  description: "The people who spot creators first, ranked by what their calls earned. Every miss counts too.",
};

export default async function ScoutsPage() {
  const snapshot = await loadSnapshot().catch(() => null);
  const rows = snapshot ? standings(snapshot) : [];
  return (
    <div className="mx-auto max-w-5xl px-4 pt-12 sm:px-6 md:pt-16">
      <p className="eyebrow">Scouts</p>
      <h1 className="display mt-4 text-[clamp(2.8rem,7vw,5rem)]">Who has the eye.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">
        Ranked by what their calls earned. Every tip is on-chain even when it stays sealed, so a hit rate here can't be
        padded by hiding the misses. Patrons see these records next to every tip.
      </p>
      {rows.length ? (
        <div className="card mt-10 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="eyebrow border-b border-rule">
              <tr>
                <th className="px-5 py-3 font-normal">#</th>
                <th className="px-5 py-3 font-normal">Scout</th>
                <th className="px-5 py-3 text-right font-normal">Calls</th>
                <th className="px-5 py-3 text-right font-normal">Hit rate</th>
                <th className="px-5 py-3 text-right font-normal">Median lead</th>
                <th className="px-5 py-3 text-right font-normal">Earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {rows.map((r, i) => (
                <tr key={r.scout} className="transition hover:bg-paper-2/60">
                  <td className="numeric px-5 py-3.5 text-ink-3">{i + 1}</td>
                  <td className="px-5 py-3.5">
                    <Link href={`/scouts/${r.scout}`} className="flex items-center gap-2 hover:underline">
                      <AddressMark address={r.scout} size={18} />
                      <span className="numeric">{shortAddress(r.scout)}</span>
                    </Link>
                  </td>
                  <td className="numeric px-5 py-3.5 text-right">
                    {r.calls}/{r.tips}
                  </td>
                  <td className="numeric px-5 py-3.5 text-right">{Math.round(r.hitRate * 100)}%</td>
                  <td className="numeric px-5 py-3.5 text-right text-ink-2">
                    {r.medianDaysEarly === null ? "—" : `${Math.round(r.medianDaysEarly)}d`}
                  </td>
                  <td className="numeric px-5 py-3.5 text-right">${usdc(r.earned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-10 text-ink-2">No scouts yet.</p>
      )}
    </div>
  );
}
