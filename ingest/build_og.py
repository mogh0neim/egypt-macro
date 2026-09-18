"""Draw a share card per series, so a link unfurls as itself.

Every link to this site, wherever it was pasted, showed the same picture: one
og.png of the dollar chart, hard-coded in index.html. Share a treasury bill
yield in a WhatsApp group and the preview said "the Egyptian pound against the
dollar since 2005". The card is the whole of what most people ever see of a
link, and in Egypt the channel it travels down is WhatsApp, which renders
og:image and nothing else.

So: one 1200x630 card per series, carrying the title, the number, the change
and the shape. Plus one per subject, and the site card itself, which is
regenerated here rather than committed so the tagline lives in one place.

Reads only the two small files -- api/v1/series.json for the figures and
api/v1/sparks.json for the shape -- rather than 1,317 observation arrays, which
is what keeps a full pass to well under a minute.

Run:  python ingest/build_og.py        (build_site.py calls it directly)
"""

from __future__ import annotations

import json
import pathlib
import re
import shutil

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
FONTS = ROOT / "assets" / "fonts"

W, H = 1200, 630

# The palette, from web/styles.css. Dark ground in every card: the site has a
# light and a dark theme and a card has neither, and the marble-on-ink reading
# is the one the wordmark was drawn for.
INK = (16, 27, 51)
GOLD = (168, 130, 58)
TEAL = (63, 156, 150)
CLAY = (176, 78, 58)
MARBLE = (233, 233, 228)
MUTED = (140, 150, 175)

ARABIC = re.compile(r"[\u0600-\u06ff]")

_FONT_CACHE: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}

