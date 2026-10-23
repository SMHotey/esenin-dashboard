# Загрузка изображений с Викисклада для карточек разделов:
#   python scripts/import-media.py [--force]
# Что делает:
#   1) скачивает выбранные файлы (PD/CC0/CC BY/CC BY-SA), приводит к ширине 1600 px,
#      сохраняет JPEG + WebP в public/img/<папка>/;
#   2) прописывает photo / photoWebp / photoAlt / photoCredit / photoLicense / photoSource
#      в data/museums.json, data/monuments.json, data/topics.json;
#   3) для изображений, которые уже лежат в проекте (места, портреты), ничего не скачивает,
#      а только ссылается на готовый файл.
# Идемпотентен: повторный запуск не качает заново (сброс — флагом --force).
import io, json, os, re, sys, time, urllib.parse, urllib.request

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "poet-esenin.ru/1.0 (educational site; media import)"}
API = "https://commons.wikimedia.org/w/api.php"
MAX_W = 1600
# Портретные снимки эпохи показываются шириной ~900 px — 1600 px там лишний вес.
FOLDER_WIDTH = {"era": 1100, "topics": 1400, "museums": 1400, "monuments": 1400}
FORCE = "--force" in sys.argv
ONLY = ""
if "--only" in sys.argv:
    ONLY = sys.argv[sys.argv.index("--only") + 1]


def fetch(url, timeout=120, tries=6):
    delay = 4.0
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:
            if a == tries - 1:
                raise
            print("   повтор", a + 1, type(e).__name__, "- ждём %.0f c" % delay)
            time.sleep(delay)
            delay = min(delay * 2, 60)


def metadata(title):
    params = {"action": "query", "format": "json", "titles": title,
              "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": MAX_W}
    d = json.loads(fetch(API + "?" + urllib.parse.urlencode(params)).decode("utf-8"))
    page = next(iter(d["query"]["pages"].values()))
    ii = (page.get("imageinfo") or [None])[0]
    if not ii:
        raise SystemExit("нет imageinfo: " + title)
    em = ii.get("extmetadata", {})
    artist = re.sub(r"<[^>]+>", "", em.get("Artist", {}).get("value", "") or "").strip()
    return {
        "thumb": ii.get("thumburl") or ii["url"],
        "page": ii.get("descriptionurl", ""),
        "license": (em.get("LicenseShortName", {}) or {}).get("value", ""),
        "artist": artist or "Wikimedia Commons",
        "width": ii.get("width"), "height": ii.get("height"),
    }


BAD = ("добросовестное", "fair use", "non-free", "несвобод")


def download(key, folder, title, alt, credit_note=""):
    out = os.path.join(ROOT, "public", "img", folder)
    os.makedirs(out, exist_ok=True)
    jpg = os.path.join(out, key + ".jpg")
    webp = os.path.join(out, key + ".webp")
    m = metadata(title)
    if any(b in m["license"].lower() for b in BAD):
        print("ПРОПУСК (лицензия):", key, m["license"])
        return None
    width = FOLDER_WIDTH.get(folder, MAX_W)
    if FORCE or not (os.path.exists(jpg) and os.path.exists(webp)):
        raw = fetch(m["thumb"])
        im = Image.open(io.BytesIO(raw))
        im = ImageOps.exif_transpose(im)
        if im.mode != "RGB":
            im = im.convert("RGB")
        if im.width > width:
            im = im.resize((width, round(im.height * width / im.width)), Image.Resampling.LANCZOS)
        im.save(jpg, "JPEG", quality=84, optimize=True, progressive=True)
        im.save(webp, "WEBP", quality=80, method=6)
        print("   ", im.size, m["license"], "|", m["artist"][:50])
    with Image.open(jpg) as im0:
        w, h = im0.size
    time.sleep(1.6)
    return {
        "photo": "/img/%s/%s.jpg" % (folder, key),
        "photoWebp": "/img/%s/%s.webp" % (folder, key),
        "photoW": w, "photoH": h,
        "photoAlt": alt,
        "photoCredit": (m["artist"] or "Wikimedia Commons") + ((" · " + credit_note) if credit_note else ""),
        "photoLicense": m["license"],
        "photoSource": m["page"],
    }


