import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_UPSTREAM = "https://rpc.mainnet.chain.robinhood.com";
const FALLBACKS = ["https://rpc.mainnet.chain.robinhood.com"];

/**
 * Same-origin JSON-RPC relay. Browsers talking straight to the public
 * Robinhood Chain RPC hit a doubled CORS header on its 429 responses, which
 * fails every read while the page is busy; a relay never does. The upstream
 * is QUILL_RPC_UPSTREAM, else the manifest's rpcUrl, else the public RPC.
 */
async function upstream(): Promise<string> {
  const env = process.env.QUILL_RPC_UPSTREAM?.trim();
  if (env) return env;
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "deployment.json"), "utf8");
    const url = (JSON.parse(raw) as { rpcUrl?: string }).rpcUrl;
    if (url) return url;
  } catch {
    /* no manifest */
  }
  return DEFAULT_UPSTREAM;
}

export async function POST(req: Request) {
  const body = await req.text();
  const first = await upstream();
  const targets = [first, ...FALLBACKS.filter((f) => f !== first)];
  let lastError = "no upstream answered";
  for (const target of targets) {
    try {
      const res = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        cache: "no-store",
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = `${target} answered ${res.status}`;
        continue;
      }
      const text = await res.text();
      return new Response(text, { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: `RPC relay failed: ${lastError}` } }, { status: 502 });
}
