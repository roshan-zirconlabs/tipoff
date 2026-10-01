import { NextResponse } from "next/server";
import { dueWork } from "@/lib/keeper";
import { relay } from "@/lib/server/relay";
import { loadSnapshot } from "@/lib/server/snapshot";

// Pays out closed hits and returns unlocked stakes. Every call it makes is permissionless and always pays the right
// party, so running it needs no trust; the secret only stops strangers spending the relayer's gas on our schedule.
// Triggered by the host's cron (apps/web/vercel.json) with `Authorization: Bearer $CRON_SECRET`.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const jobs = dueWork(await loadSnapshot(), Number(process.env.KEEPER_BATCH ?? 20));
  const results = [];
  for (const job of jobs) {
    const res = await relay(job, "keeper");
    results.push({ ...job, ok: res.ok, ...(res.ok ? { hash: res.hash } : { error: res.error }) });
    if (!res.ok && (res.code === "RelayerLow" || res.code === "GlobalBudget")) break;
  }
  return NextResponse.json({ ok: true, done: results.filter((r) => r.ok).length, due: jobs.length, results });
}
