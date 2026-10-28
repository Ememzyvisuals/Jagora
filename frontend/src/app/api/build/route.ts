/* Which version of the app is published now; an app left open since an older version reloads itself (lib/crash.ts). */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ build: process.env.NEXT_PUBLIC_BUILD || "" }, { headers: { "Cache-Control": "no-store" } });
}
