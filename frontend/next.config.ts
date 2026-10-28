import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // which build a crash report came from (Vercel sets the commit)
  env: { NEXT_PUBLIC_BUILD: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7) },
};

export default nextConfig;
