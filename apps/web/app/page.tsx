import { BackdoorTimeline } from "@/components/backdoor-timeline";
import { HeroCard } from "@/components/hero-card";
import { ArrowRight } from "@/components/icons";
import { Ledger } from "@/components/ledger";
import { ProgramCard } from "@/components/program-card";
import { FadeIn, RevealWords, Scribble } from "@/components/reveal";
import { ButtonLink } from "@/components/ui";
import { loadSnapshot } from "@/lib/server/snapshot";
import { phaseOf } from "@/lib/types";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    n: "01",
    title: "A sponsor locks a bounty.",
    body: "A fund, label or team says what it's looking for and locks USDC for a set number of hits. It can't take the money back until the tail period ends.",
  },
  {
    n: "02",
    title: "Scouts send sealed tips.",
    body: "You name who you think they'll back and why. It's encrypted to the sponsor, so competitors see nothing, and its place in the queue is fixed on Monad.",
  },
  {
    n: "03",
    title: "They act. You get paid.",
    body: "When the sponsor funds, signs or hires your pick, the three earliest scouts split the hit. If the sponsor never says so, evidence does.",
  },
];

export default async function Home() {
  const snapshot = await loadSnapshot().catch(() => null);
  const open = snapshot?.programs.filter((p) => phaseOf(p, snapshot.now) === "tipping").slice(0, 3) ?? [];

  return (
    <>
      <section className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-10 sm:px-6 md:pt-16 lg:grid-cols-[1.12fr_1fr] lg:gap-10 lg:pb-28">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-signal" />
            Sealed scout markets · on Monad
          </p>
          <h1 className="display mt-6 text-[clamp(3.3rem,9vw,6.6rem)]">
            <RevealWords text="Call it" />{" "}
            <Scribble>
              <RevealWords text="first." delay={0.14} />
            </Scribble>
            <br />
            <span className="text-ink-2">
              <RevealWords text="Get paid when they sign." delay={0.3} />
            </span>
          </h1>
          <FadeIn delay={0.5} immediate>
            <p className="mt-7 max-w-[34rem] text-lg leading-relaxed text-ink-2">
              Sponsors put up a bounty for the founders, artists or engineers they want to find. You send a sealed tip.
              If they back your pick, even quietly, the earliest scouts get paid.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <ButtonLink href="/programs" size="lg">
                Browse open programs <ArrowRight className="transition group-hover/btn:translate-x-0.5" />
              </ButtonLink>
              <ButtonLink href="/sponsor/new" size="lg" variant="outline">
                Run a program
              </ButtonLink>
            </div>
            <p className="mt-6 text-sm text-ink-3">Face ID sign-in · no seed phrase · no gas</p>
          </FadeIn>
        </div>
        <FadeIn delay={0.25} immediate>
          <HeroCard />
        </FadeIn>
      </section>

      <Ledger initial={snapshot} />

      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 sm:px-6">
        <FadeIn>
          <p className="eyebrow">How it works</p>
          <h2 className="display mt-4 max-w-3xl text-[clamp(2.4rem,5.5vw,4rem)]">
            Scouting has always run on trust. This runs on receipts.
          </h2>
        </FadeIn>
        <ol className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-rule bg-rule md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.n} className="bg-paper p-7 sm:p-8">
              <FadeIn delay={i * 0.08}>
                <span className="numeric text-5xl font-light text-signal">{s.n}</span>
                <h3 className="mt-6 text-xl font-semibold tracking-[-0.02em]">{s.title}</h3>
                <p className="mt-3 leading-relaxed text-ink-2">{s.body}</p>
              </FadeIn>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <FadeIn>
            <p className="eyebrow">The part nobody else does</p>
            <h2 className="display mt-4 text-[clamp(2.4rem,5.5vw,4rem)]">The deal they tried to hide still pays.</h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="max-w-xl text-lg leading-relaxed text-ink-2">
              Scout programs break when a sponsor reads your tip, waits, and does the deal directly. Tipoff keeps the
              bounty locked for 90 days after tipping closes, and watches the sponsor's declared treasury. A payment to
              your pick counts as acting, whether or not they admit it.
            </p>
          </FadeIn>
        </div>
        <div className="card mt-14 p-7 sm:p-10">
          <BackdoorTimeline />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
        <div className="grid gap-px overflow-hidden rounded-3xl border border-rule bg-rule sm:grid-cols-3">
          {[
            { big: "0.5%", small: "Platform fee on paid hits, capped at 1% in the contract." },
            { big: "90 days", small: "Minimum tail after tipping closes. The bounty can't leave before then." },
            { big: "0", small: "Losing tips revealed. Only winning tips are ever opened." },
          ].map((f, i) => (
            <FadeIn key={f.big} delay={i * 0.08} className="bg-paper p-8">
              <p className="display text-6xl">{f.big}</p>
              <p className="mt-4 max-w-[16rem] leading-relaxed text-ink-2">{f.small}</p>
            </FadeIn>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <FadeIn>
            <p className="eyebrow">Open now</p>
            <h2 className="display mt-4 text-[clamp(2.2rem,5vw,3.4rem)]">Programs taking tips</h2>
          </FadeIn>
          <ButtonLink href="/programs" variant="ghost">
            All programs <ArrowRight />
          </ButtonLink>
        </div>
        {open.length ? (
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {open.map((p) => (
              <ProgramCard key={p.id} program={p} now={snapshot?.now ?? 0} />
            ))}
          </div>
        ) : (
          <div className="card mt-10 flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold">
                {snapshot ? "No programs are taking tips right now." : "The chain isn't reachable right now."}
              </p>
              <p className="mt-1 text-ink-2">
                {snapshot ? "Be the first sponsor. It takes about two minutes." : "Live programs will show up here."}
              </p>
            </div>
            <ButtonLink href="/sponsor/new">Start a program</ButtonLink>
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
        <FadeIn>
          <div className="relative overflow-hidden rounded-[28px] bg-ink px-7 py-14 text-paper sm:px-14 sm:py-20">
            <div className="absolute -right-24 -top-24 size-72 rounded-full border border-[color-mix(in_oklab,var(--paper)_14%,transparent)]" />
            <div className="absolute -right-10 -top-10 size-44 rounded-full border border-[color-mix(in_oklab,var(--paper)_14%,transparent)]" />
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-[color-mix(in_oklab,var(--paper)_55%,transparent)]">
              For funds, labels & teams
            </p>
            <h2 className="display mt-5 max-w-3xl text-[clamp(2.4rem,5.5vw,4.2rem)]">
              A scout network that only costs you when it works.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[color-mix(in_oklab,var(--paper)_72%,transparent)]">
              Anyone, anywhere can tip you. You read every tip privately, act on what's good, and pay only for the hits,
              with the earliest caller always first in line.
            </p>
            <div className="mt-10">
              <ButtonLink href="/sponsor/new" variant="signal" size="lg">
                Run a program <ArrowRight />
              </ButtonLink>
            </div>
          </div>
        </FadeIn>
      </section>
    </>
  );
}
