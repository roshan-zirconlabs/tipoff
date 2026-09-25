import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { AddressMark } from "@/components/account";
import { Stat } from "@/components/ui";
import { dateTime, pad, usdc } from "@/lib/format";
import { loadSnapshot } from "@/lib/server/snapshot";
import { scoutRecord } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Scout record" };

export default async function ScoutPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = await params;
  if (!isAddress(raw)) notFound();
  const address = getAddress(raw);
  const snapshot = await loadSnapshot();
  const record = scoutRecord(snapshot, address);
  const titles = new Map(snapshot.programs.map((p) => [p.id, p.metadata.title]));
  const wins = snapshot.programs.flatMap((p) =>
    p.hits.flatMap((h) =>
      h.payouts
        .filter((x) => x.scout.toLowerCase() === address.toLowerCase())
        .map((x) => ({ ...x, programId: p.id, actedAt: h.actedAt, source: h.source })),
    ),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 pt-12 sm:px-6 md:pt-16">
      <p className="eyebrow">Scout record · computed from on-chain events only</p>
      <div className="mt-6 flex items-center gap-4">
        <AddressMark address={address} size={48} />
        <h1 className="numeric break-all text-xl sm:text-2xl">{address}</h1>
      </div>
      <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-rule py-7 md:grid-cols-4">
        <Stat label="Tips sealed" value={record.tips} />
        <Stat label="Programs" value={record.programs} />
        <Stat
          label="Paid tips"
          value={record.wins}
          hint={record.tips ? `${Math.round((record.wins / record.tips) * 100)}% hit rate` : "—"}
        />
        <Stat label="Earned" value={`$${usdc(record.earned)}`} />
      </dl>
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-3">
        Losing tips stay sealed forever, but every tip's existence is public, so the hit rate can't be padded. Only
        winning tips were ever opened.
      </p>
      <h2 className="mt-12 text-xl font-semibold">Paid calls</h2>
      {wins.length ? (
        <ul className="card mt-4 divide-y divide-rule px-6">
          {wins.map((w) => (
            <li key={w.tipId} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-medium">
                  <span className="numeric text-signal-ink">#{pad(w.tipId)}</span> ·{" "}
                  <Link href={`/programs/${w.programId}`} className="hover:underline">
                    {titles.get(w.programId)}
                  </Link>
                </p>
                <p className="mt-0.5 text-sm text-ink-3">
                  Acted {dateTime(w.actedAt)} ·{" "}
                  {w.source === "evidence" ? "resolved by evidence" : "declared by sponsor"}
                </p>
              </div>
              <span className="numeric text-lg">${usdc(w.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-ink-2">No paid calls yet.</p>
      )}
    </div>
  );
}
