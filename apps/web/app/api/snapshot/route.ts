import { NextResponse } from "next/server";
import { loadSnapshot } from "@/lib/server/snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadSnapshot(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[snapshot]", error);
    return NextResponse.json({ error: "Couldn't read the chain." }, { status: 503 });
  }
}
