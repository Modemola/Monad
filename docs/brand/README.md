# Brand assets

The mark is a silicon ingot in section: the bar compute is cut from, and the bar a commodity
market trades. It is the same geometry the app's nav renders, so the submission graphic and the
product agree.

| File | Use |
|---|---|
| `ingot-logo.png` | 1024×1024 square logo — the submission's project logo |
| `ingot-cover.png` | 1600×900 graphic with wordmark and one-line description |
| `ingot-mark.svg` | Vector source, for any size not covered above |

The flat colours (`#3987e5` on `#0d0d0d`) are the original submission graphics. The product now
uses the "Foundry" palette: warm black, bone type and molten gold (`web/tailwind.config.ts`). The
same mark is cast in gold in the app (`web/components/Nav.tsx`, `web/app/icon.svg`), the landing
hero renders a hallmarked 3D gold bar, and the social preview card is
`web/app/opengraph-image.png`.

Both PNGs are rendered from the same geometry by `tools/render_brand.py` (needs Pillow):

```bash
python3 tools/render_brand.py
```

Change the mark and you must change all three, or the submission graphic and the product drift
apart.
