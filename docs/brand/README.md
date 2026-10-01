# Brand assets

The mark is an ingot in section: the bar compute is cut from, and the bar a commodity market
trades. It is the same geometry and the same three gold gradients the app's nav renders, so the
submission graphics and the product agree.

| File | Use |
|---|---|
| `ingot-logo.png` | 1024×1024 square logo — the submission's project logo |
| `ingot-cover.png` | 1600×900 cover: headline, the index on a split-flap board, eight venues against one index |
| `ingot-mark.svg` | Vector source, for any size not covered above |
| `../../web/app/opengraph-image.png` | 1200×630 social preview card |

The palette is "Foundry" (`web/tailwind.config.ts`): warm black `#090807`, bone type `#f3ecdf`,
one molten-gold accent `#e8b661`. Type is Newsreader for display and Geist / Geist Mono for
interface and figures — the same font files the app ships.

All three PNGs are rendered from HTML by one script, in the app's own fonts:

```bash
(cd web && pnpm install)                         # the fonts come from web/node_modules
npm i -g playwright && npx playwright install chromium
NODE_PATH=$(npm root -g) node tools/brand/render.mjs
```

The index level, provider prices and the dearest-to-cheapest ratio on the graphics are read from
`web/lib/story-data.ts`, the split-flap board's basis table and `docs/BACKTEST.md`, so re-running
the script after the data changes keeps the graphics and the app showing the same numbers.

Change the mark and you must change it in `web/components/Nav.tsx`, `web/app/icon.svg`,
`ingot-mark.svg` and `tools/brand/render.mjs`, or the submission graphics and the product drift
apart.
