import { Toast } from "@/components/Toast";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Pwa } from "@/components/Pwa";
import { Effects } from "@/components/Effects";
import { PageWars } from "@/components/PageWars";
import { ScamSmash } from "@/components/ScamSmash";
import { TypeArt } from "@/components/TypeArt";
import { THEME_SCRIPT } from "@/lib/themeScript";

export const metadata: Metadata = {
  title: "Jagora | The internet, in your own words",
  description:
    "Speak Yorùbá, Hausa, Igbo, Pidgin or English. Jagora reads websites with you, shows you where to tap, and fills forms for you.",
  icons: { icon: "/favicon-48.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Jagora", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // the page does not zoom while she scrolls or taps (games, Amina, the 3D devices all take quick taps)
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0e0f12",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        
      </head>
      <body className="min-h-dvh antialiased">
        <Pwa />
        {/* the SVG filter behind the .liquid-glass utility (as on the portfolio) */}
        <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
          <filter id="liquid-glass-distortion" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.008" numOctaves={2} seed={8} result="noise" />
            <feGaussianBlur in="noise" stdDeviation="2" result="blurredNoise" />
            <feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale="18" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        <Effects />
        <Toast />
        <PageWars />
        <ScamSmash />
        <TypeArt />
        {children}
      </body>
    </html>
  );
}
