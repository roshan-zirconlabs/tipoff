"use client";

import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

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

/**
 * Fades content up into place. Pure CSS, so server-rendered content is visible even before (or without) JavaScript,
 * and reduced-motion users get it instantly via the global reduced-motion rule.
 */
export function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Kept for call-site compatibility; every entrance now plays on load. */
  immediate?: boolean;
}) {
  return (
    <div className={`rise ${className}`} style={{ "--rise-delay": `${delay}s` } as CSSProperties}>
      {children}
    </div>
  );
}
