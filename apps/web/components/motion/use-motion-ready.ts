"use client";

import { useEffect, useState } from "react";

/**
 * False on the server and on the first client render (so markup always hydrates identically), then true once mounted,
 * unless the visitor asked the OS for reduced motion, or `finePointer` is set and they're on touch.
 */
export function useMotionReady({ finePointer = false }: { finePointer?: boolean } = {}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = matchMedia("(pointer: coarse)").matches;
    setReady(!reduce && !(finePointer && coarse));
  }, [finePointer]);
  return ready;
}
