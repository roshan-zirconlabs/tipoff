"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CandidateKind, feeOf, MIN_CLAIM_DAYS, MIN_TAIL_DAYS, payoutSplit } from "@tipoff/core";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { type Address, isAddress, parseUnits } from "viem";
import { ActionError, createProgram, devAction, usdcBalance } from "@/lib/client/actions";
import { useSession } from "@/lib/client/session";
import { config } from "@/lib/config";
import { shortAddress, usdc } from "@/lib/format";
import { ArrowRight, Lock } from "./icons";
import { useSignIn } from "./sign-in";
import { useToast } from "./toast";
import { Button, FieldError, Label } from "./ui";

type Form = {
  title: string;
  sponsorName: string;
  brief: string;
  lookingFor: string;
  bounty: string;
  reward: string;
  topK: number;
  maxTips: number;
  tipDays: number;
  tailDays: number;
  claimDays: number;
  treasuries: string;
  minPayment: string;
};

const initial: Form = {
  title: "",
  sponsorName: "",
  brief: "",
  lookingFor: "",
  bounty: "3000",
  reward: "1000",
  topK: 3,
  maxTips: 3,
  tipDays: 14,
  tailDays: 90,
  claimDays: 30,
  treasuries: "",
  minPayment: "100",
};

function toUnits(v: string): bigint | null {
  try {
    return /^\d+(\.\d{1,6})?$/.test(v) ? parseUnits(v, 6) : null;
  } catch {
    return null;
  }
}

function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (f.title.trim().length < 4) e.title = "Give it a title scouts will understand.";
  const bounty = toUnits(f.bounty);
  const reward = toUnits(f.reward);
  if (!reward || reward === 0n) e.reward = "Enter the amount one hit pays.";
  if (!bounty || bounty === 0n) e.bounty = "Enter the total bounty.";
  else if (reward && (bounty < reward || bounty % reward !== 0n))
    e.bounty = "The bounty must be a whole number of hits.";
  if (f.tailDays < MIN_TAIL_DAYS) e.tailDays = `At least ${MIN_TAIL_DAYS} days.`;
  if (f.claimDays < MIN_CLAIM_DAYS) e.claimDays = `At least ${MIN_CLAIM_DAYS} days.`;
  if (f.tipDays < 1) e.tipDays = "At least one day.";
  const list = f.treasuries.split(/[\s,]+/).filter(Boolean);
  if (list.some((a) => !isAddress(a))) e.treasuries = "One of these isn't a valid address.";
  if (list.length > 5) e.treasuries = "Up to five treasuries.";
  if (toUnits(f.minPayment || "0") === null) e.minPayment = "Enter an amount.";
  return e;
}

