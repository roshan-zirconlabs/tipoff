"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/lib/client/session";
import { config } from "@/lib/config";
import { Close, Fingerprint } from "./icons";
import { Button } from "./ui";

type Ctx = { open: (reason?: string) => void };
const SignInContext = createContext<Ctx | null>(null);

export function useSignIn(): Ctx {
  const ctx = useContext(SignInContext);
  if (!ctx) throw new Error("useSignIn must be used inside SignInProvider");
  return ctx;
}

export function SignInProvider({ children }: { children: ReactNode }) {
  const [reason, setReason] = useState<string | null>(null);
  const [isOpen, setOpen] = useState(false);
  const open = useCallback((why?: string) => {
    setReason(why ?? null);
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <SignInContext value={value}>
      {children}
      <SignInDialog open={isOpen} reason={reason} onClose={() => setOpen(false)} />
    </SignInContext>
  );
}

function SignInDialog({ open, reason, onClose }: { open: boolean; reason: string | null; onClose: () => void }) {
  const session = useSession();
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const hasProfile = session.profile !== null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset once each time the dialog opens
  useEffect(() => {
    if (!open) return;
    session.clearError();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (open && session.status === "unlocked") onClose();
  }, [open, session.status, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-[rgb(23_21_15/0.42)] backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="signin-title"
            initial={{ y: 28, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="card relative w-full max-w-[26rem] overflow-hidden p-6 shadow-[0_40px_80px_-30px_rgb(var(--shadow)/0.45)] sm:p-7"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-ink-3 transition hover:bg-paper-2 hover:text-ink"
              aria-label="Close"
            >
              <Close />
            </button>

            <div className="grid size-12 place-items-center rounded-2xl bg-ink text-paper">
              <Fingerprint size={24} />
            </div>
            <h2 id="signin-title" className="display mt-5 text-[2rem]">
              {hasProfile ? "Welcome back." : "Your passkey is your account."}
            </h2>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">
              {reason ??
                "No seed phrase, no extension, no gas. Face ID or Touch ID creates your account and the key that seals your tips."}
            </p>

            <div className="mt-6 space-y-3">
              {hasProfile ? (
                <Button className="w-full" size="lg" loading={session.busy} onClick={() => session.unlock()}>
                  Unlock as {session.profile?.name}
                </Button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    session.createAccount(name);
                  }}
                  className="space-y-3"
                >
                  <label htmlFor="signin-name" className="sr-only">
                    Name for your passkey
                  </label>
                  <input
                    ref={inputRef}
                    id="signin-name"
                    className="field"
                    placeholder="What should we call you?"
                    autoComplete="nickname"
                    maxLength={40}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Button type="submit" className="w-full" size="lg" loading={session.busy}>
                    Create passkey
                  </Button>
                </form>
              )}

              <Button variant="outline" className="w-full" disabled={session.busy} onClick={() => session.unlock()}>
                {hasProfile ? "Use a different passkey" : "I already have a passkey"}
              </Button>

              {config.devTools ? (
                <button
                  type="button"
                  onClick={() => session.enterDevMode(name || "Dev scout")}
                  className="w-full rounded-full py-2 font-mono text-xs uppercase tracking-[0.12em] text-ink-3 transition hover:text-ink"
                >
                  Local dev: use a throwaway key
                </button>
              ) : null}
            </div>

            <AnimatePresence>
              {session.error ? (
                <motion.p
                  role="alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 rounded-xl bg-signal-wash px-3.5 py-3 text-sm leading-snug text-signal-ink"
                >
                  {session.error}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
