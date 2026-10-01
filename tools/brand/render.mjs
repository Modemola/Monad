#!/usr/bin/env node
/// Renders every brand graphic from HTML, in the product's own fonts and palette:
///
///   web/app/opengraph-image.png   1200×630  social preview card
///   docs/brand/ingot-cover.png    1600×900  submission cover and README header
///   docs/brand/ingot-logo.png     1024×1024 square logo
///
/// Usage, from the repository root, after `pnpm install` in web/ (the fonts come from there):
///
///   NODE_PATH=$(npm root -g) node tools/brand/render.mjs
///
/// Needs Playwright with a Chromium (`npm i -g playwright && npx playwright install chromium`).
/// The index level and the provider basis are read from the same sources the landing page uses,
/// so the graphics never show a number the app does not.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB = join(ROOT, "web");
const require = createRequire(import.meta.url);

function playwright() {
  for (const name of ["playwright", "playwright-core"]) {
    try {
      return require(name);
    } catch {}
  }
  console.error("Playwright not found. Install it globally and run with NODE_PATH=$(npm root -g).");
  process.exit(1);
}

// ── Data ────────────────────────────────────────────────────────────────────────────────────────

/// Latest index print, from the generated story data.
function latestIndex() {
  const source = readFileSync(join(WEB, "lib/story-data.ts"), "utf8");
  const rows = [...source.matchAll(/\["(\d{4}-\d{2}-\d{2})",([\d.]+),(\d+),(\d+)\]/g)];
  if (rows.length === 0) throw new Error("no rows in web/lib/story-data.ts");
  const [, date, price, , providers] = rows[rows.length - 1];
  const maxProviders = Math.max(...rows.map((r) => Number(r[4])));
  return { date, price: Number(price), providers: Number(providers), maxProviders };
}

/// Provider basis against the index, from the split-flap board's table.
function providerBasis() {
  const source = readFileSync(join(WEB, "components/fx/SplitFlap.tsx"), "utf8");
  return [...source.matchAll(/\["([A-Z ]+)", (-?[\d.]+)\]/g)].map(([, name, basis]) => ({ name, basis: Number(basis) }));
}

/// The average day's dearest-to-cheapest ratio, as docs/BACKTEST.md states it.
function backtestSpread() {
  const match = readFileSync(join(ROOT, "docs/BACKTEST.md"), "utf8").match(/\*\*([\d.]+)x\*\* the/);
  if (!match) throw new Error("dearest ÷ cheapest ratio not found in docs/BACKTEST.md");
  return match[1];
}

// ── Shared pieces ───────────────────────────────────────────────────────────────────────────────

const font = (path) => pathToFileURL(join(WEB, "node_modules", path)).href;
for (const path of [
  "@fontsource-variable/newsreader/files/newsreader-latin-standard-normal.woff2",
  "geist/dist/fonts/geist-sans/Geist-Regular.woff2",
]) {
  if (!existsSync(join(WEB, "node_modules", path))) {
    console.error(`Missing ${path}. Run pnpm install in web/ first.`);
    process.exit(1);
  }
}

const BASE_CSS = `
@font-face{font-family:N;font-weight:200 800;src:url("${font("@fontsource-variable/newsreader/files/newsreader-latin-standard-normal.woff2")}")}
@font-face{font-family:N;font-style:italic;font-weight:200 800;src:url("${font("@fontsource-variable/newsreader/files/newsreader-latin-standard-italic.woff2")}")}
@font-face{font-family:G;src:url("${font("geist/dist/fonts/geist-sans/Geist-Regular.woff2")}")}
@font-face{font-family:M;src:url("${font("geist/dist/fonts/geist-mono/GeistMono-Regular.woff2")}")}
*{margin:0;box-sizing:border-box}
body{overflow:hidden;background:#090807;color:#f3ecdf;font-family:G;position:relative}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(243,236,223,.1) 1px,transparent 1.2px);background-size:22px 22px}
.frame{position:absolute;border:1px solid rgba(243,236,223,.09)}
.c{position:absolute;width:16px;height:16px;border-color:rgba(232,182,97,.7);border-style:solid}
.g{font-style:italic;background:linear-gradient(100deg,#f6dca6,#e8b661 30%,#fff4dc 48%,#b98535 70%,#e8b661);-webkit-background-clip:text;color:transparent}
.label{font-family:M;text-transform:uppercase;letter-spacing:.22em;color:#867d70}
.cell{display:flex;align-items:center;justify-content:center;font-family:M;color:#e8b661;background:linear-gradient(180deg,#1d1914 0,#14110e 49%,#0f0d0a 51%,#16130f 100%);position:relative;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
.cell:after{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(0,0,0,.8)}
`;

