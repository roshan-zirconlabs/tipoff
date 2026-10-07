import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";
import { DevToolbar } from "@/components/dev-toolbar";
import { Ambient } from "@/components/motion/ambient";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { Footer, Nav } from "@/components/nav";
import { Welcome } from "@/components/welcome";
import { miniappEmbed } from "@/lib/embed";
import { requestOrigin } from "@/lib/server/origin";
import "./globals.css";
import { Providers } from "./providers";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  axes: ["opsz", "wdth"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

// Built per request from the host the visitor used, so share cards work on any domain attached to the deployment.
export async function generateMetadata(): Promise<Metadata> {
  const origin = await requestOrigin();
  return {
    title: { default: "Tipoff — call it first, get paid when they make it", template: "%s · Tipoff" },
    description:
      "Early-supporter rewards on Monad. Patrons lock a bounty for the creators they want to back, fans send sealed tip-offs, and the fans who called it first get paid when the patron pays the creator, even quietly.",
    metadataBase: new URL(origin),
    openGraph: { images: ["/api/og/site"] },
    twitter: { card: "summary_large_image", images: ["/api/og/site"] },
    other: miniappEmbed({ origin, imageUrl: "/api/og/site?ratio=3x2", url: "/", buttonTitle: "Call it first" }),
  };
}

const MOTION_OK =
  "if(document.visibilityState==='visible'&&!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('motion-ok')";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f0e6" },
    { media: "(prefers-color-scheme: dark)", color: "#12110d" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body>
        {/* Opt in to entrance animations only on a visible page, before hydration. A constant string. */}
        <Script id="motion-ok" strategy="beforeInteractive">
          {MOTION_OK}
        </Script>
        <Providers>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
          >
            Skip to content
          </a>
          <Ambient />
          <SmoothScroll />
          <div className="relative z-[1]">
            <Nav />
            <main id="main">{children}</main>
            <Footer />
          </div>
          <DevToolbar />
          <Welcome />
        </Providers>
      </body>
    </html>
  );
}
