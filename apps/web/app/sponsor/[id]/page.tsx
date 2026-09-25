import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SponsorDashboard } from "@/components/sponsor-dashboard";
import { loadSnapshot } from "@/lib/server/snapshot";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sponsor dashboard", robots: { index: false } };

export default async function SponsorDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const programId = Number(id);
  if (!Number.isInteger(programId) || programId < 1) notFound();
  const snapshot = await loadSnapshot();
  return <SponsorDashboard id={programId} initial={snapshot} />;
}
