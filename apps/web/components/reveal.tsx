"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Words rise into place one after another. Used for the few headlines that earn it. */
export function RevealWords({ text, className = "", delay = 0 }: { text: string; className?: string; delay?: number }) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span
            className="inline-block"
            initial={{ y: "105%" }}
            animate={{ y: 0 }}
            transition={{ delay: delay + i * 0.07, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** A hand-drawn underline that draws itself under a word. */
export function Scribble({ children, delay = 0.7 }: { children: ReactNode; delay?: number }) {
  return (
    <span className="relative inline-block">
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 300 24"
        preserveAspectRatio="none"
        className="absolute -bottom-[0.12em] left-[-2%] h-[0.28em] w-[104%] text-signal"
      >
        <motion.path
          d="M4 16 C 60 6, 120 20, 176 11 S 262 6, 296 13"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay, duration: 0.7, ease: [0.65, 0, 0.35, 1] }}
        />
      </svg>
    </span>
  );
}

/** Fades content up when it scrolls into view — or on mount with `immediate`, for anything above the fold. */
export function FadeIn({
  children,
  delay = 0,
  className = "",
  immediate = false,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  immediate?: boolean;
}) {
  const reveal = { opacity: 1, y: 0 };
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      {...(immediate ? { animate: reveal } : { whileInView: reveal, viewport: { once: true, amount: 0.3 } })}
      transition={{ delay, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