# ---------- план загрузки ----------
# (папка, ключ, файл Викисклада, alt-текст)
MEDIA = {
    "era": {
        "yesenin-1914": ("Сергей Есенин в 1914 году.jpg", "Сергей Есенин, 1914 год"),
        "yesenin-1919": ("Сергей Есенин в 1919 году.jpg", "Сергей Есенин, 1919 год"),
        "yesenin-1921": ("Сергей Есенин (1921).jpg", "Сергей Есенин, 1921—1922 годы"),
        "yesenin-1922": ("Сергей Есенин (1922).jpg", "Сергей Есенин, 1922 год"),
        "yesenin-1923": ("Сергей Есенин в 1923 году.jpg", "Сергей Есенин, 1923 год"),
        "yesenin-1924": ("Есенин Сергей 1924.jpg", "Сергей Есенин, 1924 год"),
        "yesenin-1925": ("Esenin1925.jpg", "Сергей Есенин, 1925 год"),
        "yesenin-portrait": ("Есенин портрет (cropped).jpg", "Портрет Сергея Есенина с автографом"),
        "yesenin-duncan": ("Yesenin Dunkan.jpg", "Сергей Есенин и Айседора Дункан"),
        "yesenin-imagists": ("Имажинисты (1919).jpg", "Имажинисты: Сергей Есенин, Анатолий Мариенгоф, Вадим Шершеневич, Иван Грузинов"),
        "klyuev-yesenin-1915": ("Клюев и Есенин в Петрограде в 1915 году.jpg", "Николай Клюев и Сергей Есенин, Петроград, 1915 год"),
        "yesenin-parents": ("Esenin's parents (1905).jpg", "Александр Никитич и Татьяна Фёдоровна Есенины, родители поэта, 1905 год"),
    },
    "museums": {
        "konstantinovo-museum": ("Реконструированный дом родителей С.А.Есенина.jpg",
                                 "Дом родителей поэта в Константинове — главный объект музея-заповедника"),
        "moskovskii-museum": ("Музей Есенина 4.jpg",
                              "Дом на Большом Строченовском переулке, где жил Есенин: ныне музей"),
        "esenin-centr": ("Музей Есенина - panoramio.jpg",
                         "Флигель усадьбы Карла Мейера в переулке Чернышевского: здание Есенин-центра"),
        "spass-school": ("Здание школы, где учился С.А. Есенин.jpg",
                         "Второклассная учительская школа в Спас-Клепиках"),
    },
    "monuments": {
        "tverskoi": ("Памятник Есенину 2015-10.jpg", "Памятник Сергею Есенину на Тверском бульваре в Москве"),
        "vagankovo": ("Могила Сергея Есенина в 1983 году.jpg", "Могила Сергея Есенина на Ваганьковском кладбище"),
        "ryazan-monument": ("Рязань Памятник Есенину 2026.jpg", "Памятник Сергею Есенину на Трубежной набережной в Рязани"),
    },
    "topics": {
        "priroda": ("Levitan Zolotaya Osen.jpg", "Исаак Левитан. «Золотая осень», 1895"),
        "rodina": ("Vladimirka without frame.jpg", "Исаак Левитан. «Владимирка», 1892"),
        "derevnya": ("Fair. Kustodiev.jpg", "Борис Кустодиев. «Ярмарка», 1906"),
        "lyubov": ("Yesenin Dunkan.jpg", "Сергей Есенин и Айседора Дункан, 1922"),
        "mater": ("Esenin's parents (1905).jpg", "Александр Никитич и Татьяна Фёдоровна Есенины, 1905"),
        "gorod": ("Moscow Tavern (Kustodiev).jpg", "Борис Кустодиев. «Московский трактир», 1916"),
        "smert": ("Могила Сергея Есенина в 1983 году.jpg", "Могила Сергея Есенина на Ваганьковском кладбище"),
        "revolyuciya": ("Kustodiev The Bolshevik.jpg", "Борис Кустодиев. «Большевик», 1920"),
    },
}


def local_photo(path):
    """Изображение, которое уже лежит в проекте: размеры и атрибуция берутся с диска."""
    full = os.path.join(ROOT, "public", path.lstrip("/"))
    with Image.open(full) as im:
        w, h = im.size
    return {"photo": path, "photoW": w, "photoH": h}


def apply(path_json, key_field, mapping):
    """mapping: id -> поля изображения (dict)."""
    data = json.load(open(path_json, encoding="utf-8"))
    changed = 0
    for item in data:
        pid = item.get(key_field)
        if pid in mapping and mapping[pid]:
            item.update(mapping[pid])
            changed += 1
    json.dump(data, open(path_json, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=2)
    print(os.path.basename(path_json), "— обновлено карточек:", changed)


def main():
    result = {}
    for folder, items in MEDIA.items():
        result[folder] = {}
        for key, (title, alt) in items.items():
            if ONLY and ONLY not in (folder + "/" + key, folder, key):
                continue
            print(folder + "/" + key, "->", title[:60])
            got = download(key, folder, "File:" + title, alt)
            if got:
                result[folder][key] = got
    if ONLY:
        print("\nскачан только", ONLY, "— данные не менялись")
        return

    apply(os.path.join(ROOT, "data", "museums.json"), "id", result["museums"])
    apply(os.path.join(ROOT, "data", "monuments.json"), "id", result["monuments"])

    topics = result["topics"]
    # для «Востока» и «Смерти» используем уже имеющиеся файлы мест, если загрузка не удалась
    if "vostok" not in topics:
        topics["vostok"] = dict(local_photo("/img/places/tiflis.jpg"),
                                photoAlt="Старый Тифлис — город, где Есенин читал «Персидские мотивы»",
                                photoCredit="Wikimedia Commons", photoLicense="см. страницу «Тифлис»",
                                photoSource="https://commons.wikimedia.org/")
    apply(os.path.join(ROOT, "data", "topics.json"), "id", topics)
    print("\nготово")


if __name__ == "__main__":
    main()
