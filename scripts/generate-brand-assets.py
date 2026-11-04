"""
Generate customization media for the example operators' keystones from their logos.

    python3 scripts/generate-brand-assets.py                     every operator below
    python3 scripts/generate-brand-assets.py ay-llu goat-members  only these operators / keystones

Reads brand-assets/sources/<operator>.(jpg|png) for the logo and data/store.json for each
keystone's name, dates and location, and writes brand-assets/<operator>/:

    background.jpg               1080x1920  Customize → Background           (shared)
    <keystone>/pass.png          1080x1350  Details tab → Keystone artwork
    <keystone>/banner.jpg        1800x600   Customize → Gallery → Banner

Dated keystones get the night look with rings and show their dates and location; ongoing
ones show their location when set. Re-run after editing a keystone's details to refresh its text.

The sources are small (150 px); replace them with the original high-res logos and
re-run for sharper results. Needs Pillow.
"""

import json
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), "..", "brand-assets")
STORE = os.path.join(os.path.dirname(__file__), "..", "data", "store.json")
FUTURA = "/System/Library/Fonts/Supplemental/Futura.ttc"
FONT = {"medium": 0, "bold": 2, "condensed": 4}

OPERATORS = {
    "ay-llu": {
        "name": "ay.llu",
        "shape": "disc",  # circular emblem on a white field
        "base": "#C26C6B",
        "deep": "#5E2A2B",
        "accent": "#F2C9A0",
    },
    "goat": {
        "name": "GOAT community",
        "shape": "disc",
        "base": "#A88A6E",
        "deep": "#3A2C20",
        "accent": "#F4EEE6",
    },
    "sahar-camp": {
        "name": "Sahar Camp",
        "shape": "mark",  # light mark on a dark square
        "base": "#2A2A2C",
        "deep": "#121214",
        "accent": "#C03437",
    },
}


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def font(kind, size):
    try:
        return ImageFont.truetype(FUTURA, size, index=FONT[kind])
    except OSError:
        return ImageFont.load_default(size)


def upscale(im, factor):
    big = im.resize((im.width * factor, im.height * factor), Image.LANCZOS)
    return big.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))


def load_source(op_id):
    for ext in ("png", "jpg", "jpeg", "webp"):
        p = os.path.join(ROOT, "sources", f"{op_id}.{ext}")
        if os.path.exists(p):
            return Image.open(p).convert("RGBA")
    raise SystemExit(f"Missing source logo for {op_id} in brand-assets/sources/")


def emblem(op_id, op):
    """The operator's logo as a transparent RGBA emblem, upscaled for print-size use."""
    src = load_source(op_id)
    w, h = src.size
    if op["shape"] == "disc":
        # Crop the round badge off its white field with an antialiased circular mask.
        scale = 4
        mask = Image.new("L", (w * scale, h * scale), 0)
        inset = 1.5 * scale
        ImageDraw.Draw(mask).ellipse((inset, inset, w * scale - inset, h * scale - inset), fill=255)
        mask = mask.resize((w, h), Image.LANCZOS)
        src.putalpha(mask)
        return upscale(src, 5)
    # Dark square with a red mark: key out the background by "redness".
    r, g, b, _ = src.split()
    redness = ImageChops.subtract(r, ImageChops.lighter(g, b))
    alpha = redness.point(lambda v: max(0, min(255, (v - 12) * 4)))
    mark = Image.new("RGBA", src.size, rgb(op["accent"]) + (0,))
    mark.putalpha(alpha)
    return upscale(mark, 5)


def radial(size, inner, outer, center=(0.5, 0.45), spread=1.25):
    """Inner color at `center`, fading to outer toward the edges."""
    w, h = size
    grad = Image.radial_gradient("L").resize((int(max(w, h) * spread * 2),) * 2, Image.BICUBIC)
    cx, cy = int(grad.width / 2 - w * center[0]), int(grad.height / 2 - h * center[1])
    mask = grad.crop((cx, cy, cx + w, cy + h))
    return Image.composite(Image.new("RGB", size, outer), Image.new("RGB", size, inner), mask)


