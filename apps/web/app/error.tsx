"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-32 text-center sm:px-6">
      <h1 className="display text-4xl">Couldn't reach the chain.</h1>
      <p className="mt-3 text-ink-2">The network or our reader hiccuped. Your tips and bounties are safe on-chain.</p>
      <Button className="mt-8" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
