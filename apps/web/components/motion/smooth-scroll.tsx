"use client";

import Lenis from "lenis";
import { useEffect } from "react";

/**
 * Inertial scrolling on desktop pointers. Touch devices keep native scrolling (it's already smooth and users expect
 * it), and so does anyone who asks the OS for reduced motion.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(pointer: coarse)").matches) return;
    const lenis = new Lenis({ autoRaf: true, lerp: 0.11, anchors: true, wheelMultiplier: 0.95 });
    return () => lenis.destroy();
  }, []);
  return null;
}
