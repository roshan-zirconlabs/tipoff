"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CandidateInputError, CandidateKind, MAX_NOTE_CHARS, parseCandidate } from "@tipoff/core";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ActionError, sendTip } from "@/lib/client/actions";
import { useSession } from "@/lib/client/session";
import { explorerTx } from "@/lib/config";
import { pad, shortHash } from "@/lib/format";
import type { ProgramView } from "@/lib/types";
import { ArrowRight, Lock } from "./icons";
import { useSignIn } from "./sign-in";
import { Stamp } from "./stamp";
import { useToast } from "./toast";
import { Button, FieldError, Label } from "./ui";

type Stage = { kind: "form" } | { kind: "sealing" } | { kind: "sealed"; tipId: number; hash: string };

export function TipComposer({ program, used }: { program: ProgramView; used: number }) {
  const session = useSession();
  const signIn = useSignIn();
  const toast = useToast();
  const qc = useQueryClient();
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [candidate, setCandidate] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<{ field?: "candidate"; message: string } | null>(null);

  const kind = program.metadata.candidateKind;
  const left = Math.max(0, program.maxTipsPerScout - used);
  const isSponsor = session.profile?.address.toLowerCase() === program.sponsor.toLowerCase();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!session.keys || !session.profile) {
      signIn.open("Sign in to send a sealed tip. Your passkey creates the key that seals it.");
      return;
    }
    setError(null);
    let ref: ReturnType<typeof parseCandidate>;
    try {
      ref = parseCandidate(kind, candidate);
    } catch (err) {
      setError({
        field: "candidate",
        message: err instanceof CandidateInputError ? err.message : "That candidate isn't valid.",
      });
      return;
    }
    setStage({ kind: "sealing" });
    try {
      const res = await sendTip({ program, candidate: ref, label, note, keys: session.keys, profile: session.profile });
      setStage({ kind: "sealed", tipId: res.tipId, hash: res.hash });
      setCandidate("");
      setLabel("");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["snapshot"] });
    } catch (err) {
      setStage({ kind: "form" });
      const message = err instanceof ActionError ? err.message : "Something went wrong sealing your tip.";
      setError({ message });
      toast({ title: "Tip not sent", body: message, tone: "error" });
    }
  }

  if (isSponsor) {
    return (
      <div className="card p-6">
        <p className="font-semibold">This is your program.</p>
        <p className="mt-1 text-sm text-ink-2">
          Sponsors can't tip their own program. Read incoming tips in your dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="card relative overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        {stage.kind === "sealed" ? (
          <motion.div
            key="sealed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative flex min-h-[26rem] flex-col items-center justify-center px-6 py-10 text-center"
          >
            <Stamp number={stage.tipId} size={150} />
            <h3 className="display mt-6 text-3xl">Tip #{pad(stage.tipId)} sealed.</h3>
            <p className="mt-2 max-w-sm text-ink-2">
              Only the sponsor can read it. Its place in the queue is now fixed on-chain, ahead of every tip that comes
              after.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {left > 0 && (
                <Button variant="outline" onClick={() => setStage({ kind: "form" })}>
                  Send another ({left} left)
                </Button>
              )}
              {explorerTx(stage.hash) ? (
                <a
                  className="numeric self-center text-sm text-ink-3 underline-offset-4 hover:underline"
                  href={explorerTx(stage.hash) ?? "#"}
                >
                  {shortHash(stage.hash)}
                </a>
              ) : (
                <span className="numeric self-center text-sm text-ink-3">{shortHash(stage.hash)}</span>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={submit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-6 sm:p-7"
            noValidate
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Send a sealed tip</h2>
              <span className="numeric text-xs text-ink-3">
                {left} of {program.maxTipsPerScout} left
              </span>
            </div>
            <p className="mt-1.5 text-sm text-ink-2">
              Encrypted to the sponsor before it leaves your device. Nobody else will ever see it unless it wins.
            </p>

            <fieldset disabled={stage.kind === "sealing" || left === 0} className="mt-6 space-y-5">
              <div>
                <Label
                  htmlFor="candidate"
                  hint={kind === CandidateKind.Wallet ? "Where they'd be paid" : "Deezer link or id"}
                >
                  {kind === CandidateKind.Wallet ? "Their wallet on Monad" : "Artist"}
                </Label>
                <input
                  id="candidate"
                  className="field numeric"
                  placeholder={kind === CandidateKind.Wallet ? "0x…" : "https://www.deezer.com/artist/…"}
                  value={candidate}
                  onChange={(e) => setCandidate(e.target.value)}
                  aria-invalid={error?.field === "candidate"}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
                <FieldError>{error?.field === "candidate" ? error.message : null}</FieldError>
              </div>
              <div>
                <Label htmlFor="label" hint="Optional">
                  Who is it?
                </Label>
                <input
                  id="label"
                  className="field"
                  placeholder="Ada — payroll rails for gig workers"
                  maxLength={80}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="note" hint={`${note.length}/${MAX_NOTE_CHARS}`}>
                  Why now?
                </Label>
                <textarea
                  id="note"
                  className="field min-h-28 resize-y leading-relaxed"
                  placeholder="What you've seen that they haven't."
                  maxLength={MAX_NOTE_CHARS}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </fieldset>

            {error && !error.field ? (
              <p role="alert" className="mt-4 rounded-xl bg-signal-wash px-3.5 py-3 text-sm text-signal-ink">
                {error.message}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                variant="signal"
                size="lg"
                loading={stage.kind === "sealing"}
                disabled={left === 0}
                className="w-full sm:w-auto"
              >
                {stage.kind === "sealing" ? (
                  "Sealing…"
                ) : session.status === "unlocked" ? (
                  <>
                    <Lock size={17} /> Seal & send
                  </>
                ) : (
                  <>
                    Sign in to tip <ArrowRight />
                  </>
                )}
              </Button>
              <p className="text-xs text-ink-3">No gas. Tipping is free.</p>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