/// The four gold corner marks every panel in the product carries, inset by `inset` pixels.
function hallmarks(inset) {
  const o = inset - 1;
  return `<div class="frame" style="inset:${inset}px"></div>
<div class="c" style="left:${o}px;top:${o}px;border-width:1px 0 0 1px"></div>
<div class="c" style="right:${o}px;top:${o}px;border-width:1px 1px 0 0"></div>
<div class="c" style="left:${o}px;bottom:${o}px;border-width:0 0 1px 1px"></div>
<div class="c" style="right:${o}px;bottom:${o}px;border-width:0 1px 1px 0"></div>`;
}

/// The gold mark; the same geometry as web/components/Nav.tsx and web/app/icon.svg.
function mark(size, id = "m", centred = false) {
  // The drawing sits up and left of its 22-unit box; centred shifts the box onto its middle.
  const box = centred ? "1 -1.25 22 22" : "0 0 22 22";
  return `<svg width="${size}" height="${size}" viewBox="${box}">
<defs>
<linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4dc"/><stop offset=".35" stop-color="#e8b661"/><stop offset="1" stop-color="#9c6a26"/></linearGradient>
<linearGradient id="${id}t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#f6dca6"/></linearGradient>
<linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8742c"/><stop offset="1" stop-color="#4d3311"/></linearGradient>
</defs>
<path d="M4 14.5 L7 7.5 L15 7.5 L18 14.5 Z" fill="url(#${id}f)"/>
<path d="M7 7.5 L9 5 L17 5 L15 7.5 Z" fill="url(#${id}t)"/>
<path d="M15 7.5 L17 5 L20 12 L18 14.5 Z" fill="url(#${id}s)"/>
</svg>`;
}

const board = (text, w, h, size, gap) =>
  `<div style="display:flex;gap:${gap}px">${[...text]
    .map((ch) => `<span class="cell" style="width:${w}px;height:${h}px;font-size:${size}px">${ch}</span>`)
    .join("")}</div>`;

const page = (width, height, css, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}body{width:${width}px;height:${height}px}${css}</style></head><body>${body}</body></html>`;

// ── Graphics ────────────────────────────────────────────────────────────────────────────────────

function og({ price }) {
  return page(
    1200,
    630,
    `.glow{position:absolute;left:50%;top:-180px;width:1300px;height:620px;transform:translateX(-50%);background:radial-gradient(ellipse at center,rgba(232,182,97,.22),rgba(185,133,53,.06) 45%,transparent 70%)}
