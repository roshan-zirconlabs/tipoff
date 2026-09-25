"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountButton } from "./account";
import { Logo } from "./logo";

const links = [
  { href: "/programs", label: "Programs" },
  { href: "/#how", label: "How it works" },
  { href: "/sponsor/new", label: "For sponsors" },
];

export function Nav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        scrolled
          ? "border-b border-rule bg-[color-mix(in_oklab,var(--paper)_82%,transparent)] backdrop-blur-md"
          : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = l.href !== "/#how" && pathname.startsWith(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    active ? "bg-paper-2 text-ink" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/programs"
            className="rounded-full px-3 py-1.5 text-sm text-ink-2 transition hover:text-ink md:hidden"
          >
            Programs
          </Link>
          <AccountButton />
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-32 border-t border-rule">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-2">
            Sealed scout markets on Monad. Call it first, get paid when they sign — even if they sign quietly.
          </p>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3">Product</p>
          <ul className="space-y-2 text-ink-2">
            <li>
              <Link className="hover:text-ink" href="/programs">
                Open programs
              </Link>
            </li>
            <li>
              <Link className="hover:text-ink" href="/sponsor/new">
                Run a program
              </Link>
            </li>
            <li>
              <Link className="hover:text-ink" href="/me">
                My tips
              </Link>
            </li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3">Guarantees</p>
          <ul className="space-y-2 text-ink-2">
            <li>0.5% fee, capped at 1% in code</li>
            <li>Bounties locked through a 90-day tail</li>
            <li>Losing tips are never revealed</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
