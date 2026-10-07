import { NextResponse } from "next/server";
import { lookupHandle } from "@/lib/server/farcaster";
import { allow } from "@/lib/server/rate-limit";

export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(`fc:${ip}`, 40)) return NextResponse.json({ error: "Too many lookups. Wait a minute." }, { status: 429 });
  const profile = await lookupHandle(decodeURIComponent((await params).handle));
  if (!profile) return NextResponse.json({ error: "No Farcaster user by that name." }, { status: 404 });
  return NextResponse.json(profile, { headers: { "cache-control": "public, max-age=300" } });
}
