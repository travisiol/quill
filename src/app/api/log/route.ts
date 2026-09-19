export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mirrors the app's event log to the server console (never persisted). */
export async function POST(req: Request) {
  try {
    const { args } = (await req.json()) as { args?: unknown[] };
    if (Array.isArray(args)) console.log(...args.slice(0, 8));
  } catch {
    /* ignore malformed */
  }
  return new Response(null, { status: 204 });
}
