"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address } from "viem";
import { ActionError, canGetTestDollars, getTestDollars } from "@/lib/client/actions";
import { useToast } from "./toast";

/** One-tap test dollars on testnet or the local chain; renders nothing elsewhere. */
export function FaucetButton({
  address,
  className = "underline underline-offset-4",
  label = "Get 1,000 test dollars",
  onDone,
}: {
  address: Address;
  className?: string;
  label?: string;
  onDone?: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!canGetTestDollars) return null;
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={async () => {
        setBusy(true);
        try {
          await getTestDollars(address);
          await qc.invalidateQueries({ queryKey: ["usdc"] });
          toast({
            title: "1,000 test dollars added",
            body: "They have no value; they're for trying Tipoff.",
            tone: "ok",
          });
          onDone?.();
        } catch (err) {
          toast({
            title: "Faucet unavailable",
            body: err instanceof ActionError ? err.message : undefined,
            tone: "error",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Adding…" : label}
    </button>
  );
}
