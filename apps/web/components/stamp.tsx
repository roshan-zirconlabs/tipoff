"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { pad } from "@/lib/format";

/**
 * The ink stamp that seals a tip. The ring text reads like a notary stamp; the number is the tip's place in the queue —
 * the thing that decides who gets paid first.
 */
export function Stamp({
  number,
  label = "SEALED · TIPOFF · SEALED · TIPOFF ·",
  size = 132,
  animate = true,
  tilt = -8,
  tone = "signal",
}: {
  number: number | string;
  label?: string;
  size?: number;
  animate?: boolean;
  tilt?: number;
  tone?: "signal" | "ok" | "ink";
}) {
  const id = useId();
  const color = tone === "ok" ? "var(--ok)" : tone === "ink" ? "var(--ink)" : "var(--signal)";
  const content = typeof number === "number" ? `#${pad(number)}` : number;

  return (
    <motion.div
      aria-label={`Stamp ${content}`}
      role="img"
      initial={animate ? { scale: 1.9, rotate: tilt - 14, opacity: 0, filter: "blur(3px)" } : false}
      animate={{ scale: 1, rotate: tilt, opacity: 1, filter: "blur(0px)" }}
      transition={{ type: "spring", stiffness: 520, damping: 22, mass: 0.9 }}
      style={{ width: size, height: size, color }}
      className="pointer-events-none select-none"
    >
      <svg viewBox="0 0 132 132" width={size} height={size} aria-hidden="true">
        <defs>
          <path id={`${id}-ring`} d="M66 66 m-47 0 a47 47 0 1 1 94 0 a47 47 0 1 1 -94 0" />
          <filter id={`${id}-ink`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.35"
              result="mask"
            />
            <feComposite in="SourceGraphic" in2="mask" operator="in" />
          </filter>
        </defs>
        <g filter={`url(#${id}-ink)`} fill="none" stroke="currentColor">
          <circle cx="66" cy="66" r="61" strokeWidth="3" />
          <circle cx="66" cy="66" r="55" strokeWidth="1" />
          <circle cx="66" cy="66" r="36" strokeWidth="1.5" />
          <text
            fill="currentColor"
            stroke="none"
            fontFamily="var(--font-mono)"
            fontSize="9.5"
            letterSpacing="2.6"
            fontWeight="600"
          >
            <textPath href={`#${id}-ring`} startOffset="0">
              {label}
            </textPath>
          </text>
          <text
            x="66"
            y="72"
            textAnchor="middle"
            fill="currentColor"
            stroke="none"
            fontFamily="var(--font-mono)"
            fontSize={content.length > 6 ? 14 : 17}
            fontWeight="700"
            letterSpacing="0.5"
          >
            {content}
          </text>
        </g>
      </svg>
    </motion.div>
  );
}
