"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CandidateKind, feeOf, impliedPrice, payoutFor } from "@tipoff/core";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Hex } from "viem";
import { reputationOf, type ScoutStanding, standings } from "@/lib/calls";
import { ActionError, resolveCandidate, withdrawRemainder } from "@/lib/client/actions";
import { useSession } from "@/lib/client/session";
import { useChainNow, useSnapshot } from "@/lib/client/snapshot";
import { type OpenedTipView, useOpenedTips } from "@/lib/client/tips";
import { config } from "@/lib/config";
import { dateTime, duration, pad, shortAddress, usdc } from "@/lib/format";
import { type ProgramView, phaseOf, type Snapshot } from "@/lib/types";
import { AddressMark } from "./account";
import { Eye, Fingerprint, Lock } from "./icons";
import { useSignIn } from "./sign-in";
import { useToast } from "./toast";
import { Badge, Button, LiveDot, Stat } from "./ui";

type Group = {
  candidateId: Hex;
  tips: OpenedTipView[];
  first: OpenedTipView;
  /** Curve weight committed to this candidate: Σ (baseWeight + stake). */
  weight: bigint;
  staked: bigint;
  /** Distinct scouts on this creator who have been right before: the signal that cuts through spam. */
  provenScouts: number;
  /** Spot price of the next share on this candidate, relative to the first. Only the sponsor can know it. */
  price: number;
  /** What each of the first topK tips would earn if you acted now and they all claimed. */
  projected: bigint[];
};

export function SponsorDashboard({ id, initial }: { id: number; initial: Snapshot }) {
  const { data = initial } = useSnapshot(initial);
  const now = useChainNow(data.now);
  const session = useSession();
  const signIn = useSignIn();
  const program = data.programs.find((p) => p.id === id);
  const tips = useMemo(() => data.tips.filter((t) => t.programId === id), [data.tips, id]);
  const isSponsor = Boolean(program && session.profile?.address.toLowerCase() === program.sponsor.toLowerCase());
  const opened = useOpenedTips(tips, isSponsor ? session.keys?.sealSecret : null, "sponsor");

  const records = useMemo(() => new Map(standings(data).map((s) => [s.scout.toLowerCase(), s])), [data]);
  const groups = useMemo<Group[]>(() => {
    const map = new Map<Hex, OpenedTipView[]>();
    for (const t of opened) {
      if (!t.valid || !t.candidateId) continue;
      map.set(t.candidateId, [...(map.get(t.candidateId) ?? []), t]);
    }
    if (!program) return [];
    const curve = { baseWeight: BigInt(program.baseWeight), curveDepth: BigInt(program.curveDepth) };
    const reward = BigInt(program.rewardPerHit);
    const net = reward - feeOf(reward, config.feeBps);
    return [...map.entries()]
      .map(([candidateId, list]) => {
        const sorted = [...list].sort((a, b) => a.tipId - b.tipId);
        const stakes = sorted.map((t) => BigInt(t.stake));
        const staked = stakes.reduce((a, b) => a + b, 0n);
        const weight = staked + curve.baseWeight * BigInt(sorted.length);
        return {
          candidateId,
          tips: sorted,
          first: sorted[0] as OpenedTipView,
          weight,
          staked,
          provenScouts: new Set(
            sorted
              .filter((t) => (records.get(t.scout.toLowerCase())?.calls ?? 0) > 0)
              .map((t) => t.scout.toLowerCase()),
          ).size,
          price: impliedPrice(weight, curve.curveDepth),
          projected: payoutFor(net, stakes.slice(0, program.topK), curve),
        };
      })
      .sort((a, b) => (b.weight > a.weight ? 1 : b.weight < a.weight ? -1 : a.first.tipId - b.first.tipId));
  }, [opened, program, records]);

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
          <h1 className="text-xl font-semibold">Only the patron can read these tips.</h1>
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
          hint={`${groups.length} candidate${groups.length === 1 ? "" : "s"} · $${usdc(program.staked)} staked`}
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
          <p className="max-w-md text-sm text-ink-3">
            Ranked by conviction: every tip adds weight, stakes add more. Price is what the next share on that candidate
            costs. Nobody but you can see it.
          </p>
        </div>

        {groups.length ? (
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            <AnimatePresence initial={false}>
              {groups.map((g) => (
                <motion.li key={g.candidateId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <CandidateCard
                    group={g}
                    program={program}
                    topPrice={groups[0]?.price ?? 1}
                    records={records}
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
  program,
  topPrice,
  records,
  hit,
  topK,
}: {
  group: Group;
  program: ProgramView;
  topPrice: number;
  records: Map<string, ScoutStanding>;
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
      await resolveCandidate(program, group.candidateId, session.keys);
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
        <div className="shrink-0 text-right">
          <p className="numeric text-2xl font-semibold leading-none tracking-[-0.03em] text-signal-ink">
            {group.price < 10 ? group.price.toFixed(2) : group.price.toFixed(1)}
            <span className="text-base">×</span>
          </p>
          <p className="eyebrow mt-1">price</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-ink-3">
        {group.tips.length} scout{group.tips.length === 1 ? "" : "s"}
        {group.staked > 0n ? <span className="numeric"> · ${usdc(group.staked)} staked</span> : " · no stakes"}
        {group.provenScouts ? (
          <span className="text-signal-ink"> · {group.provenScouts} with a track record</span>
        ) : null}
      </p>
      <PriceBar price={group.price} top={topPrice} />

      <ol className="mt-4 space-y-3">
        {group.tips.map((t, i) => (
          <li key={t.tipId} className="rounded-xl bg-paper px-3.5 py-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="numeric font-semibold text-ink">
                #{pad(t.tipId)}
                {BigInt(t.stake) > 0n ? <span className="text-ink-2"> · ${usdc(t.stake)} staked</span> : null}
              </span>
              <span className="numeric text-ink-3">
                {i < topK && group.projected[i] !== undefined ? (
                  <span className="text-signal-ink">would earn ${usdc(group.projected[i] ?? 0n)}</span>
                ) : (
                  "outside the paid spots"
                )}
              </span>
            </div>
            <p className="numeric mt-1 flex flex-wrap gap-x-2 text-xs text-ink-3">
              <span>{dateTime(t.committedAt)}</span>
              <span>· {reputationOf(records.get(t.scout.toLowerCase())) ?? "first tip"}</span>
            </p>
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
              You pay ${usdc(program.rewardPerHit)} from your account to the earliest{" "}
              {Math.min(topK, group.tips.length)} scout{Math.min(topK, group.tips.length) === 1 ? "" : "s"}, split by
              their shares on the curve. Your locked bounty stays untouched: it only backs hits proven by evidence. If
              nobody claims, you get it back. It can't be undone.
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

/** Price on a log scale, relative to the most backed candidate on the board. */
function PriceBar({ price, top }: { price: number; top: number }) {
  const fill = top > 1 ? Math.min(1, Math.log(price) / Math.log(top)) : 0;
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-2" aria-hidden>
      <motion.div
        className="h-full rounded-full bg-signal"
        initial={false}
        animate={{ width: `${Math.max(4, fill * 100)}%` }}
        transition={{ type: "spring", stiffness: 140, damping: 22 }}
      />
    </div>
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
