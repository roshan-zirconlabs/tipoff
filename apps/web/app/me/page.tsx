import type { Metadata } from "next";
import { MeScreen } from "@/components/me-screen";
import { loadSnapshot } from "@/lib/server/snapshot";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My tips", robots: { index: false } };

export default async function MePage() {
  return <MeScreen initial={await loadSnapshot()} />;
}
