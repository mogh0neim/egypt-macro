"""Draw web/og.png, the card that shows when a Miqyas link is pasted anywhere.

This is a development script, not part of the build. It needs Pillow, which
deliberately is not in requirements.txt: the output is committed, so no
workflow ever has to install an image library to publish the site. Re-run it
by hand if the wordmark or the palette changes.

    python scripts/make_og.py
"""

from __future__ import annotations

import csv
import pathlib

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "og.png"
FX = ROOT / "data" / "clean" / "series" / "fx_official.csv"

W, H = 1200, 630
INK = (16, 27, 51)
GOLD = (168, 130, 58)
TEAL = (63, 156, 150)
MARBLE = (233, 233, 228)
MUTED = (140, 150, 175)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Whatever condensed-ish grotesque this machine has. Falls back rather
    than failing: an og image with the wrong face beats no og image."""
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if pathlib.Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def fx_series() -> list[float]:
    """The official EGP/USD selling rate, which is the shape everyone
    recognises: flat, then three cliffs."""
    values: list[float] = []
    if not FX.exists():
        return values
    with FX.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row.get("series_id") == "EG.FX.OFF.USD.SELL":
                try:
                    values.append(float(row["value"]))
                except ValueError:
                    continue
    return values


def main() -> int:
    img = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(img)

    # The graduated column, down the left edge.
    for i in range(14):
        y = 60 + i * 40
        d.rectangle([64, y, 70, y + 24], fill=GOLD)

    values = fx_series()
    if len(values) > 4:
        step = max(1, len(values) // 500)
        pts = values[::step]
        lo, hi = min(pts), max(pts)
        span = (hi - lo) or 1
        x0, x1 = 120, W - 70
        y0, y1 = H - 90, 330
        coords = [
            (x0 + (i / (len(pts) - 1)) * (x1 - x0), y0 - ((v - lo) / span) * (y0 - y1))
            for i, v in enumerate(pts)
        ]
        d.polygon(
            coords + [(x1, y0), (x0, y0)],
            fill=(int(INK[0] + (TEAL[0] - INK[0]) * 0.12),
                  int(INK[1] + (TEAL[1] - INK[1]) * 0.12),
                  int(INK[2] + (TEAL[2] - INK[2]) * 0.12)),
        )
        d.line(coords, fill=TEAL, width=4, joint="curve")

    d.text((120, 92), "MIQYAS", font=font(104, bold=True), fill=MARBLE)
    d.text((122, 214), "Egypt's macroeconomic record", font=font(40), fill=MARBLE)
    d.text((122, 268), "Every number the Central Bank publishes, cleaned and searchable",
           font=font(26), fill=MUTED)
    d.text((122, H - 56), "UNOFFICIAL MIRROR  ·  REBUILT DAILY  ·  NOT AFFILIATED WITH THE CBE",
           font=font(20), fill=MUTED)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)}  {OUT.stat().st_size/1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
