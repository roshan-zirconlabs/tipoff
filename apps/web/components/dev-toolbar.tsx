"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { isAddress } from "viem";
import { devAction } from "@/lib/client/actions";
import { listDevIdentities, useSession } from "@/lib/client/session";
import { useChainNow, useSnapshot } from "@/lib/client/snapshot";
import { config } from "@/lib/config";
import { dateTime } from "@/lib/format";
import { useToast } from "./toast";

/** Local-chain controls: move time, fund yourself, and play the sponsor paying a founder behind Tipoff's back. */
export function DevToolbar() {
  if (!config.devTools) return null;
  return <Toolbar />;
}

function Toolbar() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("50");
  const { data } = useSnapshot();
  const now = useChainNow(data?.now);
  const session = useSession();
  const toast = useToast();
  const qc = useQueryClient();

  async function run(key: string, fn: () => Promise<void>, done: string) {
    setBusy(key);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["snapshot"] });
      toast({ title: done, tone: "ok" });
    } catch {
      toast({ title: "Dev action failed", body: "Is the local chain running?", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  const me = session.profile?.address;
  const warps = [
    { label: "+1 day", s: 86_400 },
    { label: "+2 weeks", s: 14 * 86_400 },
    { label: "+31 days", s: 31 * 86_400 },
    { label: "+100 days", s: 100 * 86_400 },
  ];

  return (
    <div className="fixed bottom-4 left-16 z-[65] font-mono text-xs">
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            className="mb-2 w-[19rem] rounded-2xl border border-ink bg-ink p-3 text-paper shadow-2xl"
          >
            <p className="mb-1 uppercase tracking-[0.12em] text-[color-mix(in_oklab,var(--paper)_60%,transparent)]">
              Chain time
            </p>
            <p className="mb-3 text-sm">{dateTime(now)}</p>

            <p className="mb-1.5 uppercase tracking-[0.12em] text-[color-mix(in_oklab,var(--paper)_60%,transparent)]">
              Fast-forward
            </p>
            <div className="mb-3 grid grid-cols-4 gap-1.5">
              {warps.map((w) => (
                <button
                  type="button"
                  key={w.label}
                  disabled={busy !== null}
                  onClick={() => run(w.label, () => devAction("warp", { seconds: w.s }), `Moved ${w.label}`)}
                  className="rounded-lg bg-[color-mix(in_oklab,var(--paper)_12%,transparent)] px-1.5 py-2 transition hover:bg-[color-mix(in_oklab,var(--paper)_22%,transparent)] disabled:opacity-40"
                >
                  {w.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={!me || busy !== null}
              onClick={() => me && run("faucet", () => devAction("faucet", { address: me }), "Minted 10,000 test USDC")}
              className="mb-3 w-full rounded-lg bg-signal px-2 py-2 font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
            >
              {me ? "Mint 10,000 test USDC to me" : "Sign in to mint test USDC"}
            </button>

            {config.demoSponsorSeed ? (
              <button
                type="button"
                onClick={() => {
                  session.enterDevMode("Northlight (demo sponsor)", config.demoSponsorSeed ?? undefined);
                  toast({ title: "Signed in as the demo sponsor", tone: "ok" });
                }}
                className="mb-3 w-full rounded-lg border border-[color-mix(in_oklab,var(--paper)_30%,transparent)] px-2 py-2 transition hover:bg-[color-mix(in_oklab,var(--paper)_10%,transparent)]"
              >
                Sign in as the demo sponsor
              </button>
            ) : null}

            <p className="mb-1.5 uppercase tracking-[0.12em] text-[color-mix(in_oklab,var(--paper)_60%,transparent)]">
              Switch identity
            </p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {listDevIdentities().map((id) => (
                <button
                  key={id.seed}
                  type="button"
                  onClick={() => session.enterDevMode(id.name, id.seed)}
                  className={`rounded-lg px-2 py-1.5 transition ${
                    id.address === me
                      ? "bg-signal text-white"
                      : "bg-[color-mix(in_oklab,var(--paper)_12%,transparent)] hover:bg-[color-mix(in_oklab,var(--paper)_22%,transparent)]"
                  }`}
                >
                  {id.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  session.enterDevMode(
                    `Scout ${Math.floor(Math.random() * 900 + 100)}`,
                    `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")}`,
                  )
                }
                className="rounded-lg border border-dashed border-[color-mix(in_oklab,var(--paper)_35%,transparent)] px-2 py-1.5"
              >
                + new scout
              </button>
            </div>

            <p className="mb-1.5 uppercase tracking-[0.12em] text-[color-mix(in_oklab,var(--paper)_60%,transparent)]">
              Pay from my treasury (off-platform)
            </p>
            <div className="flex gap-1.5">
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="0x founder"
                aria-label="Recipient"
                className="min-w-0 flex-1 rounded-lg bg-[color-mix(in_oklab,var(--paper)_12%,transparent)] px-2 py-2 outline-none placeholder:text-[color-mix(in_oklab,var(--paper)_45%,transparent)]"
              />
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Amount"
                className="w-14 rounded-lg bg-[color-mix(in_oklab,var(--paper)_12%,transparent)] px-2 py-2 outline-none"
              />
            </div>
            <button
              type="button"
              disabled={!me || !isAddress(to) || busy !== null}
              onClick={() =>
                me && run("pay", () => devAction("pay", { from: me, to, amount }), "Paid — the resolver will notice")
              }
              className="mt-1.5 w-full rounded-lg border border-[color-mix(in_oklab,var(--paper)_30%,transparent)] px-2 py-2 transition hover:bg-[color-mix(in_oklab,var(--paper)_10%,transparent)] disabled:opacity-40"
            >
              Send USDC
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-ink bg-ink px-3 py-2 uppercase tracking-[0.12em] text-paper shadow-lg"
      >
        <span className="size-1.5 rounded-full bg-signal" />
        Dev chain
      </button>
    </div>
  );
}
