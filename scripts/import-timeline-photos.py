#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Миниатюры для хронологии: квадратные превью 200×200 из уже имеющихся фотографий.

Событие в списке — одна строка, поэтому крупные снимки там не нужны: скрипт режет
квадрат по центру, сохраняет JPEG+WebP в public/img/thumbs/ и прописывает
photo / photoWebp / photoAlt в data/timeline.json. Новых загрузок нет.
Запуск: python scripts/import-timeline-photos.py
"""
import json, os

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "img", "thumbs")
SIZE = 200

# Событие (по заголовку из data/timeline.json) → (файл в public/, подпись).
# Ключ — заголовок, а не дата: в хронологии есть по два события на 1918 и 1925 год.
EVENTS = {
    "Рождение в Константинове": ("/img/places/konstantinovo.jpg", "Усадьба Есениных в Константинове"),
    "Переезд к деду": ("/img/era/yesenin-parents.jpg", "Родители поэта, 1905 год"),
    "Константиновское земское училище": ("/img/places/konstantinovo.jpg", "Константиново, вид села"),
    "Спас-Клепиковская школа": ("/img/museums/spass-school.jpg", "Второклассная учительская школа в Спас-Клепиках"),
    "Переезд в Москву": ("/img/places/moskva.jpg", "Дом в Большом Строченовском переулке, где жил Есенин"),
    "Университет Шанявского": ("/img/era/yesenin-1914.jpg", "Сергей Есенин, 1914 год"),
    "Первая публикация": ("/img/era/yesenin-1914.jpg", "Сергей Есенин в год первой публикации"),
    "Петроград и знакомство с Блоком": ("/img/era/klyuev-yesenin-1915.jpg", "Клюев и Есенин в Петрограде, 1915 год"),
    "Сборник «Радуница»": ("/img/era/yesenin-portrait.jpg", "Портрет Есенина с автографом"),
    "Венчание с Зинаидой Райх": ("/img/people/zinaida-raikh.jpg", "Зинаида Райх"),
    "Имажинизм": ("/img/era/yesenin-imagists.jpg", "Имажинисты, 1919 год"),
    "Знакомство с Айседорой Дункан": ("/img/era/yesenin-duncan.jpg", "Есенин и Айседора Дункан"),
    "Брак с Айседорой Дункан": ("/img/era/yesenin-1922.jpg", "Сергей Есенин, 1922 год"),
    "Возвращение и разрыв": ("/img/era/yesenin-1923.jpg", "Сергей Есенин, 1923 год"),
    "Поездки на Кавказ": ("/img/places/baku.jpg", "Старый Баку, Ичери-шехер"),
    "«Анна Снегина» и «Чёрный человек»": ("/img/era/yesenin-1925.jpg", "Сергей Есенин, 1925 год"),
    "Брак с Софьей Толстой": ("/img/people/sofia-tolstaya.jpg", "Софья Андреевна Толстая-Есенина"),
    "Смерть в Ленинграде": ("/img/places/peterburg.jpg", "Гостиница «Англетер» в Ленинграде"),
}


def square(im):
    im = ImageOps.exif_transpose(im)
    if im.mode != "RGB":
        im = im.convert("RGB")
    # верхняя треть важнее для портретов: режем от верха, а не от центра
    side = min(im.width, im.height)
    left = (im.width - side) // 2
    top = 0 if im.height > im.width else (im.height - side) // 2
    return im.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    data = json.load(open(os.path.join(ROOT, "data", "timeline.json"), encoding="utf-8"))
    done, missing = 0, []
    for event in data:
        spec = EVENTS.get(event["title"])
        if not spec:
            continue
        src, alt = spec
        full = os.path.join(ROOT, "public", src.lstrip("/"))
        if not os.path.exists(full):
            missing.append(src)
            continue
        name = "tl-" + event["date"] + "-" + str(done + 1).zfill(2)
        jpg = os.path.join(OUT, name + ".jpg")
        webp = os.path.join(OUT, name + ".webp")
        with Image.open(full) as im:
            square(im).save(jpg, "JPEG", quality=82, optimize=True, progressive=True)
        with Image.open(jpg) as im:
            im.save(webp, "WEBP", quality=78, method=6)
        event["photo"] = "/img/thumbs/%s.jpg" % name
        event["photoWebp"] = "/img/thumbs/%s.webp" % name
        event["photoAlt"] = alt
        done += 1
    json.dump(data, open(os.path.join(ROOT, "data", "timeline.json"), "w", encoding="utf-8", newline="\n"),
              ensure_ascii=False, indent=2)
    print("миниатюр:", done, "из", len(data), "событий")
    if missing:
        print("НЕТ ФАЙЛОВ:", *missing, sep="\n  ")


if __name__ == "__main__":
    main()
