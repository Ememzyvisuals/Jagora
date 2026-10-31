import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // no round "N" development badge over the app (it sat on top of buttons in screen recordings)
  devIndicators: false,
  // which build a crash report came from (Vercel sets the commit)
  env: { NEXT_PUBLIC_BUILD: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7) },
};

export default nextConfig;