export function SponsorForm() {
  const session = useSession();
  const signIn = useSignIn();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(initial);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const me = session.profile?.address;

  const errors = useMemo(() => validate(f), [f]);
  const valid = Object.values(errors).every((v) => !v);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((prev) => ({ ...prev, [k]: v }));

  const balance = useQuery({
    queryKey: ["usdc", me],
    queryFn: () => usdcBalance(me as Address),
    enabled: Boolean(me),
    refetchInterval: 4000,
  });

  const bounty = toUnits(f.bounty) ?? 0n;
  const reward = toUnits(f.reward) ?? 0n;
  const hits = reward > 0n ? Number(bounty / reward) : 0;
  const fee = feeOf(reward, config.feeBps);
  const split = payoutSplit(reward - fee, f.topK);
  const short = balance.data !== undefined && balance.data < bounty;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!session.keys || !session.profile) {
      signIn.open("Sign in to run a program. Your passkey also creates the key that only you can read tips with.");
      return;
    }
    if (!valid) return;
    setBusy(true);
    try {
      const treasuries = f.treasuries.split(/[\s,]+/).filter(Boolean) as Address[];
      const id = await createProgram({
        keys: session.keys,
        profile: session.profile,
        metadata: {
          v: 1,
          title: f.title.trim(),
          sponsorName: f.sponsorName.trim(),
          brief: f.brief.trim(),
          lookingFor: f.lookingFor.trim() || undefined,
          candidateKind: CandidateKind.Wallet,
        },
        bountyUsdc: f.bounty,
        rewardUsdc: f.reward,
        tipDays: f.tipDays,
        tailDays: f.tailDays,
        claimDays: f.claimDays,
        topK: f.topK,
        maxTipsPerScout: f.maxTips,
        treasuries,
        minPaymentUsdc: f.minPayment || "0",
      });
      await qc.invalidateQueries({ queryKey: ["snapshot"] });
      toast({ title: "Program live", body: `$${usdc(bounty)} locked. Scouts can tip now.`, tone: "ok" });
      router.push(`/sponsor/${id}`);
    } catch (err) {
      toast({
        title: "Couldn't open the program",
        body: err instanceof ActionError ? err.message : "Please try again.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const err = (k: keyof Form) => (touched ? errors[k] : undefined);

  return (
    <form onSubmit={submit} noValidate className="grid gap-10 lg:grid-cols-[1.35fr_1fr]">
      <div className="space-y-10">
        <Section n="01" title="The brief" hint="What you're looking for, in words a scout can act on.">
          <div>
            <Label htmlFor="title">Program title</Label>
            <input
              id="title"
              className="field"
              placeholder="Founders we'll fund this quarter"
              value={f.title}
              maxLength={80}
              onChange={(e) => set("title", e.target.value)}
              aria-invalid={Boolean(err("title"))}
            />
            <FieldError>{err("title")}</FieldError>
          </div>
          <div>
            <Label htmlFor="sponsorName" hint="Shown publicly">
              Your name or organisation
            </Label>
            <input
              id="sponsorName"
              className="field"
              placeholder="Northlight Ventures"
              value={f.sponsorName}
              maxLength={60}
              onChange={(e) => set("sponsorName", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="brief">Brief</Label>
            <textarea
              id="brief"
              className="field min-h-24 leading-relaxed"
              placeholder="Pre-seed teams building consumer apps on Monad…"
              value={f.brief}
              maxLength={600}
              onChange={(e) => set("brief", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="lookingFor" hint="Optional">
              What a good tip looks like
            </Label>
            <input
              id="lookingFor"
              className="field"
              placeholder="A shipping team, real users, a reason they're early"
              value={f.lookingFor}
              maxLength={200}
              onChange={(e) => set("lookingFor", e.target.value)}
            />
          </div>
        </Section>

        <Section n="02" title="The bounty" hint="Locked on Monad the moment you open the program.">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="reward">Each hit pays (USDC)</Label>
              <input
                id="reward"
                inputMode="decimal"
                className="field numeric"
                value={f.reward}
                onChange={(e) => set("reward", e.target.value)}
                aria-invalid={Boolean(err("reward"))}
              />
              <FieldError>{err("reward")}</FieldError>
            </div>
            <div>
              <Label htmlFor="bounty" hint={hits ? `${hits} hit${hits === 1 ? "" : "s"}` : undefined}>
                Total bounty (USDC)
              </Label>
              <input
                id="bounty"
                inputMode="decimal"
                className="field numeric"
                value={f.bounty}
                onChange={(e) => set("bounty", e.target.value)}
                aria-invalid={Boolean(err("bounty"))}
              />
              <FieldError>{err("bounty")}</FieldError>
            </div>
          </div>
          <fieldset>
            <legend className="mb-2 flex w-full items-baseline justify-between gap-4">
              <span className="text-sm font-semibold text-ink">Scouts paid per hit</span>
              <span className="text-xs text-ink-3">Earlier scouts earn more</span>
            </legend>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={f.topK === k}
                  onClick={() => set("topK", k)}
                  className={`numeric h-11 rounded-xl border text-sm transition ${
                    f.topK === k ? "border-ink bg-ink text-paper" : "border-rule-strong hover:border-ink"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </fieldset>
        </Section>

        <Section n="03" title="Windows" hint="The tail is what makes quiet deals still pay.">
          <div className="grid gap-5 sm:grid-cols-3">
            <NumberField
              id="tipDays"
              label="Tipping (days)"
              value={f.tipDays}
              min={1}
              onChange={(v) => set("tipDays", v)}
              error={err("tipDays")}
            />
            <NumberField
              id="tailDays"
              label="Tail (days)"
              value={f.tailDays}
              min={MIN_TAIL_DAYS}
              onChange={(v) => set("tailDays", v)}
              error={err("tailDays")}
            />
            <NumberField
              id="claimDays"
              label="Claim (days)"
              value={f.claimDays}
              min={MIN_CLAIM_DAYS}
              onChange={(v) => set("claimDays", v)}
              error={err("claimDays")}
            />
          </div>
          <NumberField
            id="maxTips"
            label="Tips per scout"
            value={f.maxTips}
            min={1}
            onChange={(v) => set("maxTips", v)}
          />
        </Section>

        <Section n="04" title="Evidence" hint="Payments from these wallets to a tipped candidate count as acting.">
          <div>
            <Label htmlFor="treasuries" hint="Comma or space separated, up to 5">
              Treasury wallets
            </Label>
            <textarea
              id="treasuries"
              className="field numeric min-h-20 text-sm"
              placeholder={me ? `Leave empty to use your account (${shortAddress(me)})` : "0x…"}
              value={f.treasuries}
              onChange={(e) => set("treasuries", e.target.value)}
              aria-invalid={Boolean(err("treasuries"))}
            />
            <FieldError>{err("treasuries")}</FieldError>
          </div>
          <div className="sm:max-w-xs">
            <Label htmlFor="minPayment">Smallest payment that counts (USDC)</Label>
            <input
              id="minPayment"
              inputMode="decimal"
              className="field numeric"
              value={f.minPayment}
              onChange={(e) => set("minPayment", e.target.value)}
            />
            <FieldError>{err("minPayment")}</FieldError>
          </div>
        </Section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <motion.div layout className="card overflow-hidden">
          <div className="border-b border-rule bg-paper-2/60 px-6 py-4">
            <p className="eyebrow">Preview</p>
          </div>
          <div className="p-6">
            <p className="display text-[1.7rem] leading-tight">{f.title || "Your program title"}</p>
            <p className="mt-1 text-sm text-ink-3">by {f.sponsorName || "you"}</p>

            <dl className="mt-6 space-y-3 text-sm">
              <Row label="Locked now" value={`$${usdc(bounty)}`} strong />
              <Row label="Hits it covers" value={String(hits || "—")} />
              <Row label="Tipping window" value={`${f.tipDays} days`} />
              <Row label="Tail after that" value={`${f.tailDays} days`} />
            </dl>

            <div className="mt-6 rounded-2xl bg-paper px-4 py-4">
              <p className="eyebrow">Each hit pays</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {split.map((a, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-ink-2">Scout {i + 1}</span>
                    <span className="numeric">${usdc(a)}</span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-rule pt-1.5 text-ink-3">
                  <span>Tipoff fee ({config.feeBps / 100}%)</span>
                  <span className="numeric">${usdc(fee)}</span>
                </li>
              </ul>
            </div>

            {me ? (
              <p className={`mt-5 text-sm ${short ? "text-signal-ink" : "text-ink-3"}`}>
                Your balance: <span className="numeric">${balance.data !== undefined ? usdc(balance.data) : "…"}</span>{" "}
                USDC
                {short && config.devTools ? (
                  <button
                    type="button"
                    className="ml-2 underline underline-offset-4"
                    onClick={async () => {
                      await devAction("faucet", { address: me });
                      await balance.refetch();
                    }}
                  >
                    Mint test USDC
                  </button>
                ) : null}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="signal"
              size="lg"
              className="mt-6 w-full"
              loading={busy}
              disabled={busy || (touched && !valid) || short}
            >
              {session.status === "unlocked" ? (
                <>
                  <Lock size={17} /> Lock ${usdc(bounty)} & open
                </>
              ) : (
                <>
                  Sign in to continue <ArrowRight />
                </>
              )}
            </Button>
            <p className="mt-3 text-center text-xs leading-relaxed text-ink-3">
              You sign with your passkey; Tipoff pays the gas. The bounty returns to you after the tail if it isn't
              used.
            </p>
          </div>
        </motion.div>
      </aside>
    </form>
  );
}

function Section({ n, title, hint, children }: { n: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-5 border-t border-rule pt-8 sm:grid-cols-[8rem_1fr]">
      <div>
        <span className="numeric text-sm text-signal-ink">{n}</span>
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">{title}</h2>
        <p className="mt-1 text-sm leading-snug text-ink-3">{hint}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  onChange: (v: number) => void;
  error?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        className="field numeric"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-invalid={Boolean(error)}
      />
      <FieldError>{error}</FieldError>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-3">{label}</dt>
      <dd className={`numeric ${strong ? "text-lg text-ink" : "text-ink-2"}`}>{value}</dd>
    </div>
  );
}