def grain(im, strength=0.05):
    noise = Image.effect_noise(im.size, 64).convert("RGB")
    return Image.blend(im, ImageChops.overlay(im, noise), strength * 6)


def glow(canvas, center, radius, color, opacity):
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    cx, cy = center
    ImageDraw.Draw(layer).ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=color + (int(255 * opacity),))
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.45))
    canvas.alpha_composite(layer)


def paste_emblem(canvas, em, center, width, opacity=1.0, shadow=True):
    e = em.resize((width, round(em.height * width / em.width)), Image.LANCZOS)
    if opacity < 1:
        e.putalpha(e.getchannel("A").point(lambda a: int(a * opacity)))
    x, y = int(center[0] - e.width / 2), int(center[1] - e.height / 2)
    if shadow:
        sh = Image.new("RGBA", e.size, (0, 0, 0, 0))
        sh.putalpha(e.getchannel("A").point(lambda a: int(a * 0.45)))
        sh = sh.filter(ImageFilter.GaussianBlur(width * 0.04))
        canvas.alpha_composite(sh, (x, y + int(width * 0.03)))
    canvas.alpha_composite(e, (x, y))


def text(draw, xy, s, f, fill, anchor="mm", tracking=0):
    """Draw text, optionally letter-spaced (tracking in px between glyphs)."""
    if not tracking:
        draw.text(xy, s, font=f, fill=fill, anchor=anchor)
        return
    widths = [draw.textlength(c, font=f) for c in s]
    total = sum(widths) + tracking * (len(s) - 1)
    x, y = xy
    if anchor[0] == "m":
        x -= total / 2
    elif anchor[0] == "r":
        x -= total
    for c, cw in zip(s, widths):
        draw.text((x, y), c, font=f, fill=fill, anchor="l" + anchor[1])
        x += cw + tracking


def fit_font(draw, s, kind, max_w, start):
    size = start
    while size > 20 and draw.textlength(s, font=font(kind, size)) > max_w:
        size -= 2
    return font(kind, size)


# ── Asset builders ───────────────────────────────────────────────


MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split()


def format_dates(start, end):
    """Same shape as formatDates() in lib/keystones.ts, upper-cased: NOV 21 – 22, 2026."""
    y1, m1, d1 = (int(x) for x in start.split("-"))
    if not end or end == start:
        return f"{MONTHS[m1 - 1]} {d1}, {y1}"
    y2, m2, d2 = (int(x) for x in end.split("-"))
    if y1 == y2 and m1 == m2:
        return f"{MONTHS[m1 - 1]} {d1} – {d2}, {y1}"
    first = f"{MONTHS[m1 - 1]} {d1}" + ("" if y1 == y2 else f", {y1}")
    return f"{first} – {MONTHS[m2 - 1]} {d2}, {y2}"


def keystone_info(k):
    """Text for one keystone's art, straight from its saved details."""
    if k.get("startDate"):
        return {"title": k["name"], "kicker": format_dates(k["startDate"], k.get("endDate")), "line": k.get("location") or "", "dated": True}
    return {"title": k["name"], "kicker": "KEYSTONE", "line": k.get("location") or "", "dated": False}


def fit_line(draw, s, f, max_w):
    """Trim s with an ellipsis until it fits max_w."""
    if draw.textlength(s, font=f) <= max_w:
        return s
    while s and draw.textlength(s + "…", font=f) > max_w:
        s = s[:-1].rstrip()
    return s + "…"


