"use client";

import { motion } from "motion/react";
import { Stamp } from "./stamp";

const STEPS = [
  { day: "Day 2", title: "Scout seals a tip", body: "Ada, building payroll rails. Queue position #0042." },
  { day: "Day 14", title: "Tipping closes", body: "The sponsor has read every tip. Nobody else has." },
  { day: "Day 61", title: "Sponsor pays Ada — quietly", body: "Straight from its treasury. It never presses resolve." },
  { day: "Day 61", title: "Evidence resolves it", body: "Chainlink CRE sees the payment and reports it on-chain." },
  {
    day: "Day 91",
    title: "Scouts get paid",
    body: "Earliest first: 57% · 29% · 14%. The bounty was locked the whole time.",
  },
];

export function BackdoorTimeline() {
  return (
    <div className="relative">
      <div className="absolute left-[1.05rem] top-3 bottom-3 w-px bg-rule md:left-0 md:right-0 md:top-[1.05rem] md:bottom-auto md:h-px md:w-auto" />
      <motion.div
        aria-hidden="true"
        className="absolute left-[1.05rem] top-3 w-px origin-top bg-signal md:left-0 md:top-[1.05rem] md:h-px md:w-full md:origin-left"
        initial={{ scaleY: 0, scaleX: 0 }}
        whileInView={{ scaleY: 1, scaleX: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
        style={{ bottom: "0.75rem" }}
      />
      <ol className="relative grid gap-8 md:grid-cols-5 md:gap-5">
        {STEPS.map((s, i) => (
          <motion.li
            key={s.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ delay: 0.25 + i * 0.38, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative pl-12 md:pl-0 md:pt-12"
          >
            <span
              className={`absolute left-0 top-0 grid size-[2.1rem] place-items-center rounded-full border text-xs font-semibold numeric ${
                i === 2
                  ? "border-ink bg-ink text-paper"
                  : i === 4
                    ? "border-ok bg-ok text-white"
                    : "border-rule-strong bg-card text-ink-2"
              }`}
            >
              {i + 1}
            </span>
            <p className="eyebrow">{s.day}</p>
            <p className="mt-1 text-lg font-semibold leading-snug tracking-[-0.02em]">{s.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{s.body}</p>
            {i === 4 ? (
              <div className="mt-3 hidden md:block">
                <Stamp number="PAID" label="PAID · FIRST CALL · PAID · FIRST CALL ·" tone="ok" size={96} tilt={-10} />
              </div>
            ) : null}
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
