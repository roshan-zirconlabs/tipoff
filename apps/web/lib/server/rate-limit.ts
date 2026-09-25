import "server-only";

// Fixed-window limiter, per process. Enough to stop a runaway client from draining the relayer's gas; M3 moves this
// to shared storage with a global daily gas budget.

const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

export function allow(key: string, limit: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}
