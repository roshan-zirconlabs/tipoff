import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { AddressMark } from "@/components/account";
import { ProgramCard } from "@/components/program-card";
import { Stat } from "@/components/ui";
import { usdc } from "@/lib/format";
import { loadSnapshot } from "@/lib/server/snapshot";
import { sponsorRecord } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sponsor record" };

export default async function SponsorRecordPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = await params;
  if (!isAddress(raw)) notFound();
  const address = getAddress(raw);
  const snapshot = await loadSnapshot();
  const record = sponsorRecord(snapshot, address);
  const programs = snapshot.programs.filter((p) => p.sponsor.toLowerCase() === address.toLowerCase());
  const name = programs.find((p) => p.metadata.sponsorName)?.metadata.sponsorName;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <p className="eyebrow">Sponsor record · computed from on-chain events only</p>
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
        "By evidence" means the sponsor paid a tipped candidate from its declared treasury without declaring the hit
        itself. Scouts can weigh that before tipping.
      </p>
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
