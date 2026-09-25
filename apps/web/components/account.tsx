"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/client/session";
import { shortAddress } from "@/lib/format";
import { Fingerprint } from "./icons";
import { useSignIn } from "./sign-in";
import { Button, Skeleton } from "./ui";

/** A deterministic two-tone mark from an address, so people recognise accounts at a glance. */
export function AddressMark({ address, size = 28 }: { address: string; size?: number }) {
  const h = Number.parseInt(address.slice(2, 8), 16);
  const angle = h % 360;
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full border border-rule"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(from ${angle}deg, var(--ink) 0 ${(h % 5) * 18 + 90}deg, var(--signal) 0 ${
          (h % 5) * 18 + 140
        }deg, var(--paper-3) 0)`,
      }}
    />
  );
}

export function AccountButton() {
  const session = useSession();
  const signIn = useSignIn();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  if (session.status === "loading") return <Skeleton className="h-9 w-28 rounded-full" />;

  if (session.status !== "unlocked" || !session.profile) {
    return (
      <Button size="sm" variant={session.status === "locked" ? "outline" : "primary"} onClick={() => signIn.open()}>
        <Fingerprint size={16} />
        {session.status === "locked" ? "Unlock" : "Sign in"}
      </Button>
    );
  }

  const { profile } = session;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        aria-expanded={menu}
        aria-haspopup="menu"
        className="flex h-9 items-center gap-2 rounded-full border border-rule bg-card pl-1 pr-3 text-sm font-semibold transition hover:border-rule-strong"
      >
        <AddressMark address={profile.address} />
        <span className="max-w-[8rem] truncate">{profile.name}</span>
        {profile.mode === "dev" ? <span className="font-mono text-[0.6rem] uppercase text-signal-ink">dev</span> : null}
      </button>
      <AnimatePresence>
        {menu ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
            className="card absolute right-0 top-11 z-50 w-64 origin-top-right p-1.5 shadow-[0_24px_50px_-24px_rgb(var(--shadow)/0.4)]"
          >
            <div className="px-3 pb-2 pt-2.5">
              <p className="text-sm font-semibold">{profile.name}</p>
              <button
                type="button"
                className="numeric mt-0.5 text-xs text-ink-3 transition hover:text-ink"
                onClick={() => navigator.clipboard?.writeText(profile.address)}
                title="Copy address"
              >
                {shortAddress(profile.address)} · copy
              </button>
            </div>
            <div className="my-1 h-px bg-rule" />
            {[
              { href: "/me", label: "My tips & payouts" },
              { href: `/scouts/${profile.address}`, label: "Public scout record" },
              { href: "/sponsor/new", label: "Run a program" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setMenu(false)}
                className="block rounded-lg px-3 py-2 text-sm text-ink-2 transition hover:bg-paper-2 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-rule" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                session.lock();
                setMenu(false);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink-2 transition hover:bg-paper-2 hover:text-ink"
            >
              Lock
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                session.forget();
                setMenu(false);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink-3 transition hover:bg-paper-2 hover:text-signal-ink"
            >
              Forget this device
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
