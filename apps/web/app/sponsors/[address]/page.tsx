import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { AddressMark } from "@/components/account";
import { ProgramCard } from "@/components/program-card";
import { Stat } from "@/components/ui";
import { explorerTx } from "@/lib/config";
import { shortAddress, usdc } from "@/lib/format";
import { loadSnapshot } from "@/lib/server/snapshot";
import { evidencePayments } from "@/lib/server/trust";
import { freshWalletNote } from "@/lib/trust";
import { sponsorRecord } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Patron record" };

export default async function SponsorRecordPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = await params;
  if (!isAddress(raw)) notFound();
  const address = getAddress(raw);
  const snapshot = await loadSnapshot();
  const record = sponsorRecord(snapshot, address);
  const programs = snapshot.programs.filter((p) => p.sponsor.toLowerCase() === address.toLowerCase());
  const name = programs.find((p) => p.metadata.sponsorName)?.metadata.sponsorName;
  const payments = await evidencePayments(programs);
  const note = freshWalletNote(payments);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <p className="eyebrow">Patron record · computed from on-chain events only</p>
      <div className="mt-6 flex items-center gap-4">
        <AddressMark address={address} size={48} />
        <div>
          {name ? <h1 className="display text-4xl">{name}</h1> : null}
          <p className="numeric mt-1 break-all text-ink-3">{address}</p>
        </div>
      </div>
      <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-rule py-7 md:grid-cols-4">
        <Stat label="Programs" value={record.programs} />
        <Stat label="Bounties locked" value={`$${usdc(record.committed)}`} />
        <Stat
          label="Hits"
          value={record.hits}
          hint={`${record.bySponsor} declared · ${record.byEvidence} by evidence`}
        />
        <Stat label="Paid to scouts" value={`$${usdc(record.paidToScouts)}`} />
      </dl>
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-3">
        "By evidence" means the patron paid a tipped candidate from its declared treasury without declaring the hit
        itself. Scouts can weigh that before tipping.
      </p>
      {payments.length ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Evidence payments</h2>
          {note ? (
            <p className="mt-2 max-w-2xl rounded-xl bg-signal-wash px-4 py-3 text-sm leading-relaxed text-signal-ink">
              {note}
            </p>
          ) : null}
          <ul className="card mt-4 divide-y divide-rule px-5">
            {payments.map((p) => (
              <li key={`${p.programId}:${p.candidateId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <AddressMark address={p.payee} size={18} />
                <span className="numeric text-sm text-ink">{shortAddress(p.payee)}</span>
                <span className="numeric text-sm text-ink-3">
                  ${usdc(p.amount)} · program {p.programId}
                </span>
                {p.fresh ? (
                  <span className="rounded-full bg-signal-wash px-2 py-0.5 text-xs font-semibold text-signal-ink">
                    fresh wallet
                  </span>
                ) : null}
                {explorerTx(p.txHash) ? (
                  <a className="ml-auto text-sm text-ink-3 hover:text-ink" href={explorerTx(p.txHash) ?? "#"}>
                    tx
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {programs.length ? (
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {programs.map((p) => (
            <ProgramCard key={p.id} program={p} now={snapshot.now} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
