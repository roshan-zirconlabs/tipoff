import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProgramScreen } from "@/components/program-screen";
import { miniappEmbed } from "@/lib/embed";
import { requestOrigin } from "@/lib/server/origin";
import { loadSnapshot } from "@/lib/server/snapshot";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const snapshot = await loadSnapshot().catch(() => null);
  const program = snapshot?.programs.find((p) => p.id === Number(id));
  if (!program) return { title: `Program ${id}` };
  const title = `${program.metadata.title} · ${program.metadata.sponsorName || "Tipoff"}`;
  const description =
    program.metadata.lookingFor || program.metadata.brief || "Tip off a creator. Get paid when they do.";
  const image = `/api/og/program/${program.id}`;
  return {
    title: program.metadata.title,
    description,
    openGraph: { title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
    other: miniappEmbed({
      origin: await requestOrigin(),
      imageUrl: `${image}?ratio=3x2`,
      url: `/programs/${program.id}`,
      buttonTitle: "Tip off a creator",
    }),
  };
}

export default async function ProgramPage({ params }: Props) {
  const { id } = await params;
  const programId = Number(id);
  if (!Number.isInteger(programId) || programId < 1) notFound();
  const snapshot = await loadSnapshot();
  if (!snapshot.programs.some((p) => p.id === programId)) notFound();
  return <ProgramScreen id={programId} initial={snapshot} />;
}
