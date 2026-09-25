import type { Metadata } from "next";
import { ProgramsList } from "@/components/programs-list";
import { loadSnapshot } from "@/lib/server/snapshot";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Programs" };

export default async function ProgramsPage() {
  const snapshot = await loadSnapshot().catch(() => null);
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <p className="eyebrow">Programs</p>
      <h1 className="display mt-4 text-[clamp(2.8rem,7vw,5rem)]">Who are they looking for?</h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">
        Every program is a sponsor with money locked on Monad. Pick one you have an eye for and send a sealed tip.
      </p>
      <ProgramsList initial={snapshot} />
    </div>
  );
}
