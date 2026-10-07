"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { type ReactNode, useRef } from "react";
import { useMotionReady } from "./use-motion-ready";

/**
 * Moves its content at a different speed from the page as it scrolls past: `speed` 0.1 drifts 10% of its height over
 * the pass. Starts at rest (identical server and client markup), engages after mount, off for reduced motion.
 */
export function Parallax({
  children,
  speed = 0.1,
  className = "",
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ready = useMotionReady();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, (p) => (ready ? `${(0.5 - p) * 2 * speed * 100}%` : "0%"));
  return (
    <motion.div ref={ref} className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}
