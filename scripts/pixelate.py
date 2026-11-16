"""Turn the raw concept art into crisp, game-ready pixel sprites.

The source paintings sit on a flat magenta background. For each one we key out
the magenta, crop to the subject, shrink it onto a real pixel grid, cut the
palette down and (for sheets) split it into single icons.

    python3 scripts/pixelate.py <raw_art_dir>
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else "art/raw"
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "sprites")


def key_magenta(im):
    a = np.array(im.convert("RGBA")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bg = (r > 150) & (b > 150) & (g < 110) & (abs(r - b) < 90)
    a[..., 3] = np.where(bg, 0, 255)
    return Image.fromarray(a.astype("uint8"), "RGBA")


def crop(im):
    box = im.getbbox()
    return im.crop(box) if box else im


def pixelate(im, width, colors=40):
    h = max(1, round(im.height * width / im.width))
    small = im.resize((width, h), Image.BOX)
    arr = np.array(small)
    alpha = arr[..., 3] > 140
    rgb = Image.fromarray(arr[..., :3]).quantize(colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    out = np.dstack([np.array(rgb), np.where(alpha, 255, 0).astype("uint8")])
    return Image.fromarray(out, "RGBA")


def runs(line, min_gap):
    """Spans of True in a 1D array, ignoring gaps shorter than min_gap."""
    spans, start, gap = [], None, 0
    for i, v in enumerate(line):
        if v:
            if start is None:
                start = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                spans.append([start, i - gap + 1])
                start, gap = None, 0
    if start is not None:
        spans.append([start, len(line) - gap])
    return spans


def split(im, expect):
    """Cut a sheet laid out in rows of icons, in reading order."""
    mask = np.array(im)[..., 3] > 0
    pieces = []
    for y0, y1 in runs(mask.any(axis=1), 12):
        band = mask[y0:y1]
        cols = runs(band.any(axis=0), 12)
        for x0, x1 in cols:
            pieces.append([y0, y1, x0, x1])
    # sparkles and stray bits become their own pieces; fold them into the nearest neighbour
    while len(pieces) > expect:
        sizes = [mask[a:b, c:d].sum() for a, b, c, d in pieces]
        i = int(np.argmin(sizes))
        a = pieces.pop(i)
        cy, cx = (a[0] + a[1]) / 2, (a[2] + a[3]) / 2
        j = min(range(len(pieces)), key=lambda k: abs((pieces[k][0] + pieces[k][1]) / 2 - cy) * 3 + abs((pieces[k][2] + pieces[k][3]) / 2 - cx))
        b = pieces[j]
        pieces[j] = [min(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), max(a[3], b[3])]
    pieces.sort(key=lambda q: (q[0] // 64, q[2]))
    return [crop(im.crop((x0, y0, x1, y1))) for y0, y1, x0, x1 in pieces]


def main_blob(im):
    """Drop slivers of neighbouring icons that leak over a grid line."""
    a = np.array(im)
    labels, n = ndimage.label(ndimage.binary_dilation(a[..., 3] > 0, iterations=6))
    if n > 1:
        sizes = ndimage.sum(np.ones_like(labels), labels, range(1, n + 1))
        keep = [i + 1 for i, v in enumerate(sizes) if v >= sizes.max() * 0.08]
        a[..., 3] = np.where(np.isin(labels, keep), a[..., 3], 0)
    return crop(Image.fromarray(a, "RGBA"))


def grid(im, cols, rows):
    w, h = im.width // cols, im.height // rows
    return [main_blob(im.crop((c * w, r * h, (c + 1) * w, (r + 1) * h))) for r in range(rows) for c in range(cols)]


def save(im, name):
    path = os.path.join(OUT, name + ".png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)
    return {"w": im.width, "h": im.height}


meta = {}

SINGLES = {
    "tree/oak": ("tree/1.png", 120),
    "tree/maple": ("tree/2.png", 120),
    "tree/birch": ("tree/3.png", 104),
    "tree/ancient": ("tree/4.png", 130),
    "tree/stump": ("stump/2.png", 72),
    "paw/rusty": ("paw/3.png", 84),
    "paw/copper": ("pawtools/copper.png", 84),
    "paw/steel": ("pawtools/steel.png", 84),
    "paw/gold": ("pawtools/gold.png", 84),
    "paw/iridium": ("pawtools/iridium.png", 84),
    "paw/diamond": ("pawtools/diamond.png", 84),
    "paw/chainsaw": ("pawtools/chainsaw.png", 84),
    "beaver/mascot": ("mascot/1.png", 72),
    "beaver/golden": ("goldbeaver/4.png", 56),
    "casino/slot": ("slotempty/1.png", 120),
}
for name, (src, w) in SINGLES.items():
    im = crop(key_magenta(Image.open(os.path.join(SRC, src))))
    meta[name] = save(pixelate(im, w), name)

SHEETS = {
    "tools": ("tools/5.png", ["copper", "steel", "gold", "iridium", "diamond", "chainsaw"], 32),
    "currency": ("currency/1.png", ["coin", "log"], 24),
    "shop_a": ("shop/5.png", ["robot_arm", "gnome", "fertilizer", "watering_can", "saw_blade", "log_splitter", "money_bag", "golden_tree"], 32),
    "shop_b": ("shop/4.png", ["beaver_worker", "lumberjack", "sawmill", "syrup_factory", "paper_mill", "furniture_shop", "cargo_ship", "skyscraper"], 32),
    "slots": ("symbols/5.png", ["seven", "coin", "log", "leaf", "beaver", "gem"], 28),
}
for group, (src, names, w) in SHEETS.items():
    im = key_magenta(Image.open(os.path.join(SRC, src)))
    parts = grid(im, 4, 2) if group.startswith("shop") else split(im, len(names))
    folder = {"shop_a": "shop", "shop_b": "shop"}.get(group, group)
    for name, part in zip(names, parts):
        meta[f"{folder}/{name}"] = save(pixelate(part, w, 32), f"{folder}/{name}")

meta["tools/rusty"] = save(pixelate(split(key_magenta(Image.open(os.path.join(SRC, "tools/2.png"))), 6)[0], 32, 32), "tools/rusty")

for name, src in {"bg/meadow": "bg/1.png", "bg/autumn": "bg/2.png", "bg/night": "bg/5.png"}.items():
    im = Image.open(os.path.join(SRC, src)).convert("RGB")
    small = im.resize((384, 256), Image.BOX).quantize(64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    small.save(os.path.join(OUT, name + ".png"))
    meta[name] = {"w": 384, "h": 256}

with open(os.path.join(OUT, "sprites.json"), "w") as f:
    json.dump(meta, f, indent=1, sort_keys=True)
print(f"wrote {len(meta)} sprites")
