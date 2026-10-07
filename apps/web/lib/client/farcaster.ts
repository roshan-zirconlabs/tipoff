"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FarcasterProfile } from "../farcaster-types";

/** Debounced Farcaster lookup by handle. `data` is null when no such user exists. */
export function useFarcasterProfile(handle: string | null) {
  const [debounced, setDebounced] = useState(handle);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(handle), 350);
    return () => clearTimeout(id);
  }, [handle]);
  const query = useQuery({
    queryKey: ["farcaster", debounced],
    enabled: Boolean(debounced),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<FarcasterProfile | null> => {
      const res = await fetch(`/api/farcaster/${encodeURIComponent(debounced as string)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Farcaster lookup failed");
      return (await res.json()) as FarcasterProfile;
    },
  });
  return { ...query, settling: handle !== debounced || query.isFetching };
}
