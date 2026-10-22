#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Загрузка фотографий персон с Викисклада: только PD/CC0.

Скрипт берёт заранее отобранные файлы (проверены вручную), скачивает,
приводит к ширине 400 px, сохраняет JPEG+WebP в public/img/people/ и
прописывает поля photo / photoCredit / photoLicense / photoSource в people.json.
"""
import io, json, os, sys, time, urllib.parse, urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "img", "people")
WIDTH = 400
UA = {"User-Agent": "poet-esenin.ru/1.0 (educational site)"}

PHOTOS = {
    "blok": "Alexander_Blok.jpeg",
    "klyuev": "Nikolay_Klyuev_1915-16.jpg",
    "gorodetsky": "Gorodetskiy_S.jpg",
    "shershenevich": "Shershenevich.jpg",
    "mariengof": "Мариенгоф_в_своём_кабинете.tif",
    "zinaida-raikh": "Raih Zinaida.jpg",
    "isadora-duncan": "Isadora_Duncan_portrait_cropped.jpg",
    "sofia-tolstaya": "С._А._Толстая-Есенина.jpg",
    "galina-benislavskaya": "Галина_Бениславская.jpg",
    "augusta-miklashevskaya": "Августа_Миклашевская_в_спектакле_«Король-Арлекин».jpg",
    "anna-izryadnova": "Анна_Романовна_Изряднова_и_Сергей_Есенин.jpg",
    "anna-sardanovskaya": "Бальзамова,_Сардановская.jpg",
    "maria-balzamova": "Бальзамова,_Сардановская.jpg",
}

# подписи под фото: кто на снимке и что это
CAPTIONS = {
    "anna-izryadnova": "Анна Изряднова и Сергей Есенин в группе работников типографии «Товарищества И. Д. Сытина»",
    "anna-sardanovskaya": "Мария Бальзамова и Анна Сардановская",
    "maria-balzamova": "Мария Бальзамова и Анна Сардановская",
    "augusta-miklashevskaya": "Августа Миклашевская в спектакле «Король-Арлекин»",
    "mariengof": "Анатолий Мариенгоф в своём кабинете",
}


def fetch(url, timeout=60, tries=6):
    """Запрос с повтором: Викисклад отдаёт 429 при частых обращениях."""
    delay = 3.0
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:
            if attempt == tries - 1:
                raise
            print("   повтор", attempt + 1, type(e).__name__, "- ждём %.0f c" % delay)
            time.sleep(delay)
            delay = min(delay * 2, 40)


def api(url):
    return json.loads(fetch(url, timeout=60).decode("utf-8"))


def file_info(title):
    url = ("https://commons.wikimedia.org/w/api.php?action=query&titles=File:"
           + urllib.parse.quote(title) + "&prop=imageinfo&iiprop=url|extmetadata&format=json")
    pages = api(url)["query"]["pages"]
    info = list(pages.values())[0]["imageinfo"][0]
    meta = info.get("extmetadata", {})
    return {
        "url": info["url"],
        "page": info.get("descriptionurl", ""),
        "license": str(meta.get("LicenseShortName", {}).get("value", "")),
        "artist": str(meta.get("Artist", {}).get("value", "")).replace("<", " <").split("<")[0].strip(),
    }


def main():
    people = json.load(open(os.path.join(ROOT, "data", "people.json"), encoding="utf-8"))
    by_id = {p["id"]: p for p in people}
    os.makedirs(OUT, exist_ok=True)
    cache = {}
    done = []
    for pid, title in PHOTOS.items():
        person = by_id.get(pid)
        if not person:
            print("нет персоны:", pid)
            continue
        info = cache.get(title) or file_info(title)
        cache[title] = info
        time.sleep(1.0)
        if not any(k in info["license"].lower() for k in ("pd", "public domain", "cc0")):
            print("ПРОПУСК (лицензия):", pid, info["license"])
            continue
        base = pid
        jpg = os.path.join(OUT, base + ".jpg")
        webp = os.path.join(OUT, base + ".webp")
        if not os.path.exists(jpg):
            raw = fetch(info["url"], timeout=120)
            im = Image.open(io.BytesIO(raw)).convert("RGB")
            im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
            im.save(jpg, "JPEG", quality=84, optimize=True, progressive=True)
            im.save(webp, "WEBP", quality=78, method=6)
        with Image.open(jpg) as im0:
            person["photoW"], person["photoH"] = im0.size
        person["photo"] = "/img/people/%s.jpg" % base
        person["photoWebp"] = "/img/people/%s.webp" % base
        person["photoAlt"] = CAPTIONS.get(pid) or person["name"]
        person["photoCredit"] = info["artist"] or "Wikimedia Commons"
        person["photoLicense"] = info["license"]
        person["photoSource"] = info["page"]
        done.append(pid)
        time.sleep(1.5)
        print("ок", pid, "|", info["license"], "|", round(os.path.getsize(jpg) / 1024), "КБ")
    json.dump(people, open(os.path.join(ROOT, "data", "people.json"), "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=2)
    print("\nфото проставлено:", len(done), "из", len(people))


if __name__ == "__main__":
    main()
