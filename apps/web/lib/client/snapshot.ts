"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Snapshot } from "../types";

async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch("/api/snapshot", { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't read the chain");
  return res.json();
}

/** Live protocol state, polled every 3 seconds (Monad blocks are ~0.4 s, so this is the UI's bottleneck, not the chain). */
export function useSnapshot(initial?: Snapshot) {
  return useQuery({
    queryKey: ["snapshot"],
    queryFn: fetchSnapshot,
    initialData: initial,
    refetchInterval: 3000,
    staleTime: 1000,
  });
}

/** Chain time that keeps ticking between polls, so countdowns move every second. */
export function useChainNow(snapshotNow: number | undefined): number {
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(snapshotNow ?? Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (snapshotNow === undefined) return;
    setOffset(snapshotNow - Date.now() / 1000);
  }, [snapshotNow]);

  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000 + offset));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offset]);

  return now;
}
