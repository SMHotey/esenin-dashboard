#!/usr/bin/env python3
"""Собирает OG-картинку 1200×630 из данных проекта.

Требуется Pillow:  python -m pip install pillow
Запуск:            python scripts/make-og.py [--out public/img/og.jpg]

Читает site.config.json (author, siteUrl) и data/*.json для счётчиков.
Если портрет не задан, рисует монограмму.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path.cwd()
W, H = 1200, 630
PAPER = (247, 242, 232)
INK = (30, 27, 23)
SOFT = (58, 53, 45)
MUTED = (111, 101, 87)
GOLD = (169, 134, 72)
CARD = (251, 248, 241)
LINE = (216, 203, 180)

FONT_DIRS = [Path("C:/Windows/Fonts"), Path("/usr/share/fonts/truetype"), Path("/Library/Fonts")]


def font(size, bold=False, serif=True):
    names = []
    if serif:
        names = ["georgiab.ttf", "georgia.ttf"] if bold else ["georgia.ttf", "georgiab.ttf"]
    else:
        names = ["seguisb.ttf", "segoeuib.ttf", "segoeui.ttf"] if bold else ["segoeui.ttf", "seguisb.ttf"]
    names += ["DejaVuSerif-Bold.ttf", "DejaVuSerif.ttf"] if serif else ["DejaVuSans-Bold.ttf", "DejaVuSans.ttf"]
    for folder in FONT_DIRS:
        for name in names:
            p = folder / name
            if p.exists():
                return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def tracked(draw, xy, text, fnt, fill, spacing=4):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + spacing
    return x


def arch_mask(size):
    w, h = size
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([0, 0, w, w], fill=255)
    d.rectangle([0, w // 2, w, h], fill=255)
    return mask


def plural(n, one, few, many):
    n = abs(int(n))
    if 10 < n % 100 < 20:
        return many
    if 1 < n % 10 < 5:
        return few
    if n % 10 == 1:
        return one
    return many


def main():
    out = ROOT / "public" / "img" / "og.jpg"
    argv = sys.argv[1:]
    if "--out" in argv:
        out = ROOT / argv[argv.index("--out") + 1]

    config = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
    author = config["author"]
    counts = {}
    for key in ("works", "people", "books", "research"):
        p = ROOT / "data" / f"{key}.json"
        counts[key] = len(json.loads(p.read_text(encoding="utf-8"))) if p.exists() else 0

    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)

    # мягкое золотое свечение справа
    glow = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([620, -180, 1320, 620], fill=42)
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    img.paste(Image.new("RGB", (W, H), GOLD), (0, 0), glow)
    d = ImageDraw.Draw(img)

    # текстовая колонка
    x = 84
    tracked(d, (x, 96), (author.get("role") or "писатель").upper(), font(17, bold=True, serif=False), GOLD, 5)
    d.line([(x, 136), (x + 64, 136)], fill=GOLD, width=2)

    name = author.get("name") or author.get("fullName", "")
    first, _, last = name.partition(" ")
    d.text((x, 176), first.upper(), font=font(30, bold=False, serif=False), fill=MUTED)
    d.text((x, 216), last or name, font=font(86, bold=True), fill=INK)

    d.text((x, 332), author.get("years", ""), font=font(30, bold=False, serif=True), fill=GOLD)

    subtitle = " · ".join(
        part for part in [
            f"{counts['works']} {plural(counts['works'], 'произведение', 'произведения', 'произведений')}" if counts["works"] else "",
            f"{counts['people']} {plural(counts['people'], 'персона', 'персоны', 'персон')}" if counts["people"] else "",
            f"{counts['books']} {plural(counts['books'], 'издание', 'издания', 'изданий')}" if counts["books"] else "",
            f"{counts['research']} {plural(counts['research'], 'работа', 'работы', 'работ')} о нём" if counts["research"] else "",
        ] if part
    )
    d.text((x, 398), subtitle, font=font(24, bold=False, serif=False), fill=SOFT)

    d.line([(x, 470), (x + 470, 470)], fill=LINE, width=2)
    d.text((x, 492), "биография · библиотека · книги · наука", font=font(20, bold=False, serif=False), fill=MUTED)

    host = config.get("siteUrl", "").replace("https://", "").replace("http://", "").rstrip("/")
    if host:
        d.text((x, 552), host, font=font(17, bold=False, serif=False), fill=GOLD)

    # портрет в арке
    portrait_rel = author.get("portrait", "")
    portrait_path = ROOT / "public" / portrait_rel.lstrip("/") if portrait_rel else None
    box_w, box_h = 330, 440
    bx, by = 790, 95
    if portrait_path and portrait_path.exists():
        im = Image.open(portrait_path).convert("RGB")
        target = box_w / box_h
        w, h = im.size
        if w / h > target:
            nw = int(h * target)
            im = im.crop(((w - nw) // 2, 0, (w + nw) // 2, h))
        else:
            nh = int(w / target)
            im = im.crop((0, (h - nh) // 2, w, (h + nh) // 2))
        im = im.resize((box_w, box_h), Image.LANCZOS)
        mask = arch_mask((box_w, box_h))
        shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        sd.rounded_rectangle([bx + 10, by + 14, bx + box_w + 14, by + box_h + 18], radius=18, fill=(60, 45, 25, 70))
        shadow = shadow.filter(ImageFilter.GaussianBlur(18))
        img.paste(shadow, (0, 0), shadow.split()[3])
        img.paste(im, (bx, by), mask)
    else:
        initials = (first[:1] + (last or name)[:1]).upper()
        d.rounded_rectangle([bx, by, bx + box_w, by + box_h], radius=18, outline=LINE, width=3, fill=CARD)
        f = font(140, bold=True)
        tw = d.textlength(initials, font=f)
        d.text((bx + (box_w - tw) / 2, by + 120), initials, font=f, fill=GOLD)
        d.text((bx + 40, by + 300), author.get("years", ""), font=font(22, serif=False), fill=MUTED)

    d.rectangle([0, H - 1, W, H], fill=LINE)

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "JPEG", quality=92, optimize=True)
    print("saved", out, f"{out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
