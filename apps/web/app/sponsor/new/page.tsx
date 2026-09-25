import type { Metadata } from "next";
import { SponsorForm } from "@/components/sponsor-form";

export const metadata: Metadata = { title: "Run a program" };

export default function NewProgramPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <p className="eyebrow">For sponsors</p>
      <h1 className="display mt-4 max-w-3xl text-[clamp(2.8rem,7vw,5rem)]">Open a scout program.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">
        Lock a bounty, read every tip privately, and pay only for the ones you act on. It takes about two minutes and
        you never touch gas.
      </p>
      <div className="mt-12">
        <SponsorForm />
      </div>
    </div>
  );
}
