// Renders the brand SVGs to PNG at submission sizes.
//   node brand/render.mjs
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";

const mark = readFileSync(new URL("./ingot-mark.svg", import.meta.url), "utf8");

const PLANE = "#0d0d0d";
const INK = "#ffffff";
const MUTED = "#898781";

/// The submission logo: mark, wordmark and the one line that says what this is.
const lockup = (width, height, scale) => `
<!doctype html><html><body style="margin:0">
<div style="width:${width}px;height:${height}px;background:${PLANE};display:flex;
            align-items:center;justify-content:center;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="display:flex;align-items:center;gap:${24 * scale}px">
    <div style="width:${148 * scale}px;height:${148 * scale}px;flex:none">${mark}</div>
    <div style="display:flex;flex-direction:column;justify-content:center">
      <div style="color:${INK};font-size:${78 * scale}px;font-weight:600;letter-spacing:-0.035em;line-height:1">Ingot</div>
      <div style="color:${MUTED};font-size:${21 * scale}px;margin-top:${13 * scale}px;letter-spacing:0.01em;white-space:nowrap">compute, priced and hedged</div>
    </div>
  </div>
</div></body></html>`;

const square = (size) => `
<!doctype html><html><body style="margin:0">
<div style="width:${size}px;height:${size}px;background:${PLANE};display:flex;align-items:center;justify-content:center">
  <div style="width:${Math.round(size * 0.64)}px;height:${Math.round(size * 0.64)}px">${mark}</div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

const targets = [
  { name: "ingot-logo.png", html: lockup(1200, 630, 1), width: 1200, height: 630 },
  { name: "ingot-logo-wide.png", html: lockup(1600, 400, 0.85), width: 1600, height: 400 },
  { name: "ingot-mark.png", html: square(512), width: 512, height: 512 },
];

for (const target of targets) {
  const page = await browser.newPage({
    viewport: { width: target.width, height: target.height },
    deviceScaleFactor: 2,
  });
  await page.setContent(target.html, { waitUntil: "load" });
  const buffer = await page.screenshot({ type: "png" });
  writeFileSync(new URL(`./${target.name}`, import.meta.url), buffer);
  console.log(`${target.name.padEnd(22)} ${target.width}x${target.height} @2x  ${(buffer.length / 1024).toFixed(0)} KB`);
  await page.close();
}

await browser.close();
