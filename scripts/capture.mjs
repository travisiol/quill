// Headless Chrome captures of the running site (no GPU needed):
//   node scripts/capture.mjs            → docs/captures/*.png
// Needs `npm run dev` (port 3697) — and the local chain for live state.
import { execFileSync } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { tmpdir } from "os";

const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(existsSync);
if (!CHROME) throw new Error("Chrome not found");
const BASE = process.env.SITE ?? "http://localhost:3697";
const OUT = resolve(process.cwd(), "docs", "captures");
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  ["home-desktop", `${BASE}/`, 1440, 4200],
  ["home-fold", `${BASE}/`, 1440, 900],
  ["search-desktop", `${BASE}/#search`, 1440, 1400],
  ["register-desktop", `${BASE}/#register`, 1440, 1600],
  ["developers-desktop", `${BASE}/#developers`, 1440, 2200],
];

for (const [name, url, w, h] of SHOTS) {
  const out = resolve(OUT, `${name}.png`);
  execFileSync(CHROME, [
    "--headless=new",
    "--no-first-run",
    `--user-data-dir=${resolve(tmpdir(), "quill-shot")}`,
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--hide-scrollbars",
    `--window-size=${w},${h}`,
    "--virtual-time-budget=12000",
    `--screenshot=${out}`,
    url,
  ]);
  console.log(`wrote ${out}`);
}
