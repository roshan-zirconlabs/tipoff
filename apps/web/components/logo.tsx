import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" aria-label="Tipoff home" className={`group inline-flex items-center gap-2 ${className}`}>
      <span className="relative grid size-7 place-items-center rounded-full bg-ink text-paper transition-transform duration-300 ease-[var(--ease-stamp)] group-hover:-rotate-12">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path d="M4 7.5h16M12 7.5V20" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="18.5" cy="18.5" r="2.6" fill="var(--signal)" />
        </svg>
      </span>
      <span className="display text-[1.35rem] leading-none tracking-[-0.045em]">tipoff</span>
    </Link>
  );
}
