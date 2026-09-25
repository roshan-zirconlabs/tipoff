import { NextResponse } from "next/server";
import { type RelayResponse, relayRequest } from "@/lib/relay-schema";
import { allow } from "@/lib/server/rate-limit";
import { relay } from "@/lib/server/relay";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(`relay:${ip}`, 30)) {
    return NextResponse.json<RelayResponse>({ ok: false, error: "Too many requests. Wait a minute." }, { status: 429 });
  }

  const parsed = relayRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json<RelayResponse>({ ok: false, error: "That request isn't valid." }, { status: 400 });
  }

  const result = await relay(parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
