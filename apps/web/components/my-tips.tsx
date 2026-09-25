"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CandidateKind } from "@tipoff/core";
import Link from "next/link";
import { useState } from "react";
import { ActionError, claimTip } from "@/lib/client/actions";
import { type OpenedTipView, type TipStatus, tipStatus } from "@/lib/client/tips";
import { dateTime, duration, pad, shortAddress, usdc } from "@/lib/format";
import type { ProgramView } from "@/lib/types";
import { useToast } from "./toast";
import { Badge, Button } from "./ui";

function StatusBadge({ status, now }: { status: TipStatus; now: number }) {
  switch (status.kind) {
    case "sealed":
      return <Badge>Sealed · waiting</Badge>;
    case "claimable":
      return <Badge tone="signal">Won · claim within {duration(status.hit.claimDeadline - now)}</Badge>;
    case "claimed":
      return <Badge tone="ok">Claimed · pays {dateTime(status.hit.claimDeadline)}</Badge>;
    case "paid":
      return <Badge tone="ok">Paid ${usdc(status.amount)}</Badge>;
    case "outranked":
      return <Badge>Earlier scouts took the paid spots</Badge>;
    case "too-late":
      return <Badge>Sent after they acted</Badge>;
    case "missed":
      return <Badge>Claim window closed</Badge>;
  }
}

export function MyTipRow({
  tip,
  program,
  now,
  showProgram = false,
}: {
  tip: OpenedTipView;
  program: ProgramView | undefined;
  now: number;
  showProgram?: boolean;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const status = tipStatus(tip, program, now);
  const p = tip.plaintext;

  async function claim() {
    if (!p || !tip.candidateId) return;
    setBusy(true);
    try {
      await claimTip(tip.tipId, tip.candidateId, p.salt);
      await qc.invalidateQueries({ queryKey: ["snapshot"] });
      toast({
        title: `Tip #${pad(tip.tipId)} claimed`,
        body: "You're in the payout. It settles when the claim window closes.",
        tone: "ok",
      });
    } catch (err) {
      toast({ title: "Couldn't claim", body: err instanceof ActionError ? err.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="numeric text-sm font-semibold text-signal-ink">#{pad(tip.tipId)}</span>
          <span className="truncate font-medium">
            {p?.label ||
              (p
                ? p.candidate.kind === CandidateKind.Wallet
                  ? shortAddress(p.candidate.value)
                  : `Artist #${p.candidate.value}`
                : "Unreadable tip")}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-3">
          {showProgram && program ? (
            <>
              <Link href={`/programs/${program.id}`} className="hover:text-ink">
                {program.metadata.title}
              </Link>{" "}
              ·{" "}
            </>
          ) : null}
          sealed {dateTime(tip.committedAt)}
          {p && p.candidate.kind === CandidateKind.Wallet ? (
            <span className="numeric"> · {shortAddress(p.candidate.value)}</span>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status={status} now={now} />
        {status.kind === "claimable" ? (
          <Button size="sm" variant="signal" loading={busy} onClick={claim}>
            Claim
          </Button>
        ) : null}
      </div>
    </li>
  );
}
