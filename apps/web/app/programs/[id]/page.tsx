import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProgramScreen } from "@/components/program-screen";
import { loadSnapshot } from "@/lib/server/snapshot";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const snapshot = await loadSnapshot().catch(() => null);
  const program = snapshot?.programs.find((p) => p.id === Number(id));
  return { title: program?.metadata.title ?? `Program ${id}` };
}

export default async function ProgramPage({ params }: Props) {
  const { id } = await params;
  const programId = Number(id);
  if (!Number.isInteger(programId) || programId < 1) notFound();
  const snapshot = await loadSnapshot();
  if (!snapshot.programs.some((p) => p.id === programId)) notFound();
  return <ProgramScreen id={programId} initial={snapshot} />;
}
