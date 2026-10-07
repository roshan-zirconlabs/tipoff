"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { canGetTestDollars } from "@/lib/client/actions";
import { useSession } from "@/lib/client/session";
import { tokenLabel } from "@/lib/config";
import { FaucetButton } from "./faucet-button";
import { ArrowRight } from "./icons";
import { buttonClass } from "./ui";

const seenKey = (address: string) => `tipoff:welcomed:${address.toLowerCase()}`;

/** First time an account is unlocked on this device: say what to do next, and hand over test dollars on testnet. */
export function Welcome() {
  const { status, profile } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (status !== "unlocked" || !profile) return;
    try {
      if (!localStorage.getItem(seenKey(profile.address))) setOpen(true);
    } catch {}
  }, [status, profile]);

  const close = () => {
    setOpen(false);
    try {
      if (profile) localStorage.setItem(seenKey(profile.address), "1");
    } catch {}
  };

  return (
    <AnimatePresence>
      {open && profile ? (
        <motion.div
          role="dialog"
          aria-modal="false"
          aria-labelledby="welcome-title"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16, transition: { duration: 0.15 } }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="card fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md p-6 shadow-[0_30px_60px_-30px_rgb(var(--shadow)/0.5)] sm:bottom-6"
        >
          <p className="eyebrow">You're in</p>
          <h2 id="welcome-title" className="display mt-2 text-3xl">
            Welcome, {profile.name}.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            Your passkey is your account: no seed phrase, no gas. Here's how to start.
          </p>
          <ol className="mt-5 space-y-3 text-sm">
            {canGetTestDollars ? (
              <li className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3.5 py-3">
                <span>
                  <span className="numeric text-signal-ink">1</span> Grab some {tokenLabel} to try it
                </span>
                <FaucetButton address={profile.address} label="Get 1,000" className={buttonClass("signal", "sm")} />
              </li>
            ) : null}
            <li>
              <Link
                href="/programs"
                onClick={close}
                className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3.5 py-3 transition hover:bg-paper-2"
              >
                <span>
                  <span className="numeric text-signal-ink">{canGetTestDollars ? 2 : 1}</span> Tip off a creator you
                  spotted early
                </span>
                <ArrowRight size={16} />
              </Link>
            </li>
            <li>
              <Link
                href="/sponsor/new"
                onClick={close}
                className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3.5 py-3 transition hover:bg-paper-2"
              >
                <span>
                  <span className="text-ink-3">or</span> run a program as a patron
                </span>
                <ArrowRight size={16} />
              </Link>
            </li>
          </ol>
          <button type="button" onClick={close} className="mt-4 text-sm text-ink-3 transition hover:text-ink">
            Not now
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
