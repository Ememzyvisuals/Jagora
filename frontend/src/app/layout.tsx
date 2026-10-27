import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Pwa } from "@/components/Pwa";
import { Effects } from "@/components/Effects";
import { PageWars } from "@/components/PageWars";
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
  viewportFit: "cover",
  themeColor: "#0e0f12",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preload" href="/fonts/jagora-sans.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/jagora-body-400.woff2" as="font" type="font/woff2" crossOrigin="" />
        
      </head>
      <body className="min-h-dvh antialiased">
        <Pwa />
        <Effects />
        <PageWars />
        {children}
      </body>
    </html>
  );
}
