import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Spinner } from "./icons";

type Variant = "primary" | "signal" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "group/btn relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold tracking-[-0.01em] transition-[transform,background-color,color,border-color,box-shadow] duration-200 ease-[var(--ease-out-quint)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary:
    "bg-ink text-paper hover:bg-[color-mix(in_oklab,var(--ink)_86%,var(--signal))] shadow-[0_1px_0_rgb(255_255_255/0.12)_inset]",
  signal:
    "bg-signal text-white hover:bg-signal-ink shadow-[0_10px_24px_-12px_color-mix(in_oklab,var(--signal)_80%,transparent)]",
  outline: "border border-rule-strong bg-transparent text-ink hover:border-ink hover:bg-card",
  ghost: "text-ink-2 hover:text-ink hover:bg-paper-2",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-[0.95rem]",
  lg: "h-13 px-7 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      type="button"
      className={buttonClass(variant, size, className)}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: "neutral" | "signal" | "ok" | "ink";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "border-rule bg-paper-2 text-ink-2",
    signal: "border-transparent bg-signal-wash text-signal-ink",
    ok: "border-transparent bg-ok-wash text-ok",
    ink: "border-transparent bg-ink text-paper",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.7rem] uppercase tracking-[0.08em] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span
      className={`relative inline-flex size-2 rounded-full bg-signal [animation:pulse-dot_2s_ease-in-out_infinite] ${className}`}
    />
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className="numeric mt-1.5 truncate text-2xl font-medium text-ink">{value}</p>
      {hint ? <p className="mt-1 text-sm text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function Label({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 flex items-baseline justify-between gap-4">
      <span className="text-sm font-semibold text-ink">{children}</span>
      {hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-2 text-sm text-signal-ink">
      {children}
    </p>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-paper-3/70 ${className}`} />;
}
