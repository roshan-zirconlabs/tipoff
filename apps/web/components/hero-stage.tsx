"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { HeroCard } from "./hero-card";

type Depth = number;

/**
 * The hero as a little floating world: the sealed tip in the middle, and around it the four moments that make Tipoff
 * work, drifting on their own and leaning with the cursor at different depths. Everything is transform-only.
 */
export function HeroStage() {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 90, damping: 18, mass: 0.8 });
  const sy = useSpring(my, { stiffness: 90, damping: 18, mass: 0.8 });

  return (
    <div
      className="relative mx-auto w-full max-w-[34rem] py-10 sm:py-14"
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      <Layer depth={0.35} sx={sx} sy={sy} className="absolute inset-6 -z-10">
        <div className="size-full rounded-full border border-rule/70 [mask-image:radial-gradient(circle,black_55%,transparent_72%)]" />
      </Layer>

      <Layer depth={0.6} sx={sx} sy={sy}>
        <Float period="9s" rise="-10px" tilt="-0.6deg">
          <HeroCard />
        </Float>
      </Layer>

      <Satellite
        depth={1.5}
        sx={sx}
        sy={sy}
        className="-left-2 top-2 lg:-left-6 xl:-left-14"
        period="7.5s"
        delay="-1s"
        tilt="-2deg"
      >
        <span className="grid size-8 place-items-center rounded-full bg-signal-wash text-xs font-semibold text-signal-ink">
          NB
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold">Nala Bloom</span>
          <span className="numeric block text-[0.7rem] text-ok">@nalabloom · verified</span>
        </span>
      </Satellite>

      <Satellite
        depth={1.1}
        sx={sx}
        sy={sy}
        className="-right-1 top-16 hidden sm:block lg:-right-4 xl:-right-12"
        period="8.5s"
        delay="-3s"
        tilt="2deg"
      >
        <span className="numeric text-sm font-semibold">$250 staked</span>
        <span className="text-[0.72rem] text-ink-3">refunded either way</span>
      </Satellite>

      <Satellite
        depth={1.8}
        sx={sx}
        sy={sy}
        className="-left-3 bottom-20 hidden sm:flex lg:-left-8 xl:-left-16"
        period="10s"
        delay="-5s"
        tilt="1.5deg"
      >
        <span className="size-2 rounded-full bg-ok" />
        <span className="text-[0.78rem] leading-tight">
          Patron paid quietly
          <span className="block text-ink-3">seen on-chain by Chainlink CRE</span>
        </span>
      </Satellite>

      <Satellite
        depth={1.35}
        sx={sx}
        sy={sy}
        className="-bottom-1 right-2 lg:-right-2 xl:-right-8"
        period="6.8s"
        delay="-2s"
        tilt="-1.5deg"
        accent
      >
        <span className="leading-tight">
          <span className="eyebrow block text-[0.62rem] text-[color-mix(in_oklab,var(--paper)_70%,transparent)]">
            called it
          </span>
          <span className="block text-base font-semibold">41 days early</span>
        </span>
        <span className="numeric rounded-full bg-[color-mix(in_oklab,var(--paper)_14%,transparent)] px-2 py-1 text-xs">
          +$995
        </span>
      </Satellite>
    </div>
  );
}

function Layer({
  depth,
  sx,
  sy,
  className = "",
  children,
}: {
  depth: Depth;
  sx: ReturnType<typeof useSpring>;
  sy: ReturnType<typeof useSpring>;
  className?: string;
  children: ReactNode;
}) {
  const x = useTransform(sx, (v) => v * 28 * depth);
  const y = useTransform(sy, (v) => v * 22 * depth);
  return (
    <motion.div className={className} style={{ x, y }}>
      {children}
    </motion.div>
  );
}

function Float({
  children,
  period,
  delay = "0s",
  rise = "-12px",
  tilt = "0deg",
}: {
  children: ReactNode;
  period: string;
  delay?: string;
  rise?: string;
  tilt?: string;
}) {
  return (
    <div
      className="float"
      style={
        {
          "--float-period": period,
          "--float-delay": delay,
          "--float-rise": rise,
          "--float-tilt": tilt,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

function Satellite({
  depth,
  sx,
  sy,
  className,
  period,
  delay,
  tilt,
  accent = false,
  children,
}: {
  depth: Depth;
  sx: ReturnType<typeof useSpring>;
  sy: ReturnType<typeof useSpring>;
  className: string;
  period: string;
  delay: string;
  tilt: string;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <Layer depth={depth} sx={sx} sy={sy} className={`absolute z-10 ${className}`}>
      <Float period={period} delay={delay} tilt={tilt} rise="-9px">
        <div
          className={`flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 shadow-[0_18px_40px_-22px_rgb(var(--shadow)/0.55)] backdrop-blur-md ${
            accent
              ? "border-transparent bg-ink text-paper"
              : "border-rule bg-[color-mix(in_oklab,var(--card)_86%,transparent)]"
          }`}
        >
          {children}
        </div>
      </Float>
    </Layer>
  );
}
