"use client";

import Link from "next/link";
import { useSession } from "@/lib/client/session";
import { useChainNow, useSnapshot } from "@/lib/client/snapshot";
import { mineOnly, tipStatus, useOpenedTips } from "@/lib/client/tips";
import { usdc } from "@/lib/format";
import { type Snapshot, scoutRecord } from "@/lib/types";
import { AddressMark } from "./account";
import { ArrowRight, Fingerprint } from "./icons";
import { MyTipRow } from "./my-tips";
import { useSignIn } from "./sign-in";
import { Button, ButtonLink, Stat } from "./ui";

export function MeScreen({ initial }: { initial: Snapshot }) {
  const { data = initial } = useSnapshot(initial);
  const now = useChainNow(data.now);
  const session = useSession();
  const signIn = useSignIn();
  const address = session.profile?.address;
  const tips = useOpenedTips(mineOnly(data, address), session.keys?.sealSecret, "scout");
  const programsById = new Map(data.programs.map((p) => [p.id, p]));
  const sponsored = address ? data.programs.filter((p) => p.sponsor.toLowerCase() === address.toLowerCase()) : [];

  if (session.status !== "unlocked" || !address) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-ink text-paper">
          <Fingerprint size={24} />
        </div>
        <h1 className="display mt-6 text-4xl">Your tips are sealed to you.</h1>
        <p className="mt-3 text-ink-2">Unlock with your passkey to read them, see which ones won, and claim payouts.</p>
        <Button className="mt-7" size="lg" onClick={() => signIn.open()}>
          {session.status === "locked" ? "Unlock" : "Sign in"}
        </Button>
      </div>
    );
  }

  const record = scoutRecord(data, address);
  const claimable = tips.filter((t) => tipStatus(t, programsById.get(t.programId), now).kind === "claimable");

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <div className="flex min-w-0 items-center gap-3">
        <AddressMark address={address} size={36} />
        <div className="min-w-0">
          <p className="font-semibold">{session.profile?.name}</p>
          <Link href={`/scouts/${address}`} className="numeric block truncate text-sm text-ink-3 hover:text-ink">
            {address}
          </Link>
        </div>
      </div>
      <h1 className="display mt-8 text-[clamp(2.6rem,6vw,4.4rem)]">
        {claimable.length ? `${claimable.length} tip${claimable.length === 1 ? "" : "s"} to claim.` : "Your tips."}
      </h1>

      <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-rule py-7 md:grid-cols-4">
        <Stat label="Tips sealed" value={record.tips} />
        <Stat label="Programs" value={record.programs} />
        <Stat
          label="Paid tips"
          value={record.wins}
          hint={record.tips ? `${Math.round((record.wins / record.tips) * 100)}% hit rate` : undefined}
        />
        <Stat label="Earned" value={`$${usdc(record.earned)}`} />
      </dl>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-[-0.02em]">Every tip you've sealed</h2>
        {tips.length ? (
          <ul className="card mt-6 divide-y divide-rule px-6">
            {tips.map((t) => (
              <MyTipRow key={t.tipId} tip={t} program={programsById.get(t.programId)} now={now} showProgram />
            ))}
          </ul>
        ) : (
          <div className="card mt-6 flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-ink-2">You haven't sealed a tip yet. Find a program you have an eye for.</p>
            <ButtonLink href="/programs">
              Browse programs <ArrowRight />
            </ButtonLink>
          </div>
        )}
      </section>

      {sponsored.length ? (
        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Programs you run</h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {sponsored.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/sponsor/${p.id}`}
                  className="card flex items-center justify-between gap-4 p-5 transition hover:border-rule-strong"
                >
                  <div>
                    <p className="font-semibold">{p.metadata.title}</p>
                    <p className="mt-1 text-sm text-ink-3">
                      {p.tipCount} tips · ${usdc(p.available)} left
                    </p>
                  </div>
                  <ArrowRight className="text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
