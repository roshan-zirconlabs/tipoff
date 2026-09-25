"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { useChainNow, useSnapshot } from "@/lib/client/snapshot";
import { type ProgramPhase, phaseOf, type Snapshot } from "@/lib/types";
import { ProgramCard } from "./program-card";
import { ButtonLink, Skeleton } from "./ui";

const TABS: { key: ProgramPhase; label: string }[] = [
  { key: "tipping", label: "Taking tips" },
  { key: "tail", label: "Watching" },
  { key: "closed", label: "Closed" },
];

export function ProgramsList({ initial }: { initial: Snapshot | null }) {
  const { data, isError } = useSnapshot(initial ?? undefined);
  const now = useChainNow(data?.now);
  const [tab, setTab] = useState<ProgramPhase>("tipping");

  if (!data) {
    return isError ? (
      <p className="card mt-10 p-8 text-ink-2">The chain isn't reachable right now. Try again in a moment.</p>
    ) : (
      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    );
  }

  const counts = Object.fromEntries(
    TABS.map((t) => [t.key, data.programs.filter((p) => phaseOf(p, now) === t.key).length]),
  );
  const shown = data.programs.filter((p) => phaseOf(p, now) === tab);

  return (
    <>
      <div role="tablist" aria-label="Program status" className="mt-10 flex gap-1 border-b border-rule">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`relative -mb-px px-4 py-3 text-sm font-medium transition ${
              tab === t.key ? "text-ink" : "text-ink-3 hover:text-ink-2"
            }`}
          >
            {t.label} <span className="numeric text-ink-3">{counts[t.key]}</span>
            {tab === t.key ? (
              <motion.span
                layoutId="programs-tab"
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-signal"
              />
            ) : null}
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <ProgramCard program={p} now={now} />
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="card mt-8 flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-ink-2">
            {tab === "tipping"
              ? "Nothing is taking tips right now."
              : tab === "tail"
                ? "No programs in their tail period."
                : "No closed programs yet."}
          </p>
          {tab === "tipping" ? <ButtonLink href="/sponsor/new">Start a program</ButtonLink> : null}
        </div>
      )}
    </>
  );
}
