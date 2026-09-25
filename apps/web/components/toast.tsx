"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

type Tone = "neutral" | "ok" | "error";
type Toast = { id: number; title: string; body?: string; tone: Tone };

const ToastContext = createContext<((t: Omit<Toast, "id">) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.tone === "error" ? 7000 : 4500);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="pointer-events-auto w-full max-w-sm rounded-2xl border border-rule bg-card px-4 py-3 shadow-[0_18px_40px_-18px_rgb(var(--shadow)/0.35)]"
              role={t.tone === "error" ? "alert" : "status"}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    t.tone === "ok" ? "bg-ok" : t.tone === "error" ? "bg-signal" : "bg-ink-3"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-[0.95rem] font-semibold leading-snug">{t.title}</p>
                  {t.body ? <p className="mt-0.5 text-sm leading-snug text-ink-2">{t.body}</p> : null}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast must be used inside ToastProvider");
  return push;
}
