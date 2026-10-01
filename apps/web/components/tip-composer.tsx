"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CandidateInputError, CandidateKind, MAX_NOTE_CHARS, parseCandidate, stakeBoost } from "@tipoff/core";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { ActionError, sendTip } from "@/lib/client/actions";
import { useSession } from "@/lib/client/session";
import { explorerTx } from "@/lib/config";
import { dateTime, pad, shortHash, usdc } from "@/lib/format";
import type { ProgramView } from "@/lib/types";
import { FaucetButton } from "./faucet-button";
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
  const [stakeInput, setStakeInput] = useState(() => formatUnits(BigInt(program.minStake), 6));
  const [error, setError] = useState<{ field?: "candidate" | "stake"; message: string } | null>(null);

  const kind = program.metadata.candidateKind;
  const left = Math.max(0, program.maxTipsPerScout - used);
  const isSponsor = session.profile?.address.toLowerCase() === program.sponsor.toLowerCase();
  const curve = { baseWeight: BigInt(program.baseWeight), curveDepth: BigInt(program.curveDepth) };
  const stake = parseStake(stakeInput);
  const boost = stake === null ? null : stakeBoost(stake, curve);
  const scale = BigInt(program.curveDepth);
  const presets = [BigInt(program.minStake), scale / 4n, scale, scale * 3n].filter(
    (v, i, all) => all.indexOf(v) === i && v >= BigInt(program.minStake),
  );

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
    if (stake === null || stake < BigInt(program.minStake)) {
      setError({
        field: "stake",
        message:
          stake === null
            ? "Enter an amount in USDC, like 5 or 2.5."
            : `The minimum stake is $${usdc(program.minStake)}.`,
      });
      return;
    }
    setStage({ kind: "sealing" });
    try {
      const res = await sendTip({
        program,
        candidate: ref,
        label,
        note,
        stake,
        keys: session.keys,
        profile: session.profile,
      });
      setStage({ kind: "sealed", tipId: res.tipId, hash: res.hash });
      setCandidate("");
      setLabel("");
      setNote("");
      setStakeInput(formatUnits(BigInt(program.minStake), 6));
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
          Patrons can't tip their own program. Read incoming tips in your dashboard.
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
              Only the patron can read it. Its place in the queue is now fixed on-chain, ahead of every tip that comes
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
              Encrypted to the patron before it leaves your device. Nobody else will ever see it unless it wins.
            </p>

            <fieldset disabled={stage.kind === "sealing" || left === 0} className="mt-6 space-y-5">
              <div>
                <Label
                  htmlFor="candidate"
                  hint={kind === CandidateKind.Wallet ? "Where they'd be paid" : "Deezer link or id"}
                >
                  {kind === CandidateKind.Wallet ? "The creator's wallet" : "Artist"}
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
                  placeholder="Mira Osei — generative textiles"
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
              <div>
                <Label
                  htmlFor="stake"
                  hint={BigInt(program.minStake) > 0n ? `Min $${usdc(program.minStake)}` : "Optional"}
                >
                  Back it with a stake
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-32">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">$</span>
                    <input
                      id="stake"
                      className="field numeric pl-7"
                      inputMode="decimal"
                      value={stakeInput}
                      onChange={(e) => setStakeInput(e.target.value)}
                      aria-invalid={error?.field === "stake"}
                      aria-describedby="stake-effect"
                      autoComplete="off"
                    />
                  </div>
                  {presets.map((v) => (
                    <button
                      key={`${v}`}
                      type="button"
                      onClick={() => setStakeInput(formatUnits(v, 6))}
                      aria-pressed={stake === v}
                      className="numeric h-9 rounded-full border border-rule px-3 text-sm text-ink-2 transition hover:border-ink hover:text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
                    >
                      {v === 0n ? "None" : `$${usdc(v)}`}
                    </button>
                  ))}
                </div>
                <FieldError>{error?.field === "stake" ? error.message : null}</FieldError>
                <p id="stake-effect" className="mt-2 text-sm leading-relaxed text-ink-3">
                  {boost !== null && stake !== null && stake > 0n && stake >= BigInt(program.minStake) ? (
                    <>
                      Lifts this tip's share of a hit at least{" "}
                      <span className="numeric font-semibold text-ink">×{boost.toFixed(2)}</span>. Refunded in full when
                      tipping closes on {dateTime(program.tipDeadline)}, win or lose.
                    </>
                  ) : (
                    <>
                      Conviction, not a bet: a stake raises your share if this candidate wins and comes back in full
                      when tipping closes, either way. Only the patron can see which candidate it backs.
                    </>
                  )}
                </p>
              </div>
            </fieldset>

            {error && !error.field ? (
              <p role="alert" className="mt-4 rounded-xl bg-signal-wash px-3.5 py-3 text-sm text-signal-ink">
                {error.message}
                {session.profile && /holds/.test(error.message) ? (
                  <>
                    {" "}
                    <FaucetButton address={session.profile.address} onDone={() => setError(null)} />
                  </>
                ) : null}
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
              <p className="text-xs text-ink-3">
                {stake && stake > 0n
                  ? `No gas. $${usdc(stake)} is held until tipping closes.`
                  : "No gas. Tipping is free."}
              </p>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function parseStake(raw: string): bigint | null {
  const v = raw.trim().replace(/^\$/, "");
  if (v === "") return 0n;
  if (!/^\d+(\.\d{0,6})?$/.test(v)) return null;
  return parseUnits(v, 6);
}
