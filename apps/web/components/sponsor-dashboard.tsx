"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CandidateKind } from "@tipoff/core";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Hex } from "viem";
import { ActionError, resolveCandidate, withdrawRemainder } from "@/lib/client/actions";
import { useSession } from "@/lib/client/session";
import { useChainNow, useSnapshot } from "@/lib/client/snapshot";
import { type OpenedTipView, useOpenedTips } from "@/lib/client/tips";
import { dateTime, duration, pad, shortAddress, usdc } from "@/lib/format";
import { phaseOf, type Snapshot } from "@/lib/types";
import { AddressMark } from "./account";
import { Eye, Fingerprint, Lock } from "./icons";
import { useSignIn } from "./sign-in";
import { useToast } from "./toast";
import { Badge, Button, LiveDot, Stat } from "./ui";

type Group = { candidateId: Hex; tips: OpenedTipView[]; first: OpenedTipView };

export function SponsorDashboard({ id, initial }: { id: number; initial: Snapshot }) {
  const { data = initial } = useSnapshot(initial);
  const now = useChainNow(data.now);
  const session = useSession();
  const signIn = useSignIn();
  const program = data.programs.find((p) => p.id === id);
  const tips = useMemo(() => data.tips.filter((t) => t.programId === id), [data.tips, id]);
  const isSponsor = Boolean(program && session.profile?.address.toLowerCase() === program.sponsor.toLowerCase());
  const opened = useOpenedTips(tips, isSponsor ? session.keys?.sealSecret : null, "sponsor");

  const groups = useMemo<Group[]>(() => {
    const map = new Map<Hex, OpenedTipView[]>();
    for (const t of opened) {
      if (!t.valid || !t.candidateId) continue;
      map.set(t.candidateId, [...(map.get(t.candidateId) ?? []), t]);
    }
    return [...map.entries()]
      .map(([candidateId, list]) => {
        const sorted = [...list].sort((a, b) => a.tipId - b.tipId);
        return { candidateId, tips: sorted, first: sorted[0] as OpenedTipView };
      })
      .sort((a, b) => b.tips.length - a.tips.length || a.first.tipId - b.first.tipId);
  }, [opened]);

  if (!program) return <Shell>This program doesn't exist on this chain.</Shell>;

  if (session.status !== "unlocked") {
    return (
      <Shell>
        <div className="card mx-auto max-w-lg p-8 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-ink text-paper">
            <Fingerprint size={24} />
          </div>
          <h1 className="display mt-5 text-3xl">Tips are sealed to your passkey.</h1>
          <p className="mt-2 text-ink-2">
            Unlock to read them. They're decrypted here, in your browser, and nowhere else.
          </p>
          <Button className="mt-6" onClick={() => signIn.open("Unlock with the passkey that opened this program.")}>
            Unlock dashboard
          </Button>
        </div>
      </Shell>
    );
  }

  if (!isSponsor) {
    return (
      <Shell>
        <div className="card mx-auto max-w-lg p-8">
          <h1 className="text-xl font-semibold">Only the sponsor can read these tips.</h1>
          <p className="mt-2 text-ink-2">
            You're signed in as {shortAddress(session.profile?.address ?? "0x")}. This program belongs to{" "}
            {shortAddress(program.sponsor)}.
          </p>
          <Link
            className="mt-5 inline-block text-signal-ink underline underline-offset-4"
            href={`/programs/${program.id}`}
          >
            Go to the public page
          </Link>
        </div>
      </Shell>
    );
  }

  const phase = phaseOf(program, now);
  const unreadable = opened.filter((t) => !t.valid).length;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 md:pt-12">
      <Link href={`/programs/${program.id}`} className="text-sm text-ink-3 transition hover:text-ink">
        ← Public page
      </Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <Badge tone="ink">
            <Eye size={13} /> Private · decrypted on this device
          </Badge>
          <h1 className="display mt-5 text-[clamp(2.4rem,5.5vw,4rem)]">{program.metadata.title}</h1>
        </div>
        <WithdrawButton
          programId={program.id}
          canWithdraw={phase === "closed" && program.openHits === 0 && BigInt(program.available) > 0n}
        />
      </div>

      <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-rule py-7 md:grid-cols-4">
        <Stat
          label="Tips received"
          value={program.tipCount}
          hint={`${groups.length} distinct candidate${groups.length === 1 ? "" : "s"}`}
        />
        <Stat
          label="Bounty left"
          value={`$${usdc(program.available)}`}
          hint={`$${usdc(program.rewardPerHit)} per hit`}
        />
        <Stat
          label="Hits"
          value={program.hits.length}
          hint={`${program.hits.filter((h) => h.source === "evidence").length} by evidence`}
        />
        <Stat
          label={phase === "tipping" ? "Tipping closes" : "Tail ends"}
          value={phase === "tipping" ? duration(program.tipDeadline - now) : dateTime(program.tailEnd)}
        />
      </dl>

      <section className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Conviction board</h2>
          <p className="text-sm text-ink-3">Candidates ranked by how many scouts independently named them.</p>
        </div>

        {groups.length ? (
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            <AnimatePresence initial={false}>
              {groups.map((g) => (
                <motion.li key={g.candidateId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <CandidateCard
                    group={g}
                    programId={program.id}
                    hit={program.hits.find((h) => h.candidateId === g.candidateId)}
                    topK={program.topK}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <div className="card mt-6 p-8 text-ink-2">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <LiveDot /> Listening for tips
            </p>
            <p className="mt-2">
              Share the public page with people who'd know. Tips show up here the moment they're sealed.
            </p>
          </div>
        )}
        {unreadable ? (
          <p className="mt-4 text-sm text-ink-3">
            {unreadable} tip{unreadable === 1 ? "" : "s"} couldn't be read. They were malformed or not sealed to your
            key, and can never win.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function CandidateCard({
  group,
  programId,
  hit,
  topK,
}: {
  group: Group;
  programId: number;
  hit: Snapshot["programs"][number]["hits"][number] | undefined;
  topK: number;
}) {
  const session = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const p = group.first.plaintext;
  const who = group.tips.map((t) => t.plaintext?.label).find(Boolean) ?? "Unnamed candidate";

  async function act() {
    if (!session.keys) return;
    setBusy(true);
    try {
      await resolveCandidate(programId, group.candidateId, session.keys);
      await qc.invalidateQueries({ queryKey: ["snapshot"] });
      toast({
        title: "Marked as acted",
        body: `The first ${Math.min(topK, group.tips.length)} scouts can now claim.`,
        tone: "ok",
      });
      setConfirming(false);
    } catch (err) {
      toast({ title: "Couldn't mark it", body: err instanceof ActionError ? err.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold tracking-[-0.02em]">{who}</h3>
          {p?.candidate.kind === CandidateKind.Wallet ? (
            <p className="numeric mt-0.5 flex items-center gap-1.5 text-sm text-ink-3">
              <AddressMark address={p.candidate.value} size={14} />
              {p.candidate.value}
            </p>
          ) : p ? (
            <p className="numeric mt-0.5 text-sm text-ink-3">Deezer artist #{p.candidate.value}</p>
          ) : null}
        </div>
        <span className="numeric shrink-0 rounded-full bg-signal-wash px-2.5 py-1 text-sm font-semibold text-signal-ink">
          ×{group.tips.length}
        </span>
      </div>

      <ol className="mt-4 space-y-3">
        {group.tips.map((t, i) => (
          <li key={t.tipId} className="rounded-xl bg-paper px-3.5 py-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="numeric font-semibold text-ink">
                #{pad(t.tipId)} {i < topK ? <span className="text-signal-ink">· rank {i + 1}</span> : null}
              </span>
              <span className="numeric text-ink-3">{dateTime(t.committedAt)}</span>
            </div>
            {t.plaintext?.note ? <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{t.plaintext.note}</p> : null}
          </li>
        ))}
      </ol>

      <div className="mt-auto pt-5">
        {hit ? (
          <Badge tone={hit.source === "evidence" ? "signal" : "ok"}>
            {hit.source === "evidence" ? "Resolved by evidence" : "You marked this acted"} · {dateTime(hit.actedAt)}
          </Badge>
        ) : confirming ? (
          <div className="rounded-xl border border-rule p-3.5">
            <p className="text-sm leading-relaxed text-ink-2">
              This allocates one hit from your bounty to the earliest {Math.min(topK, group.tips.length)} scout
              {Math.min(topK, group.tips.length) === 1 ? "" : "s"}. It can't be undone.
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="signal" loading={busy} onClick={act}>
                <Lock size={14} /> Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            We backed them
          </Button>
        )}
      </div>
    </article>
  );
}

function WithdrawButton({ programId, canWithdraw }: { programId: number; canWithdraw: boolean }) {
  const session = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!canWithdraw) return null;
  return (
    <Button
      variant="outline"
      loading={busy}
      onClick={async () => {
        if (!session.keys) return;
        setBusy(true);
        try {
          await withdrawRemainder(programId, session.keys);
          await qc.invalidateQueries({ queryKey: ["snapshot"] });
          toast({ title: "Remaining bounty returned to you", tone: "ok" });
        } catch (err) {
          toast({
            title: "Couldn't withdraw",
            body: err instanceof ActionError ? err.message : undefined,
            tone: "error",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      Withdraw unused bounty
    </Button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">{children}</div>;
}
