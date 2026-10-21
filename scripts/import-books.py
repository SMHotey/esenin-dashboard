#!/usr/bin/env python3
# Импорт книг из «Читай-города»: метаданные + обложки + партнёрские ссылки → data/books.json
#
# Вход:
#   data/books-source.json — товары магазина (id, url, название, издательство, ISBN, страницы,
#                            переплёт, цена, наличие, ссылка на картинку, партнёрская ссылка);
# Выход:
#   data/books.json        — записи для сайта (в формате, который читает scripts/build.mjs);
#   public/img/books/*     — обложки в JPEG и WebP по 700 px по ширине.
#
# Запуск:  python scripts/import-books.py [--limit N] [--no-download]
import argparse
import hashlib
import io
import json
import os
import re
import sys
import time
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "books-source.json")
OUT = os.path.join(ROOT, "data", "books.json")
COVERS = os.path.join(ROOT, "public", "img", "books")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}

# ---------- категории: по названию определяем тип издания ----------

CATEGORY_RULES = [
    ("Двуязычное издание", r"a kiss before drowning|bilingual|двуязыч|поцелуй да в омут"),
    ("Собрание сочинений", r"собрани[ея] сочинений|полное собрание|сочинени[йя] в \d+ том|собрание сочинени|малое собрание|сочинения в \d+"),
    ("Проза и письма", r"проза|письма|очерки|статьи|ключи марии|у белой воды|железный миргород"),
    ("Детям", r"детям|малыш|детск"),
    ("Школьная программа", r"внеклассн|школьн|хрестомат|учебн|для школьников|юрайт"),
    ("Стихотворения и поэмы", r"стихотворения и поэмы|стихи и поэмы|стихотворения\. поэмы|стихотворения\. поэмы"),
    ("Поэмы", r"\bпоэм"),
    ("Избранное", r"избранн"),
    ("Стихотворения", r"стих|поэзия|лирика"),
]

ANNOTATIONS = {
    "Собрание сочинений": [
        "Полный или многотомный свод: лирика, поэмы, проза и статьи в одном издании. Для тех, кому нужен корпус, а не выбранные строки.",
        "Собрание под одной обложкой (или в комплекте томов): от ранних стихов до поздних поэм и прозы.",
        "Издание для чтения вдоль и поперёк: весь путь поэта, собранный в одном комплекте.",
    ],
    "Проза и письма": [
        "Не стихи: проза, очерки и письма — сторона Есенина, которую знают хуже всего.",
        "Издание для тех, кто уже прошёл лирику и хочет услышать голос поэта в письмах и заметках.",
        "Прозаические тексты и переписка: рабочий, дневниковый Есенин — материал для внимательного чтения.",
    ],
    "Детям": [
        "Сборник для детского чтения: короткие стихи о природе и деревне, понятные с первого раза.",
        "Издание для семейного чтения — с теми стихами, которые легко учатся наизусть.",
        "Детская подборка: времена года, зверьё, деревенский день.",
    ],
    "Школьная программа": [
        "Школьная программа: тексты, которые разбирают на уроках, с комментариями и заданиями.",
        "Издание для уроков литературы — те же стихотворения и поэмы, что в программе.",
        "Учебное издание с методическим аппаратом: удобно для подготовки к урокам и сочинениям.",
    ],
    "Поэмы": [
        "Только поэмы — крупная форма: от «Пугачёва» и «Страны негодяев» до «Анны Снегиной».",
        "Поэмы собраны отдельно: сюжетный, повествовательный Есенин.",
        "Издание поэм — тех текстов, где у Есенина появляется большая форма.",
    ],
    "Избранное": [
        "Отобранное лучшее: стихи, которые перечитывают, без малоизвестного балласта.",
        "Избранное — компактный вход в лирику, если нужен один том на полке.",
        "Подборка ключевых текстов: и ранние деревенские стихи, и поздние признания.",
    ],
    "Стихотворения и поэмы": [
        "Стихи и поэмы вместе: обычный набор издания для «Есенина на всю жизнь».",
        "И лирика, и крупные вещи в одном томе — от «Черёмухи» до «Чёрного человека».",
        "Классический состав: стихотворения и поэмы разных лет.",
    ],
    "Стихотворения": [
        "Только стихотворения: лирика разных лет, без прозы и поэм.",
        "Сборник лирики — то, что чаще всего ищут: пейзаж, деревня, любовь, поздние строки.",
        "Стихотворения в хронологическом порядке — видно, как меняется голос.",
    ],
    "Книга о поэте": [
        "Издание о жизни поэта: биография, документы, свидетельства современников.",
        "Не тексты Есенина, а разговор о нём: как жил, с кем дружил, почему спорили о его смерти.",
        "Книга о судьбе поэта — для тех, кому нужен контекст, а не только стихи.",
    ],
}


def category_of(title: str) -> str:
    low = title.lower()
    for name, pattern in CATEGORY_RULES:
        if re.search(pattern, low):
            return name
    return "Стихотворения"


