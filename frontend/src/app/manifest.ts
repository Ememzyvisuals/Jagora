import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jagora",
    short_name: "Jagora",
    description: "The internet, in your own words. Speak Yorùbá, Hausa, Igbo, Pidgin or English and Jagora browses with you.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    display_override: ["fullscreen", "standalone"],
    orientation: "portrait",
    background_color: "#8cc4f2",
    theme_color: "#0e0f12",
    lang: "en",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // "Share to Jagora": a message or link shared from WhatsApp or SMS opens Jagora with it
    share_target: { action: "/app", method: "GET", params: { title: "title", text: "text", url: "url" } },
  } as MetadataRoute.Manifest;
}
