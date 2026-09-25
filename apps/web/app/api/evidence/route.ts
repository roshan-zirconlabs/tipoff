import { NextResponse } from "next/server";
import { loadSnapshot } from "@/lib/server/snapshot";

export const dynamic = "force-dynamic";

/**
 * Evidence specs of programs that can still record a hit, for the Chainlink CRE resolver. The raw bytes are served
 * exactly as committed: the workflow re-hashes each one against Program.evidenceHash on-chain, so this endpoint can
 * only withhold programs, never invent treasuries.
 */
export async function GET() {
  try {
    const snapshot = await loadSnapshot();
    const live = snapshot.programs
      .filter((p) => snapshot.now <= p.tailEnd + p.claimWindow && p.evidence.kind === "evm-payment")
      .map((p) => ({ programId: `${p.id}`, evidenceSpec: p.evidenceSpecRaw }))
      .sort((a, b) => Number(a.programId) - Number(b.programId));
    return NextResponse.json(live, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[evidence]", error);
    return NextResponse.json({ error: "Couldn't read the chain." }, { status: 503 });
  }
}
