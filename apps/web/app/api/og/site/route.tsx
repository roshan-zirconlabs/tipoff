import { ImageResponse } from "next/og";
import { ogFonts } from "@/lib/server/og-font";

// The home page's share card. 1200×630, or 1200×800 (`?ratio=3x2`) for Farcaster embeds.
export async function GET(request: Request) {
  const tall = new URL(request.url).searchParams.get("ratio") === "3x2";
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: "#f4f0e6",
        color: "#191713",
        fontFamily: "Bricolage, sans-serif",
      }}
    >
      <div style={{ fontSize: 30, color: "#e2542b" }}>tipoff · early-supporter rewards on Monad</div>
      <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4, lineHeight: 1, marginTop: 28 }}>
        Call it first.
      </div>
      <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4, lineHeight: 1, color: "#6b655a" }}>
        Get paid when they make it.
      </div>
      <div style={{ fontSize: 34, marginTop: 36, color: "#3b372f" }}>
        Tip off a patron about a creator. When they pay that creator, even quietly, you get a finder's fee.
      </div>
    </div>,
    { width: 1200, height: tall ? 800 : 630, fonts: await ogFonts() },
  );
}
