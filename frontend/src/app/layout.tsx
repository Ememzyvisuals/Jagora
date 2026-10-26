import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jagora | The internet, in your own words",
  description:
    "Speak Yorùbá, Hausa, Igbo, Pidgin or English. Jagora reads websites with you, shows you where to tap, and fills forms for you.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#8cc4f2",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/jagora-sans.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/jagora-pixel-sans-dot.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/sky/hero-desktop.webp" as="image" />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