.dots{-webkit-mask-image:radial-gradient(ellipse 70% 70% at 50% 40%,#000 10%,transparent 75%)}
.chip{position:absolute;left:50%;top:70px;transform:translateX(-50%);border:1px solid rgba(232,182,97,.45);padding:8px 14px;font-family:M;font-size:13px;letter-spacing:.24em;text-transform:uppercase;color:#e8b661;white-space:nowrap}
h1{position:absolute;left:0;right:0;top:122px;text-align:center;font-family:N;font-weight:300;font-size:118px;line-height:.98;letter-spacing:-.025em}
.board{position:absolute;left:50%;top:400px;transform:translateX(-50%)}
.cap{position:absolute;left:0;right:0;top:486px;text-align:center;font-size:13px}
.foot{position:absolute;left:0;right:0;bottom:62px;text-align:center;font-size:19px;color:#c4baa9}`,
    `<div class="glow"></div><div class="dots"></div>${hallmarks(28)}
<div class="chip">◆ Ingot · GPU compute, as a market · Monad</div>
<h1>Compute,<br><span class="g">priced</span> &amp; <span class="g">hedged.</span></h1>
<div class="board">${board(`$${price.toFixed(4)}`, 46, 64, 40, 4)}</div>
<div class="cap label">Ingot H100 index · USD per GPU-hour</div>
<div class="foot">A cash-settled market for GPU rental rates, and loans whose hedge opens in the same transaction.</div>`,
  );
}

/// Eight venues as gold columns, cheapest to dearest, with the index drawn through them: the
/// landing page's "Eight venues. One price." set piece, flattened to a still.
function columns({ price }, venues, { width, height }) {
  const rows = venues.map((v) => ({ ...v, price: price * (1 + v.basis) })).sort((a, b) => a.price - b.price);
  const top = Math.max(...rows.map((r) => r.price));
  const base = height - 64; // room for names under the columns
  const scaleY = (base - 40) / top;
  const slot = width / rows.length;
  const barW = slot * 0.56;
  const indexY = base - price * scaleY;
  const bars = rows
    .map((r, i) => {
      const h = r.price * scaleY;
      const x = i * slot + (slot - barW) / 2;
      const above = r.price >= price;
      return `<rect x="${x}" y="${base - h}" width="${barW}" height="${h}" fill="url(#col)" opacity="${above ? 1 : 0.78}"/>
<rect x="${x}" y="${base - h}" width="${barW}" height="2" fill="#fff4dc" opacity=".85"/>
<text x="${x + barW / 2}" y="${base - h - 12}" text-anchor="middle" font-family="M" font-size="15" fill="#f3ecdf" stroke="#090807" stroke-width="4" paint-order="stroke">$${r.price.toFixed(2)}</text>
${r.name
  .split(" ")
  .map((word, j) => `<text x="${x + barW / 2}" y="${base + 26 + j * 17}" text-anchor="middle" font-family="M" font-size="10.5" letter-spacing="1.4" fill="#867d70">${word}</text>`)
  .join("")}`;
    })
    .join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible">
<defs>
<linearGradient id="col" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dca6"/><stop offset=".3" stop-color="#e8b661"/><stop offset="1" stop-color="#5a3c14"/></linearGradient>
<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e8b661" stop-opacity="0"/><stop offset=".08" stop-color="#e8b661"/><stop offset=".92" stop-color="#e8b661"/><stop offset="1" stop-color="#e8b661" stop-opacity="0"/></linearGradient>
</defs>
<line x1="0" y1="${base}" x2="${width}" y2="${base}" stroke="rgba(243,236,223,.14)"/>
${bars}
<rect x="-24" y="${indexY - 1}" width="${width + 48}" height="2" fill="url(#fade)"/>
<rect x="-24" y="${indexY - 10}" width="${width + 48}" height="20" fill="#e8b661" opacity=".06"/>
<text x="0" y="${indexY - 22}" font-family="M" font-size="13" letter-spacing="3" fill="#e8b661">INDEX $${price.toFixed(4)}</text>
</svg>`;
}

function cover(index, venues) {
  const stats = [
    [`$${index.price.toFixed(4)}`, "H100 index · per GPU-hour"],
    [`${index.maxProviders}`, "providers sampled a day"],
    [`${backtestSpread()}×`, "dearest ÷ cheapest, average day"],
    ["1 tx", "loan and hedge, together"],
  ];
  return page(
    1600,
    900,
    `.glow{position:absolute;left:-200px;top:-260px;width:1300px;height:900px;background:radial-gradient(ellipse at center,rgba(232,182,97,.2),rgba(185,133,53,.05) 45%,transparent 70%)}
.glow2{position:absolute;right:-160px;top:120px;width:900px;height:640px;background:radial-gradient(ellipse at center,rgba(232,182,97,.1),transparent 65%)}
.dots{-webkit-mask-image:radial-gradient(ellipse 80% 75% at 40% 40%,#000 10%,transparent 80%)}
.brand{position:absolute;left:96px;top:84px;display:flex;align-items:center;gap:14px;font-family:N;font-size:36px;font-weight:400;letter-spacing:-.01em}
.meta{position:absolute;right:96px;top:98px;font-size:13px}
.chip{position:absolute;left:96px;top:186px;border:1px solid rgba(232,182,97,.45);padding:8px 14px;font-family:M;font-size:13px;letter-spacing:.24em;text-transform:uppercase;color:#e8b661}
h1{position:absolute;left:92px;top:236px;font-family:N;font-weight:300;font-size:124px;line-height:.98;letter-spacing:-.028em}
.lede{position:absolute;left:96px;top:508px;width:640px;font-size:21px;line-height:1.5;color:#c4baa9}
.board{position:absolute;left:96px;top:612px}
.cap{position:absolute;left:96px;top:690px;font-size:12px}
.cols{position:absolute;left:900px;top:196px}
.strip{position:absolute;left:96px;right:96px;bottom:84px;display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid rgba(243,236,223,.1)}
.strip div{padding:22px 0 0}
.strip b{display:block;font-family:M;font-weight:400;font-size:30px;color:#e8b661;letter-spacing:-.01em}
.strip span{display:block;margin-top:8px;font-size:12px}`,
    `<div class="glow"></div><div class="glow2"></div><div class="dots"></div>${hallmarks(36)}
<div class="brand">${mark(44, "b")}Ingot</div>
<div class="meta label">Metropolis · Onchain finance &amp; trading · Monad</div>
<div class="chip">GPU compute, as a market</div>
<h1>Compute,<br><span class="g">priced</span> &amp; <span class="g">hedged.</span></h1>
<p class="lede">A cash-settled market for GPU rental rates, and loans whose hedge opens in the same transaction.</p>
<div class="board">${board(`$${index.price.toFixed(4)}`, 46, 62, 38, 4)}</div>
<div class="cap label">Ingot H100 index · ${index.date}</div>
<div class="cols">${columns(index, venues, { width: 604, height: 500 })}</div>
<div class="strip">${stats.map(([v, l]) => `<div><b>${v}</b><span class="label">${l}</span></div>`).join("")}</div>`,
  );
}

function logo() {
  return page(
    1024,
    1024,
    `.glow{position:absolute;left:50%;top:50%;width:900px;height:760px;transform:translate(-50%,-46%);background:radial-gradient(ellipse at center,rgba(232,182,97,.28),rgba(185,133,53,.07) 45%,transparent 70%)}
.dots{-webkit-mask-image:radial-gradient(circle at 50% 50%,#000 20%,transparent 70%)}
.m{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);filter:drop-shadow(0 30px 60px rgba(232,182,97,.25))}`,
    `<div class="glow"></div><div class="dots"></div>${hallmarks(56)}<div class="m">${mark(660, "l", true)}</div>`,
  );
}

// ── Render ──────────────────────────────────────────────────────────────────────────────────────

const index = latestIndex();
const venues = providerBasis();
const jobs = [
  ["web/app/opengraph-image.png", 1200, 630, og(index)],
  ["docs/brand/ingot-cover.png", 1600, 900, cover(index, venues)],
  ["docs/brand/ingot-logo.png", 1024, 1024, logo()],
];

const { chromium } = playwright();
const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {});
// Pages load from file:// so the local font files are same-origin.
const scratch = mkdtempSync(join(tmpdir(), "ingot-brand-"));
for (const [out, width, height, html] of jobs) {
  const file = join(scratch, "page.html");
  writeFileSync(file, html);
  const tab = await browser.newPage({ viewport: { width, height } });
  await tab.goto(pathToFileURL(file).href, { waitUntil: "load" });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: join(ROOT, out) });
  await tab.close();
  console.log(`wrote ${out}`);
}
await browser.close();
rmSync(scratch, { recursive: true, force: true });
