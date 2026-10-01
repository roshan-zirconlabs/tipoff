import { ImageResponse } from "next/og";
import { calls, cleanLabel, verifiedCreator } from "@/lib/calls";
import { pad, shortAddress, usdc } from "@/lib/format";
import { loadSnapshot } from "@/lib/server/snapshot";

// The social card for a call: 1200×630, the brand's paper, ink and vermilion.

export async function GET(request: Request, { params }: { params: Promise<{ tipId: string }> }) {
  const { tipId } = await params;
  const url = new URL(request.url);
  const snapshot = await loadSnapshot();
  const call = calls(snapshot).find((c) => c.tipId === Number(tipId));
  if (!call) return new Response("Not found", { status: 404 });
  const creator = verifiedCreator(call, url.searchParams.get("c"));
  const label = creator ? cleanLabel(url.searchParams.get("n")) : null;
  const days = Math.round(call.daysEarly);
  const patron = call.patronName || shortAddress(call.patron);

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
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#6b655a" }}>
        <span>tipoff · called it</span>
        <span style={{ color: "#e2542b" }}>#{pad(call.tipId)}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 128, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>
          {days < 1 ? "Same day." : `${days} day${days === 1 ? "" : "s"} early.`}
        </div>
        <div style={{ fontSize: 40, marginTop: 28, color: "#3b372f" }}>
          {`${shortAddress(call.scout)} called ${label ?? (creator ? shortAddress(creator) : "a creator")} before ${patron} paid them.`}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#6b655a" }}>
        <span>{call.programTitle}</span>
        <span style={{ color: "#191713" }}>{call.amount ? `earned $${usdc(call.amount)}` : "claimed"}</span>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