def pass_art(op, em, info):
    """4:5 keystone artwork. The keystone card overlays its badge (top-left) and
    symbol + name (bottom), so the emblem sits centered with quiet edges."""
    W, H = 1080, 1350
    base, deep, accent = rgb(op["base"]), rgb(op["deep"]), rgb(op["accent"])
    disc = op["shape"] == "disc"  # round badges need a field darker than the badge to stand out
    if not info["dated"]:
        inner = mix(base, deep, 0.55) if disc else mix(base, (255, 255, 255), 0.08)
        bg = radial((W, H), inner, mix(deep, (0, 0, 0), 0.25 if disc else 0), center=(0.5, 0.4))
    else:  # dated keystones: a night version with a warm accent halo
        bg = radial((W, H), mix(deep, base, 0.35), mix(deep, (0, 0, 0), 0.55), center=(0.5, 0.4))
    c = grain(bg).convert("RGBA")
    glow(c, (W // 2, int(H * 0.4)), 420, accent if info["dated"] else mix(base, (255, 255, 255), 0.25), 0.35)
    if info["dated"]:
        d = ImageDraw.Draw(c)
        for i, r in enumerate((470, 520)):
            d.ellipse((W / 2 - r, H * 0.4 - r, W / 2 + r, H * 0.4 + r), outline=accent + (70 - i * 30,), width=3)
    paste_emblem(c, em, (W // 2, int(H * 0.4)), 640 if op["shape"] == "disc" else 720)
    return c.convert("RGB")


def background(op, em):
    """9:16 background: full-bleed on the claim screen, dimmed behind the gallery. Kept dark."""
    W, H = 1080, 1920
    base, deep, accent = rgb(op["base"]), rgb(op["deep"]), rgb(op["accent"])
    c = grain(radial((W, H), mix(deep, base, 0.45), mix(deep, (0, 0, 0), 0.6), center=(0.5, 0.25), spread=1.0), 0.07).convert("RGBA")
    glow(c, (int(W * 0.85), int(H * 0.12)), 520, accent, 0.18)
    glow(c, (int(W * 0.1), int(H * 0.9)), 600, base, 0.2)
    paste_emblem(c, em, (int(W * 0.72), int(H * 0.68)), 1100, opacity=0.09, shadow=False)
    return c.convert("RGB")


def banner(op, em, info):
    """3:1 gallery banner: emblem left, title right."""
    W, H = 1800, 600
    base, deep, accent = rgb(op["base"]), rgb(op["deep"]), rgb(op["accent"])
    t = 0.62 if op["shape"] == "disc" else 0.3
    c = grain(radial((W, H), mix(base, deep, t), mix(deep, (0, 0, 0), 0.5), center=(0.2, 0.5), spread=1.1)).convert("RGBA")
    glow(c, (int(W * 0.18), H // 2), 300, accent, 0.3)
    paste_emblem(c, em, (int(W * 0.18), H // 2), 400 if op["shape"] == "disc" else 440)
    d = ImageDraw.Draw(c)
    x = int(W * 0.36)
    text(d, (x, int(H * 0.33)), info["kicker"], font("medium", 30), accent, anchor="ls", tracking=6)
    d.text((x, int(H * 0.56)), info["title"], font=fit_font(d, info["title"], "bold", W - x - 100, 104), fill=(255, 255, 255), anchor="ls")
    line_font = font("medium", 38)
    d.text((x, int(H * 0.72)), fit_line(d, info["line"], line_font, W - x - 100), font=line_font, fill=mix((255, 255, 255), deep, 0.25), anchor="ls")
    return c.convert("RGB")



def main():
    # Optional args limit the run to operator ids and/or keystone slugs.
    only = set(sys.argv[1:])
    with open(STORE) as f:
        store = json.load(f)
    keystones = store.get("keystones") or []
    for op_id, op in OPERATORS.items():
        mine = [k for k in keystones if k.get("operatorId") == op_id]
        whole = not only or op_id in only
        picked = [k for k in mine if whole or k["slug"] in only]
        if not picked:
            continue
        out = os.path.join(ROOT, op_id)
        os.makedirs(out, exist_ok=True)
        em = emblem(op_id, op)
        for k in picked:
            info = keystone_info(k)
            kdir = os.path.join(out, k["slug"])
            os.makedirs(kdir, exist_ok=True)
            pass_art(op, em, info).save(os.path.join(kdir, "pass.png"), optimize=True)
            banner(op, em, info).save(os.path.join(kdir, "banner.jpg"), quality=90)
            print(f"  ✓ {k['slug']}")
        if whole:
            background(op, em).save(os.path.join(out, "background.jpg"), quality=88)
        print(f"✓ {op['name']:<16} → brand-assets/{op_id}/")


if __name__ == "__main__":
    main()
