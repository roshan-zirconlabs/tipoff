import type { Metadata } from "next";
import { PitchDeck } from "@/components/pitch-deck";

export const metadata: Metadata = {
  title: "The pitch",
  description:
    "Why Tipoff: fans find creators first, the money shows up last. Enforceable finder's fees on Monad, in ten slides.",
};

// A click-through pitch deck for the demo. It renders full-screen over the site chrome, so no nav or footer here.
export default function PitchPage() {
  return <PitchDeck />;
}