# Committed under assets/fonts so a CI runner draws the cards in the site's own
# type rather than in whatever the image happens to have. Falling back is still
# allowed: a card in DejaVu beats no card, and this must never be the reason a
# publish fails.
FACES = {
    "display": ["IBMPlexSansCondensed-Bold.ttf", "C:/Windows/Fonts/segoeuib.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
    "body": ["IBMPlexSansCondensed-Regular.ttf", "C:/Windows/Fonts/segoeui.ttf",
             "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
    "mono": ["IBMPlexMono-Medium.ttf", "C:/Windows/Fonts/consola.ttf",
             "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"],
    "arabic": ["Almarai-Bold.ttf", "C:/Windows/Fonts/segoeui.ttf",
               "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
}


def font(face: str, size: int) -> ImageFont.FreeTypeFont:
    key = (face, size)
    if key not in _FONT_CACHE:
        for name in FACES[face]:
            path = FONTS / name if not name.startswith(("C:", "/")) else pathlib.Path(name)
            if path.exists():
                _FONT_CACHE[key] = ImageFont.truetype(str(path), size)
                break
        else:
            _FONT_CACHE[key] = ImageFont.load_default(size)
    return _FONT_CACHE[key]


_RESHAPER = None


def shape_arabic(text: str) -> str:
    """Join the letters and put them in visual order.

    Pillow draws a string one code point at a time unless it was built with
    Raqm, and the wheels here are not: `PIL.features.check("raqm")` is False.
    Unshaped Arabic comes out as disconnected letters in reverse order, which
    is not a typographic quibble, it is unreadable. These two pure-Python
    libraries do the same work with no system dependency, which is what makes
    them safe on a runner.

    `use_unshaped_instead_of_isolated` is load-bearing. The reshaper's normal
    output is Arabic Presentation Forms, and Almarai -- which is the site's
    Arabic face because it is CBE's own -- does not carry every isolated form
    in that block. A title like "(أ+ب+ج+د+هـ+و)", which is how CBE labels the
    parts of a total, came out as six tofu boxes. Falling back to the plain
    letter renders correctly and costs nothing: these are single letters, so
    there is no join to preserve.
    """
    global _RESHAPER
    if not ARABIC.search(text):
        return text
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display
    except ImportError:
        return text
    if _RESHAPER is None:
        _RESHAPER = arabic_reshaper.ArabicReshaper(
            configuration={"use_unshaped_instead_of_isolated": True})
    return get_display(_RESHAPER.reshape(text))


def wrap(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont,
         width: int, lines: int) -> list[str]:
    """Greedy wrap, truncated with an ellipsis rather than allowed to run off.

    CBE's titles are "<table> - <line>" and some of them are very long. A title
    that overruns the card is worse than one that stops."""
    # Measured on the shaped form, because joined Arabic is materially narrower
    # than the same letters unjoined and a title measured unshaped wraps early.
    measure = lambda s: draw.textlength(shape_arabic(s), font=f)
    words, out, current = text.split(), [], ""
    for word in words:
        trial = (current + " " + word).strip()
        if measure(trial) <= width or not current:
            current = trial
        else:
            out.append(current)
            current = word
            if len(out) == lines:
                break
    if len(out) < lines and current:
        out.append(current)
    if len(out) == lines and (len(" ".join(out)) < len(text)):
        last = out[-1]
        while last and measure(last + "...") > width:
            last = last[:-1].rstrip()
        out[-1] = last + "..."
    return out


def sparkline(draw: ImageDraw.ImageDraw, values: list[float],
              box: tuple[int, int, int, int], colour=TEAL) -> None:
    """Values only, no axis. Its job is to say rising, flat, or a cliff."""
    pts = [v for v in values if isinstance(v, (int, float))]
    if len(pts) < 2:
        return
    x0, y0, x1, y1 = box
    lo, hi = min(pts), max(pts)
    span = (hi - lo) or 1
    coords = [(x0 + (i / (len(pts) - 1)) * (x1 - x0), y1 - ((v - lo) / span) * (y1 - y0))
              for i, v in enumerate(pts)]
    draw.polygon(coords + [(x1, y1), (x0, y1)],
                 fill=tuple(int(INK[i] + (colour[i] - INK[i]) * 0.14) for i in range(3)))
    draw.line(coords, fill=colour, width=5, joint="curve")
    draw.ellipse([coords[-1][0] - 8, coords[-1][1] - 8, coords[-1][0] + 8, coords[-1][1] + 8],
                 fill=colour)


def triangle(draw: ImageDraw.ImageDraw, x: int, y: int, size: int, up: bool, colour) -> None:
    """The rise and fall arrow, drawn rather than typed.

    U+25B2 and U+25BC are not in IBM Plex Mono, and a missing glyph on a share
    card is a tofu box sitting next to the number -- the one thing on the card
    nobody can explain away. Two triangles are cheaper than carrying a fourth
    font for two characters.
    """
    half = size / 2
    points = ([(x, y), (x + size, y), (x + half, y - size * 0.85)] if up
              else [(x, y - size * 0.85), (x + size, y - size * 0.85), (x + half, y)])
    draw.polygon(points, fill=colour)


def column(draw: ImageDraw.ImageDraw) -> None:
    """The Nilometer, down the left edge. The one ornament, and the thing the
    site is named after: a graduated marble column Cairo read the flood
    against. It is the only part of the card that is the same on all of them,
    which is what makes it the mark."""
    for i in range(13):
        y = 52 + i * 42
        draw.rectangle([56, y, 62, y + 26], fill=GOLD)


def base() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (W, H), INK)
    draw = ImageDraw.Draw(img)
    column(draw)
    draw.text((110, 44), "MIQYAS", font=font("display", 44), fill=MARBLE)
    draw.text((110, H - 58),
              "UNOFFICIAL MIRROR  \u00b7  CENTRAL BANK OF EGYPT DATA  \u00b7  REBUILT EVERY MORNING",
              font=font("mono", 19), fill=MUTED)
    return img, draw


def save(img: Image.Image, path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)


# ---------- the cards ----------

def site_card(fx_spark: list[float] | None) -> Image.Image:
    img, d = base()
    d.text((110, 150), "Egypt's economy", font=font("display", 96), fill=MARBLE)
    d.text((110, 248), "in numbers. Free.", font=font("display", 96), fill=MARBLE)
    d.text((112, 376),
           "Every series the Central Bank publishes, cleaned, charted and searchable.",
           font=font("body", 30), fill=MUTED)
    if fx_spark:
        sparkline(d, fx_spark, (110, 440, W - 90, 552))
    return img


def series_card(meta: dict, values: list[float] | None, fmt, unit_tag,
                fmt_change, nice_date) -> Image.Image:
    img, d = base()
    unit = meta.get("unit")
    title = meta.get("title_en") or meta["series_id"]

    face = "arabic" if ARABIC.search(title) else "display"
    f_title = font(face, 46)
    # Wrap the logical string and shape each line, never the other way round:
    # shaping first puts the text in visual order, and breaking a visual-order
    # line leaves the two halves of an Arabic title in the wrong sequence.
    lines = wrap(d, title, f_title, W - 200, 2)
    for i, line in enumerate(lines):
        d.text((110, 128 + i * 58), shape_arabic(line), font=f_title, fill=MARBLE)

    # The figure sits under whatever the title took, so a one-line title does
    # not leave a hole in the middle of the card and a two-line one does not
    # crowd the number.
    y = 128 + len(lines) * 58 + 42

    f_big = font("mono", 104)
    reading = fmt(meta.get("latest_value"), unit)
    d.text((110, y), reading, font=f_big, fill=MARBLE)
    tag = (unit_tag(unit) or "").strip()
    if tag:
        d.text((110 + d.textlength(reading, font=f_big) + 16, y + 72), tag,
               font=font("mono", 30), fill=MUTED)
    y += 132

    previous = meta.get("previous")
    latest = meta.get("latest_value")
    if latest is not None and previous is not None:
        change = latest - previous
        # Red is only ever a fall. A rate rise is a fall for the reader holding
        # the pound, which is why the colour follows the number, not the mood.
        colour = CLAY if change < 0 else TEAL if change > 0 else MUTED
        x = 112
        if change:
            triangle(d, x, y + 22, 18, change > 0, colour)
            x += 30
        d.text((x, y), fmt_change(change, unit) + "  since the reading before",
               font=font("mono", 26), fill=colour)
        y += 40

    d.text((112, y), f"{meta.get('n', 0):,} readings  \u00b7  "
                     f"{nice_date(meta.get('first'))} to {nice_date(meta.get('last'))}",
           font=font("mono", 24), fill=MUTED)
    y += 36

    # The shape gets whatever is left under the text. A two-line title pushes
    # everything down, and a sparkline drawn at a fixed height then runs
    # straight through the coverage dates.
    top = max(y + 14, 470)
    if values and 556 - top >= 44:
        sparkline(d, values, (110, top, W - 90, 556))
    return img


def topic_card(name: str, blurb: str, count: int) -> Image.Image:
    img, d = base()
    f = font("display", 76)
    for i, line in enumerate(wrap(d, name, f, W - 200, 2)):
        d.text((110, 160 + i * 86), line, font=f, fill=MARBLE)
    fb = font("body", 30)
    for i, line in enumerate(wrap(d, blurb, fb, W - 200, 3)):
        d.text((112, 336 + i * 40), line, font=fb, fill=MUTED)
    d.text((112, 478), f"{count:,} SERIES  \u00b7  FROM THE CENTRAL BANK OF EGYPT",
           font=font("mono", 26), fill=GOLD)
    return img


# ---------- the run ----------

def main() -> int:
    import sys
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    import prerender  # the formatting is already written there; do not write it twice

    index = json.loads((DIST / "api" / "v1" / "series.json").read_text(encoding="utf-8"))
    sparks_path = DIST / "api" / "v1" / "sparks.json"
    sparks = json.loads(sparks_path.read_text(encoding="utf-8")) if sparks_path.exists() else {}

    out = DIST / "og"
    if out.is_dir():
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)

    save(site_card(sparks.get("EG.FX.OFF.USD.SELL")), DIST / "og.png")
    written = 1

    for meta in index:
        save(series_card(meta, sparks.get(meta["series_id"]), prerender.fmt,
                         prerender.unit_tag, prerender.fmt_change, prerender.nice_date),
             out / f"{meta['series_id']}.png")
        written += 1

    topics = prerender.load_topics()
    by_family = {f: t["key"] for t in topics for f in t["families"]}
    counts: dict[str, int] = {}
    for meta in index:
        key = by_family.get(meta.get("family") or "")
        if key:
            counts[key] = counts.get(key, 0) + 1
    for topic in topics:
        save(topic_card(topic["name"], topic["blurb"], counts.get(topic["key"], 0)),
             out / f"topic-{topic['key']}.png")
        written += 1

    total = sum(p.stat().st_size for p in out.rglob("*.png"))
    print(f"share cards: {written:,} drawn, {total/1e6:.0f} MB in dist/og/")
    return written


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
