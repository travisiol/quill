import { BRAND } from "./brand";

const serialize = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() + "n" : v);

/**
 * Console + server log for app events (the original site mirrors these to
 * /api/log). Never awaited; failures are ignored.
 */
export function log(...args: unknown[]): void {
  console.log(`[${BRAND.name}]`, ...args);
  if (typeof window === "undefined") return;
  fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ args: [`[${BRAND.name}]`, ...args] }, serialize),
  }).catch(() => {});
}

export function logInteraction(text: string): void {
  log("[Interaction]", text);
}
