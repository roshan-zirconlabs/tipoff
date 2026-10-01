import type { Metadata } from "next";
import { CallCard } from "@/components/call-card";
import { ButtonLink } from "@/components/ui";
import { calls } from "@/lib/calls";
import { loadSnapshot } from "@/lib/server/snapshot";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Called it",
  description: "Every call a scout got right, proven on Monad: sealed before the patron acted, paid when they did.",
};

export default async function CallsPage() {
  const snapshot = await loadSnapshot().catch(() => null);
  const all = snapshot ? calls(snapshot) : [];
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <p className="eyebrow">Called it</p>
      <h1 className="display mt-4 text-[clamp(2.8rem,7vw,5rem)]">They saw it first.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">
        Every card here is a tip that was sealed on Monad before a patron paid the creator it named. The timestamp is
        the proof; the payout is the reward. Tips that never won stay sealed forever.
      </p>
      {all.length ? (
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {all.map((c) => (
            <li key={c.tipId}>
              <CallCard call={c} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="card mt-12 flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-ink-2">No calls yet. The first scout to name a creator a patron backs will be here.</p>
          <ButtonLink href="/programs">Find a program</ButtonLink>
        </div>
      )}
    </div>
  );
}
