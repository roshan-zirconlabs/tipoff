"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Stamp } from "./stamp";

const SAMPLES = [
  {
    program: "Founders we'll fund — Q4",
    candidate: "0x7f3a…c21e",
    label: "Ada — payroll rails for gig workers",
    note: "Shipped three releases in a month. 400 riders onboarded in Lagos, no ads.",
    n: 42,
  },
  {
    program: "Artists we'll sign",
    candidate: "deezer · #184502",
    label: "Nala Bloom — alt-R&B, Leeds",
    note: "Two tracks, 90k plays, zero label. Crowd sings every word at 200-cap shows.",
    n: 7,
  },
  {
    program: "Engineers we'll hire",
    candidate: "0x19be…04d7",
    label: "Kenji — ZK circuits",
    note: "Rewrote a prover in a weekend. Nobody's DM'd him yet.",
    n: 118,
  },
];

type Phase = "typing" | "sealing" | "sealed";

function useTypewriter(text: string, active: boolean, speed = 22) {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!active) return;
    setOut("");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, active, speed]);
  return active ? out : text;
}

/** An illustrated tip being written, sealed and stamped — the product in one loop. */
export function HeroCard() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  // Server and first client render agree on a finished, sealed card; the loop starts after mount.
  const [phase, setPhase] = useState<Phase>("sealed");
  const [running, setRunning] = useState(false);
  const sample = SAMPLES[index % SAMPLES.length] ?? SAMPLES[0]!;
  const note = useTypewriter(sample.note, running && phase === "typing");

  useEffect(() => {
    if (reduce) return;
    const start = setTimeout(() => {
      setRunning(true);
      setIndex(1);
      setPhase("typing");
    }, 2600);
    return () => clearTimeout(start);
  }, [reduce]);

  // One schedule per sample: type, seal, stamp, then move on. Keyed on the sample so phase changes never cancel it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `index` is the trigger — each new sample restarts the schedule
  useEffect(() => {
    if (!running) return;
    const typingMs = sample.note.length * 22 + 700;
    const timers = [
      setTimeout(() => setPhase("sealing"), typingMs),
      setTimeout(() => setPhase("sealed"), typingMs + 650),
      setTimeout(() => {
        setIndex((i) => i + 1);
        setPhase("typing");
      }, typingMs + 3600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [index, running, sample.note.length]);

  const sealed = phase !== "typing";

  return (
    <figure className="relative mx-auto w-full max-w-[30rem]" aria-label="Illustration: a tip being sealed">
      {/* The stack of earlier tips, for depth. */}
      <div className="absolute inset-x-6 -bottom-3 top-6 rotate-[2.5deg] rounded-[22px] border border-rule bg-paper-2" />
      <div className="absolute inset-x-3 -bottom-1.5 top-3 -rotate-[1.5deg] rounded-[22px] border border-rule bg-paper-3/60" />

      <motion.div
        layout
        className="card relative overflow-hidden rounded-[22px] p-6 shadow-[0_30px_60px_-34px_rgb(var(--shadow)/0.45)] sm:p-7"
      >
        <div className="flex items-center justify-between">
          <span className="eyebrow">Sealed tip</span>
          <span className="eyebrow">Illustration</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="mt-5 text-sm text-ink-3">To the sponsor of</p>
            <p className="display text-[1.65rem] leading-tight">{sample.program}</p>

            <dl className="mt-5 space-y-3 border-t border-dashed border-rule pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">Candidate</dt>
                <dd className="numeric text-ink">{sample.candidate}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">Who</dt>
                <dd className="text-right font-medium text-ink">{sample.label}</dd>
              </div>
            </dl>

            <div className="ruled mt-4 min-h-[5.5rem] rounded-xl bg-paper px-3.5 py-[0.35rem] text-[0.95rem] leading-8 text-ink-2">
              {note}
              {running && phase === "typing" ? (
                <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-signal" />
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* The seal: a band slides over the note, then the stamp lands. */}
        <motion.div
          aria-hidden="true"
          initial={false}
          animate={{ scaleY: sealed ? 1 : 0, opacity: sealed ? 1 : 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ originY: 0 }}
          className="absolute inset-x-0 bottom-0 top-[42%] bg-[repeating-linear-gradient(135deg,var(--paper-2)_0_10px,var(--paper-3)_10px_11px)]"
        />
        <div className="absolute bottom-5 right-5">
          <AnimatePresence>
            {phase === "sealed" ? <Stamp key={`stamp-${index}`} number={sample.n} size={120} /> : null}
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {phase === "sealed" ? (
            <motion.p
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.25 }}
              className="numeric absolute bottom-7 left-6 max-w-[55%] text-xs leading-relaxed text-ink-2"
            >
              Only the sponsor can read this.
              <br />
              Queue position locked on Monad.
            </motion.p>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </figure>
  );
}
