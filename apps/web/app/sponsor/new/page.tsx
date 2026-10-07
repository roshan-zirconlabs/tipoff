import type { Metadata } from "next";
import { type Prefill, SponsorForm } from "@/components/sponsor-form";

export const metadata: Metadata = { title: "Run a program" };

type Search = Record<string, string | string[] | undefined>;

const text = (v: string | string[] | undefined, max: number) =>
  typeof v === "string" ? v.replace(/[<>]/g, "").slice(0, max) : undefined;
const amount = (v: string | string[] | undefined) =>
  typeof v === "string" && /^\d{1,9}(\.\d{1,6})?$/.test(v) ? v : undefined;

/** An invite link from the Tipoff team pre-fills the program; the patron still signs and funds it with their passkey. */
function prefillFrom(q: Search): Prefill {
  const days = Number(q.days);
  return {
    title: text(q.title, 80),
    sponsorName: text(q.name, 60),
    brief: text(q.brief, 600),
    lookingFor: text(q.looking, 280),
    bounty: amount(q.bounty),
    reward: amount(q.reward),
    tipDays: Number.isInteger(days) && days >= 1 && days <= 60 ? days : undefined,
  };
}

export default async function NewProgramPage({ searchParams }: { searchParams: Promise<Search> }) {
  const prefill = Object.fromEntries(
    Object.entries(prefillFrom(await searchParams)).filter(([, v]) => v !== undefined),
  ) as Prefill;
  const invited = Object.keys(prefill).length > 0;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <p className="eyebrow">For patrons</p>
      <h1 className="display mt-4 max-w-3xl text-[clamp(2.8rem,7vw,5rem)]">
        {invited ? "Your program is ready to open." : "Open a scout program."}
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">
        {invited
          ? "We've filled in the details. Sign in with a passkey, get test dollars from the menu, check everything, and tap open. Tips are sealed to your passkey, so only you will ever read them."
          : "Lock a bounty, read every tip privately, and pay only for the ones you act on. It takes about two minutes and you never touch gas."}
      </p>
      <div className="mt-12">
        <SponsorForm prefill={prefill} />
      </div>
    </div>
  );
}
