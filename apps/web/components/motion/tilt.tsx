"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { type ReactNode, useRef } from "react";
import { useMotionReady } from "./use-motion-ready";

/**
 * A card that leans toward the cursor and lifts, like paper picked up off a desk. Same markup on server and client;
 * it only starts responding after mount, never on touch, never for reduced motion. Transforms and springs only.
 */
export function Tilt({ children, className = "", max = 6 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const ready = useMotionReady({ finePointer: true });
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const lift = useMotionValue(0);
  const spring = { stiffness: 260, damping: 22, mass: 0.6 };
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [max, -max]), spring);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-max, max]), spring);
  const y = useSpring(useTransform(lift, [0, 1], [0, -6]), spring);

  return (
    <div
      ref={ref}
      className={`[perspective:900px] ${className}`}
      onPointerMove={(e) => {
        if (!ready || e.pointerType !== "mouse" || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width - 0.5);
        py.set((e.clientY - r.top) / r.height - 0.5);
        lift.set(1);
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
        lift.set(0);
      }}
    >
      <motion.div style={{ rotateX, rotateY, y }} className="h-full [transform-style:preserve-3d]">
        {children}
      </motion.div>
    </div>
  );
}
