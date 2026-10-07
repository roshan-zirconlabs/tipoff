import { ImageResponse } from "next/og";
import { duration, usdc } from "@/lib/format";
import { ogFonts } from "@/lib/server/og-font";
import { loadSnapshot } from "@/lib/server/snapshot";
import { phaseOf } from "@/lib/types";

// A program's share card, for patrons recruiting their community: who's looking, for what, and what a hit pays.
// 1200×630 by default; 1200×800 (`?ratio=3x2`) for Farcaster embeds.

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tall = new URL(request.url).searchParams.get("ratio") === "3x2";
  const snapshot = await loadSnapshot();
  const p = snapshot.programs.find((x) => x.id === Number(id));
  if (!p) return new Response("Not found", { status: 404 });
  const open = phaseOf(p, snapshot.now) === "tipping";
  const patron = p.metadata.sponsorName || "A patron";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#f4f0e6",
        color: "#191713",
        fontFamily: "Bricolage, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#6b655a" }}>
        <span>tipoff · {patron} is looking</span>
        <span style={{ color: open ? "#e2542b" : "#6b655a" }}>
          {open ? `tips close in ${duration(p.tipDeadline - snapshot.now)}` : "tipping closed"}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -3, lineHeight: 1.02 }}>{p.metadata.title}</div>
        {p.metadata.lookingFor ? (
          <div style={{ fontSize: 36, marginTop: 24, color: "#3b372f" }}>{p.metadata.lookingFor.slice(0, 110)}</div>
        ) : null}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30 }}>
        <span style={{ color: "#6b655a" }}>Call a creator first. Get paid when they do.</span>
        <span
          style={{ display: "flex", background: "#191713", color: "#f4f0e6", padding: "14px 26px", borderRadius: 999 }}
        >
          ${usdc(p.rewardPerHit)} per hit
        </span>
      </div>
    </div>,
    { width: 1200, height: tall ? 800 : 630, fonts: await ogFonts() },
  );
}
