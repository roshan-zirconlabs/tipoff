import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { DevToolbar } from "@/components/dev-toolbar";
import { Footer, Nav } from "@/components/nav";
import "./globals.css";
import { Providers } from "./providers";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  axes: ["opsz", "wdth"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Tipoff — call it first, get paid when they sign", template: "%s · Tipoff" },
  description:
    "Sealed scout markets on Monad. Sponsors lock a bounty, scouts send sealed tips, and the earliest scouts get paid when the sponsor acts — even quietly.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f0e6" },
    { media: "(prefers-color-scheme: dark)", color: "#12110d" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${jetbrains.variable}`}>
      <body>
        <Providers>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
          >
            Skip to content
          </a>
          <Nav />
          <main id="main">{children}</main>
          <Footer />
          <DevToolbar />
        </Providers>
      </body>
    </html>
  );
}
