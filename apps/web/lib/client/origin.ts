"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * The page's origin in the browser. Renders "" on the server and during hydration (so markup always matches), then
 * the real origin: callers show a relative path until it arrives.
 */
export function useOrigin(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => "",
  );
}
