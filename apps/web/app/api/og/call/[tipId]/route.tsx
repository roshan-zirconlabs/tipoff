import { ImageResponse } from "next/og";
import { calls, cleanLabel, verifiedCreator } from "@/lib/calls";
import { pad, shortAddress, usdc } from "@/lib/format";
import { resolveCreators } from "@/lib/server/creators";
import { profileOwning } from "@/lib/server/farcaster";
import { ogFonts } from "@/lib/server/og-font";
import { loadSnapshot } from "@/lib/server/snapshot";

// The social card for a call: 1200×630 for X and link previews, or 1200×800 (`?ratio=3x2`) for Farcaster embeds.

export async function GET(request: Request, { params }: { params: Promise<{ tipId: string }> }) {
  const { tipId } = await params;
  const url = new URL(request.url);
  const snapshot = await loadSnapshot();
  const call = calls(snapshot).find((c) => c.tipId === Number(tipId));
  if (!call) return new Response("Not found", { status: 404 });
  const shared = verifiedCreator(call, url.searchParams.get("c"));
  const known = (await resolveCreators(snapshot).catch(() => new Map())).get(`${call.programId}:${call.candidateId}`);
  const creator = shared ?? known?.wallet ?? null;
  const profile =
    (await profileOwning(url.searchParams.get("h"), creator).catch(() => null)) ??
    (known?.profile && creator && known.wallet.toLowerCase() === creator.toLowerCase() ? known.profile : null);
  const label = (shared ? cleanLabel(url.searchParams.get("n")) : null) ?? profile?.displayName ?? null;
  const days = Math.round(call.daysEarly);
  const tall = url.searchParams.get("ratio") === "3x2";
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
        fontFamily: "Bricolage, sans-serif",
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
        <div style={{ display: "flex", alignItems: "center", marginTop: 28 }}>
          {profile?.pfp ? (
            // biome-ignore lint/performance/noImgElement: next/og renders plain img elements
            <img
              src={profile.pfp}
              alt=""
              width={88}
              height={88}
              style={{ borderRadius: 999, marginRight: 24, border: "3px solid #e2542b", objectFit: "cover" }}
            />
          ) : null}
          <div style={{ display: "flex", fontSize: 40, color: "#3b372f" }}>
            {`${shortAddress(call.scout)} called ${
              profile ? `@${profile.username}` : (label ?? (creator ? shortAddress(creator) : "a creator"))
            } before ${patron} paid them.`}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#6b655a" }}>
        <span>{call.programTitle}</span>
        <span style={{ color: "#191713" }}>{call.amount ? `earned $${usdc(call.amount)}` : "claimed"}</span>
      </div>
    </div>,
    { width: 1200, height: tall ? 800 : 630, fonts: await ogFonts() },
  );
}
