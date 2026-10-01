/**
 * Daily spend caps for the relayer, in wei. Monad charges the gas *limit*, so a relay's cost is known before it is sent:
 * limit × price. Caps apply per actor (the signer of an intent) and globally, and reset on a rolling day.
 *
 * In-memory per server instance. On a single long-lived server that is exact; on serverless it bounds each instance,
 * which is still a hard ceiling per instance and far better than none. Swap `store` for shared storage to make it global.
 */
export class GasBudget {
  private spent = new Map<string, { wei: bigint; resetAt: number }>();

  constructor(
    private readonly caps: { perActorWei: bigint; globalWei: bigint },
    private readonly now: () => number = Date.now,
  ) {}

  private used(key: string): bigint {
    const entry = this.spent.get(key);
    return entry && entry.resetAt > this.now() ? entry.wei : 0n;
  }

  /** Why a spend of `wei` for `actor` would exceed a cap, or null if it fits. */
  check(actor: string, wei: bigint): "actor" | "global" | null {
    if (this.used("*") + wei > this.caps.globalWei) return "global";
    if (this.used(actor) + wei > this.caps.perActorWei) return "actor";
    return null;
  }

  charge(actor: string, wei: bigint): void {
    for (const key of [actor, "*"]) {
      const now = this.now();
      const entry = this.spent.get(key);
      if (!entry || entry.resetAt <= now) this.spent.set(key, { wei, resetAt: now + 86_400_000 });
      else entry.wei += wei;
    }
  }
}

/** Run async functions one at a time, in call order: the relayer's nonce can only advance serially. */
export function serial() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
}