def annotate(title: str, cat: str, publisher: str, pages, cover_type: str, pid: str) -> str:
    variants = ANNOTATIONS.get(cat) or ANNOTATIONS["Стихотворения"]
    idx = int(hashlib.md5(pid.encode()).hexdigest(), 16) % len(variants)
    text = variants[idx]
    extra = []
    if pages:
        extra.append(f"{pages} с.")
    if cover_type:
        extra.append(cover_type.lower().replace("твердая", "твёрдый").replace("мягкая", "мягкая")
                     .replace("обложка", "переплёт" if "тверд" in cover_type.lower() else "обложка"))
    if publisher:
        extra.append(publisher)
    if extra:
        text += " " + ", ".join(extra) + "."
    return text


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:70]


def fetch(url: str, tries: int = 3) -> bytes:
    last = None
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"{type(last).__name__}: {last}")


def make_cover(image_url: str, base: str, width: int = 400) -> dict | None:
    """Скачивает обложку и кладёт рядом JPEG и WebP.
    Ширина 400 px с запасом покрывает карточку (150 px) на экранах с двойной плотностью."""
    for candidate in (f"{image_url}?width={width}", image_url):
        try:
            raw = fetch(candidate)
            im = Image.open(io.BytesIO(raw)).convert("RGB")
            break
        except Exception:
            im = None
    if im is None:
        return None
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    jpg = os.path.join(COVERS, f"{base}.jpg")
    webp = os.path.join(COVERS, f"{base}.webp")
    im.save(jpg, "JPEG", quality=80, optimize=True, progressive=True)
    im.save(webp, "WEBP", quality=75, method=6)
    return {"coverWidth": im.width, "coverHeight": im.height, "bytes": os.path.getsize(jpg)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--no-download", action="store_true")
    ap.add_argument("--include-out-of-stock", action="store_true",
                    help="включить книги, которых сейчас нет в наличии (по умолчанию только доступные к покупке)")
    args = ap.parse_args()

    source = json.load(open(SRC, encoding="utf-8"))
    total_source = len(source)
    if not args.include_out_of_stock:
        source = [x for x in source if (x.get("availability") or "InStock") == "InStock"]
    if args.limit:
        source = source[: args.limit]
    os.makedirs(COVERS, exist_ok=True)

    books, skipped = [], []
    for i, item in enumerate(source, 1):
        title = re.sub(r"\s+", " ", item.get("title") or "").strip()
        pid = str(item.get("id") or "")
        if not title or not pid:
            skipped.append(item)
            continue
        slug = slugify(item.get("slug") or title) or f"book-{pid}"
        base = f"{slug}-{pid}"
        cat = category_of(title)
        book = {
            "id": base,
            "productId": pid,
            "title": title,
            "format": "Бумажная книга",
            "publisher": item.get("publisher") or "",
            "isbn": item.get("isbn") or "",
            "pages": item.get("pages") or "",
            "coverType": item.get("cover_type") or "",
            "productUrl": item.get("url") or "",
            "stores": ["chitai-gorod"],
            "links": [{"store": "chitai-gorod", "url": item["affiliate"]}] if item.get("affiliate") else [],
            "category": cat,
            "tags": [t for t in [item.get("cover_type") or "", cat, item.get("publisher") or ""] if t][:3],
            "searchQuery": f"Есенин {title}",
            "cover": f"/img/books/{base}.jpg",
            "coverWebp": f"/img/books/{base}.webp",
            "coverAlt": f"{title} — обложка издания",
            "coverCredit": "Фото: Читай-город",
        }
        if item.get("price"):
            book["price"] = float(item["price"])
            book["priceCurrency"] = "RUB"
        if item.get("availability"):
            book["availability"] = item["availability"]
        if item.get("price_checked"):
            book["priceCheckedAt"] = item["price_checked"]
        book["annotation"] = annotate(title, cat, book["publisher"], book["pages"], book["coverType"], pid)

        if args.no_download:
            books.append(book)
            continue
        info = make_cover(item.get("image") or "", base)
        if info:
            book.update({k: v for k, v in info.items() if k != "bytes"})
        books.append(book)
        print(f"[{i}/{len(source)}] {pid} {title[:48]:<48} {cat:<22} {info['bytes'] if info else '—':>7}", flush=True)
        time.sleep(0.4)

    json.dump(books, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print()
    print(f"в источнике: {total_source} книг, в наличии: {len([x for x in json.load(open(SRC, encoding='utf-8')) if (x.get('availability') or 'InStock') == 'InStock'])}")
    print(f"записано книг: {len(books)} (пропущено {len(skipped)}) → {OUT}")
    by_cat = {}
    for b in books:
        by_cat[b["category"]] = by_cat.get(b["category"], 0) + 1
    for k, v in sorted(by_cat.items(), key=lambda kv: -kv[1]):
        print(f"   {k}: {v}")
    no_cover = [b["id"] for b in books if not b.get("coverWidth")]
    print(f"без обложки: {len(no_cover)}" + (f" ({', '.join(no_cover[:5])})" if no_cover else ""))
    no_link = [b["id"] for b in books if not b.get("links")]
    print(f"без партнёрской ссылки: {len(no_link)}" + (f" ({', '.join(no_link[:5])})" if no_link else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
