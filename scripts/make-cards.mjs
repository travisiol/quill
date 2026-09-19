// Generates the illustrative identity cards the home carousel shows before
// any name on chain has an avatar: public/cards/<label>.svg (800×1000).
// Gold ink on an ink-black card — the initial as a drop cap, a few pen
// strokes seeded by the label, the nib in the corner. No raster, no fonts
// beyond the system serif.
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

const LABELS = process.argv.slice(2).length ? process.argv.slice(2) : ["ada", "hal", "ines", "noor", "remy", "blank"];
const TLD = "quill";
const OUT = resolve(process.cwd(), "public", "cards");

function rng(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stroke(r, i) {
  const x0 = 80 + r() * 200;
  const y0 = 240 + r() * 520;
  const x1 = x0 + 150 + r() * 400;
  const y1 = y0 + (r() - 0.5) * 320;
  const c1x = x0 + (x1 - x0) * (0.2 + r() * 0.3);
  const c1y = y0 + (r() - 0.5) * 380;
  const c2x = x0 + (x1 - x0) * (0.6 + r() * 0.3);
  const c2y = y1 + (r() - 0.5) * 380;
  const w = 2 + r() * 9;
  const o = 0.35 + r() * 0.45;
  return `<path d="M${x0.toFixed(0)} ${y0.toFixed(0)} C ${c1x.toFixed(0)} ${c1y.toFixed(0)}, ${c2x.toFixed(0)} ${c2y.toFixed(0)}, ${x1.toFixed(0)} ${y1.toFixed(0)}" fill="none" stroke="url(#ink${i % 2})" stroke-width="${w.toFixed(1)}" stroke-linecap="round" opacity="${o.toFixed(2)}"/>`;
}

function card(label) {
  const r = rng(label);
  const strokes = Array.from({ length: 3 + Math.floor(r() * 3) }, (_, i) => stroke(r, i)).join("\n  ");
  const initial = label[0].toUpperCase();
  const grid = [];
  for (let x = 50; x < 800; x += 50) grid.push(`<line x1="${x}" y1="0" x2="${x}" y2="1000"/>`);
  for (let y = 50; y < 1000; y += 50) grid.push(`<line x1="0" y1="${y}" x2="800" y2="${y}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#15131b"/>
      <stop offset="1" stop-color="#0b0a0f"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe3a0"/>
      <stop offset="0.5" stop-color="#e9b64a"/>
      <stop offset="1" stop-color="#9a6b1c"/>
    </linearGradient>
    <linearGradient id="ink0" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#e9b64a" stop-opacity="0"/>
      <stop offset="0.3" stop-color="#e9b64a"/>
      <stop offset="1" stop-color="#ffd070" stop-opacity="0.2"/>
    </linearGradient>
    <linearGradient id="ink1" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f3efe6" stop-opacity="0"/>
      <stop offset="0.4" stop-color="#f3efe6" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#f3efe6" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.45" r="0.6">
      <stop offset="0" stop-color="#e9b64a" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#e9b64a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="800" height="1000" fill="url(#bg)"/>
  <g stroke="#ffffff" stroke-opacity="0.045" stroke-width="1">
    ${grid.join("\n    ")}
  </g>
  <rect width="800" height="1000" fill="url(#glow)"/>
  ${strokes}
  <text x="400" y="600" text-anchor="middle" font-family="Instrument Serif, Georgia, 'Times New Roman', serif" font-style="italic" font-size="520" fill="url(#gold)">${initial}</text>
  <g transform="translate(56 52)" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="16" letter-spacing="2" fill="#e9b64a">
    <text x="0" y="14">01 / NAME</text>
    <text x="688" y="14" text-anchor="end" fill="#a9a4b0">${TLD.toUpperCase()}</text>
  </g>
  <text x="56" y="126" font-family="Instrument Serif, Georgia, 'Times New Roman', serif" font-size="64" fill="#f3efe6">${label}<tspan fill="#e9b64a" font-style="italic">.${TLD}</tspan></text>
  <g transform="translate(56 900) scale(0.75)">
    <path d="M32 3.5c11.6 0 21 8.6 21 21.4 0 3.2-.6 6-1.8 8.7L32 61.5 12.8 33.6C11.6 30.9 11 28.1 11 24.9 11 12.1 20.4 3.5 32 3.5Z" fill="url(#gold)"/>
    <path d="M32 61.5V33.2" stroke="#0c0b10" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="32" cy="29.6" r="3.6" fill="#0c0b10"/>
  </g>
  <text x="744" y="944" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="14" letter-spacing="2" fill="#a9a4b0">ILLUSTRATIVE · NO CLAIM</text>
  <rect x="0.5" y="0.5" width="799" height="999" fill="none" stroke="#ffffff" stroke-opacity="0.08"/>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
for (const label of LABELS) {
  writeFileSync(resolve(OUT, `${label}.svg`), card(label));
  console.log(`wrote public/cards/${label}.svg`);
}
