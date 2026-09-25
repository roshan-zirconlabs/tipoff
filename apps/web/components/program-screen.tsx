"use client";

import { rankShares } from "@tipoff/core";
import Link from "next/link";
import { useSession } from "@/lib/client/session";
import { useChainNow, useSnapshot } from "@/lib/client/snapshot";
import { mineOnly, useOpenedTips } from "@/lib/client/tips";
import { explorerTx } from "@/lib/config";
import { dateTime, duration, feeLabel, shortAddress, shortHash, usdc } from "@/lib/format";
import { phaseOf, type Snapshot } from "@/lib/types";
import { AddressMark } from "./account";
import { ArrowRight, Eye } from "./icons";
import { MyTipRow } from "./my-tips";
import { TipComposer } from "./tip-composer";
import { Badge, ButtonLink, LiveDot, Stat } from "./ui";

export function ProgramScreen({ id, initial }: { id: number; initial: Snapshot }) {
  const { data = initial } = useSnapshot(initial);
  const now = useChainNow(data.now);
  const session = useSession();
  const program = data.programs.find((p) => p.id === id);
  const myTips = useOpenedTips(
    mineOnly(data, session.profile?.address).filter((t) => t.programId === id),
    session.keys?.sealSecret,
    "scout",
  );

  if (!program) {
    return (
      <p className="mx-auto max-w-6xl px-4 py-24 text-ink-2 sm:px-6">This program no longer exists on this chain.</p>
    );
  }

  const phase = phaseOf(program, now);
  const shares = rankShares(program.topK);
  const isSponsor = session.profile?.address.toLowerCase() === program.sponsor.toLowerCase();
  const spec = program.evidence;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 md:pt-12">
      <Link href="/programs" className="text-sm text-ink-3 transition hover:text-ink">
        ← All programs
      </Link>

      <header className="mt-6 grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {phase === "tipping" ? (
              <Badge tone="signal">
                <LiveDot /> Tipping open · closes in {duration(program.tipDeadline - now)}
              </Badge>
            ) : phase === "tail" ? (
              <Badge>Tipping closed · watching until {dateTime(program.tailEnd)}</Badge>
            ) : (
              <Badge>Closed</Badge>
            )}
            <Badge>Program {program.id}</Badge>
          </div>
          <h1 className="display mt-5 text-[clamp(2.6rem,6vw,4.6rem)]">{program.metadata.title}</h1>
          <Link
            href={`/sponsors/${program.sponsor}`}
            className="mt-4 inline-flex items-center gap-2 text-ink-2 transition hover:text-ink"
          >
            <AddressMark address={program.sponsor} size={22} />
            {program.metadata.sponsorName || shortAddress(program.sponsor)}
            <span className="numeric text-sm text-ink-3">{shortAddress(program.sponsor)}</span>
          </Link>
        </div>
        {isSponsor ? (
          <ButtonLink href={`/sponsor/${program.id}`} variant="primary" className="lg:justify-self-end">
            <Eye /> Open your private dashboard
          </ButtonLink>
        ) : null}
      </header>

      <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-rule py-7 md:grid-cols-4">
        <Stat label="Per hit" value={`$${usdc(program.rewardPerHit)}`} hint={`to the first ${program.topK} scouts`} />
        <Stat label="Bounty left" value={`$${usdc(program.available)}`} hint={`of $${usdc(program.bounty)} locked`} />
        <Stat
          label="Tips sealed"
          value={program.tipCount}
          hint={`${program.hits.length} hit${program.hits.length === 1 ? "" : "s"} so far`}
        />
        <Stat
          label={phase === "tipping" ? "Tipping closes" : "Tail ends"}
          value={phase === "tipping" ? duration(program.tipDeadline - now) : dateTime(program.tailEnd)}
          hint={phase === "tipping" ? dateTime(program.tipDeadline) : "then the sponsor can withdraw"}
        />
      </dl>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-8">
          {program.metadata.brief || program.metadata.lookingFor ? (
            <section>
              {program.metadata.brief ? (
                <p className="text-lg leading-relaxed text-ink">{program.metadata.brief}</p>
              ) : null}
              {program.metadata.lookingFor ? (
                <div className="mt-5 border-l-2 border-signal pl-4">
                  <p className="eyebrow">What a good tip looks like</p>
                  <p className="mt-1.5 leading-relaxed text-ink-2">{program.metadata.lookingFor}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          {phase === "tipping" ? (
            <TipComposer program={program} used={myTips.length} />
          ) : (
            <div className="card p-6">
              <p className="font-semibold">Tipping has closed.</p>
              <p className="mt-1 text-sm text-ink-2">
                The bounty stays locked until {dateTime(program.tailEnd)}. If the sponsor backs a tipped candidate
                before then, the earliest scouts are paid.
              </p>
            </div>
          )}

          {myTips.length ? (
            <section className="card px-6 py-2">
              <h2 className="pb-1 pt-4 font-semibold">Your tips here</h2>
              <ul className="divide-y divide-rule">
                {myTips.map((t) => (
                  <MyTipRow key={t.tipId} tip={t} program={program} now={now} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="space-y-5">
          <section className="card p-6">
            <p className="eyebrow">How a hit pays</p>
            <ol className="mt-4 space-y-2.5">
              {shares.map((share, i) => (
                <li key={share} className="flex items-baseline justify-between gap-4">
                  <span className="text-ink-2">{["First", "Second", "Third", "Fourth", "Fifth"][i]} scout</span>
                  <span className="numeric text-ink">
                    {Math.round(share * 100)}% · $
                    {usdc((BigInt(program.rewardPerHit) * BigInt(Math.round(share * 10_000))) / 10_000n)}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t border-rule pt-4 text-sm leading-relaxed text-ink-3">
              Ranked by when the tip was sealed. {feeLabel()} Winners claim within{" "}
              {Math.round(program.claimWindow / 86_400)} days of a hit.
            </p>
          </section>

          <section className="card p-6">
            <p className="eyebrow">What counts as acting</p>
            {spec.kind === "evm-payment" ? (
              <>
                <p className="mt-3 leading-relaxed text-ink-2">
                  A payment of at least <span className="numeric text-ink">${usdc(spec.minAmount)}</span> USDC from{" "}
                  {spec.treasuries.length === 1 ? "this treasury" : "these treasuries"} to a tipped wallet, even if the
                  sponsor never says so.
                </p>
                <ul className="mt-3 space-y-1.5">
                  {spec.treasuries.map((t) => (
                    <li key={t} className="numeric flex items-center gap-2 text-sm text-ink">
                      <AddressMark address={t} size={16} /> {shortAddress(t)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-3 text-ink-2">The sponsor declares hits itself. No evidence resolver is configured.</p>
            )}
          </section>

          <section className="card p-6">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Hits</p>
              <span className="numeric text-xs text-ink-3">{program.hits.length}</span>
            </div>
            {program.hits.length ? (
              <ul className="mt-3 divide-y divide-rule">
                {program.hits.map((h) => (
                  <li key={h.candidateId} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="numeric text-sm text-ink">{shortHash(h.candidateId)}</span>
                      <Badge tone={h.source === "evidence" ? "signal" : "neutral"}>
                        {h.source === "evidence" ? "Resolved by evidence" : "Declared by sponsor"}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-sm text-ink-3">
                      {dateTime(h.actedAt)} ·{" "}
                      {h.settled
                        ? h.payouts.length
                          ? `paid ${h.payouts.length} scout${h.payouts.length === 1 ? "" : "s"}`
                          : "no winning tips"
                        : `${h.proven} claimed · settles ${dateTime(h.claimDeadline)}`}
                      {explorerTx(h.actedTx) ? (
                        <>
                          {" "}
                          ·{" "}
                          <a className="hover:text-ink" href={explorerTx(h.actedTx) ?? "#"}>
                            tx
                          </a>
                        </>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-ink-3">
                No hits yet. When the sponsor acts on a tipped candidate, it shows here, and so do the scouts it pays.
              </p>
            )}
          </section>

          {session.status !== "unlocked" ? (
            <Link href="/me" className="flex items-center gap-2 px-1 text-sm text-ink-3 transition hover:text-ink">
              Already tipped? Unlock to see your tips <ArrowRight size={15} />
            </Link>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
