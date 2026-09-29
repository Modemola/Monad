#!/usr/bin/env python3
"""Render the Ingot logo and cover graphic from the mark used in the app's nav.

    python3 tools/render_brand.py

Writes docs/brand/ingot-logo.png (1024x1024) and docs/brand/ingot-cover.png (1600x900).
Geometry matches docs/brand/ingot-mark.svg, which matches web/components/Nav.tsx — the
submission graphic and the product should never drift apart.

Requires Pillow. Fonts are resolved per platform; override with INGOT_FONT_DIR.
"""

import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "brand"

BG = (13, 13, 13)  # plane
FACE = (57, 135, 229)  # series-1, #3987e5
TOP = (37, 80, 132)  # series-1 at 55% over plane
SIDE = (26, 50, 78)  # series-1 at 30% over plane
INK = (255, 255, 255)
INK_SECONDARY = (195, 194, 183)
INK_MUTED = (137, 135, 129)

# The mark, in the 22x22 units of the nav SVG. Occupies x 4..20, y 5..14.5.
FACES = (
    ([(4, 14.5), (7, 7.5), (15, 7.5), (18, 14.5)], FACE),
    ([(7, 7.5), (9, 5), (17, 5), (15, 7.5)], TOP),
    ([(15, 7.5), (17, 5), (20, 12), (18, 14.5)], SIDE),
)

SS = 4  # supersample: every edge of the mark is a diagonal


def draw_mark(img, cx, cy, scale):
    """Draw the ingot centred on (cx, cy), one SVG unit = `scale` px."""
    draw = ImageDraw.Draw(img)
    for points, colour in FACES:
        draw.polygon(
            [(cx + (x - 12.0) * scale, cy + (y - 9.75) * scale) for x, y in points],
            fill=colour,
        )


def font(name, size):
    directories = [os.environ["INGOT_FONT_DIR"]] if "INGOT_FONT_DIR" in os.environ else [
        "C:/Windows/Fonts",
        "/usr/share/fonts/truetype/dejavu",
        "/System/Library/Fonts/Supplemental",
    ]
    candidates = {
        "regular": ["segoeui.ttf", "DejaVuSans.ttf", "Arial.ttf", "arial.ttf"],
        "bold": ["segoeuib.ttf", "DejaVuSans-Bold.ttf", "Arial Bold.ttf", "arialbd.ttf"],
    }[name]
    for directory in directories:
        for candidate in candidates:
            path = Path(directory) / candidate
            if path.exists():
                return ImageFont.truetype(str(path), size)
    sys.exit(f"no {name} font found. Set INGOT_FONT_DIR to a directory holding one.")


def render_logo():
    size = 1024
    img = Image.new("RGB", (size * SS, size * SS), BG)
    draw_mark(img, size * SS / 2, size * SS / 2, 46 * SS)
    img.resize((size, size), Image.LANCZOS).save(OUT / "ingot-logo.png")


def render_cover():
    width, height = 1600, 900
    img = Image.new("RGB", (width * SS, height * SS), BG)
    draw_mark(img, width * SS / 2, height * 0.40 * SS, 26 * SS)
    img = img.resize((width, height), Image.LANCZOS)

    draw = ImageDraw.Draw(img)

    def centred(text, typeface, y, fill):
        x0, _, x1, _ = draw.textbbox((0, 0), text, font=typeface)
        draw.text(((width - (x1 - x0)) / 2 - x0, y), text, font=typeface, fill=fill)

    centred("Ingot", font("bold", 96), 520, INK)
    centred(
        "A cash-settled market for compute, and the credit layer it unlocks.",
        font("regular", 38),
        650,
        INK_SECONDARY,
    )
    centred("Built on Monad", font("regular", 26), 720, INK_MUTED)

    img.save(OUT / "ingot-cover.png")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    render_logo()
    render_cover()
    print(f"wrote {OUT / 'ingot-logo.png'} and {OUT / 'ingot-cover.png'}")
