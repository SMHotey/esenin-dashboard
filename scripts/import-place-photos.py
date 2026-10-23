# Импорт фото есенинских мест с Викисклада:
#   python scripts/import-place-photos.py [--force]
# Для каждого места из PLACES скачивает выбранный файл, берёт автора и лицензию
# из метаданных Commons, уменьшает до 1600 px по ширине и пишет
# public/img/places/<id>.jpg + .webp, а в data/places.json — поля
# photo / photoWebp / photoAlt / photoCredit / photoLicense / photoSource.
import json, os, sys, time, urllib.request, urllib.parse, io
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "img", "places")
DATA = os.path.join(ROOT, "data", "places.json")
UA = "poet-esenin.ru/1.0 (educational; contact: site)"
API = "https://commons.wikimedia.org/w/api.php"
MAX_W = 1600

# id места → (файл Викисклада, альт текст для img alt)
PLACES = {
    "konstantinovo": (
        "File:Усадьба, в которой в 1895 году родился и жил поэт С.А.Есенин - 1.jpg",
        "Усадьба Есениных в Константинове — дом, где родился поэт"),
    "spass-klepiki": (
        "File:Спас-Клепики — город в Рязанской области, фото № 10.jpg",
        "Вид на Спас-Клепики — город, где Есенин учился во второй классной школе"),
    "ryazan": (
        "File:Г. Рязань, Соборная площадь, 21, фото 1.jpg",
        "Здание бывших присутственных мест на Соборной площади Рязани"),
    "moskva": (
        "File:Музей Есенина 4.jpg",
        "Дом на Большом Строченовском переулке, где в 1912—1913 годах жил Сергей Есенин"),
    "peterburg": (
        "File:Angleterre Hotel.jpg",
        "Гостиница «Англетер» на Соборной площади Петербурга"),
    "tiflis": (
        "File:Geo1213 0200.jpg",
        "Старый город Тифлиса — вид на узкие улицы и балконы"),
    "baku": (
        "File:Баку, Ичери-шехер, внутри.jpg",
        "Улицы старого города Баку — Ичери-шехер"),
    "zarubezhye": (
        "File:Gruss aus Berlin — Unter den Linden - Café Bauer.jpg",
        "Берлин, улица Унтер-ден-Линден с кафе Bauer — открытка 1920-х"),
}


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read() if binary else r.read().decode("utf-8")


def metadata(title):
    params = {"action": "query", "format": "json", "titles": title,
              "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": MAX_W}
    d = json.loads(fetch(API + "?" + urllib.parse.urlencode(params)))
    page = next(iter(d["query"]["pages"].values()))
    ii = (page.get("imageinfo") or [None])[0]
    if not ii:
        raise SystemExit("нет imageinfo: " + title)
    em = ii.get("extmetadata", {})
    artist = em.get("Artist", {}).get("value", "")
    import re
    artist = re.sub(r"<[^>]+>", "", artist or "").strip() or "Неизвестен"
    return {
        "thumb": ii.get("thumburl") or ii["url"],
        "page": ii.get("descriptionurl"),
        "license": (em.get("LicenseShortName", {}) or {}).get("value", ""),
        "artist": artist,
        "desc": re.sub(r"<[^>]+>", "", (em.get("ImageDescription", {}) or {}).get("value", "") or "").strip(),
    }


def main():
    force = "--force" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    places = json.load(open(DATA, encoding="utf-8"))
    by_id = {p["id"]: p for p in places}
    for pid, (title, alt) in PLACES.items():
        p = by_id.get(pid)
        if not p:
            print("нет места", pid)
            continue
        jpg = os.path.join(OUT, pid + ".jpg")
        webp = os.path.join(OUT, pid + ".webp")
        if p.get("photo") and os.path.exists(jpg) and os.path.exists(webp) and not force:
            print(pid, "уже есть")
            continue
        print(pid, "->", title)
        m = metadata(title)
        raw = fetch(m["thumb"], binary=True)
        im = Image.open(io.BytesIO(raw))
        im = ImageOps.exif_transpose(im)
        if im.mode != "RGB":
            im = im.convert("RGB")
        if im.width > MAX_W:
            im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.Resampling.LANCZOS)
        im.save(jpg, "JPEG", quality=84, optimize=True, progressive=True)
        im.save(webp, "WEBP", quality=80, method=6)
        p["photo"] = f"/img/places/{pid}.jpg"
        p["photoWebp"] = f"/img/places/{pid}.webp"
        p["photoAlt"] = alt
        p["photoCredit"] = m["artist"]
        p["photoLicense"] = m["license"]
        p["photoSource"] = m["page"]
        print("   ", im.size, m["license"], "|", m["artist"][:50])
        time.sleep(1.5)
    json.dump(places, open(DATA, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("places.json обновлён")


if __name__ == "__main__":
    main()
