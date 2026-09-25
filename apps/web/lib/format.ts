import { formatUnits } from "viem";

export function usdc(base: string | bigint, opts: { decimals?: number; compact?: boolean } = {}): string {
  const value = Number(formatUnits(typeof base === "bigint" ? base : BigInt(base || 0), 6));
  if (opts.compact && value >= 10_000) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: opts.decimals ?? (value % 1 === 0 ? 0 : 2),
    maximumFractionDigits: opts.decimals ?? 2,
  }).format(value);
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

/** "3d 4h", "5h 12m", "42s" — for countdowns. */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** "in 3 days" / "2 hours ago", relative to chain time. */
export function relative(target: number, now: number): string {
  const diff = target - now;
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (abs >= size || unit === "second") return rtf.format(Math.round(diff / size), unit);
  }
  return "";
}

export function dateTime(ts: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts * 1000));
}

export function pad(n: number, width = 4): string {
  return String(n).padStart(width, "0");
}

export function feeLabel(): string {
  const bps = Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 50);
  return `A ${bps / 100}% fee comes off each paid hit.`;
}
