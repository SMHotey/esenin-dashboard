#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Рисунки для карточек: жанры произведений, категории людей, типы музыки/кино/науки.

Стиль тот же, что у плиток разделов (scripts/make-tile-art.py): золотая линия,
прозрачный фон, рисунок кладётся на карточку как фоновая графика и не мешает тексту.
Запуск: python scripts/make-card-art.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "public", "img")

GOLD = "#c9a86a"


def svg(body, w, h, sw=1.5):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" fill="none" '
            'stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round">'
            '%s</svg>') % (w, h, GOLD, sw, body)


# ---------- жанры произведений: 360×220, водяной знак в правой части карточки ----------

def stihotvorenie():
    return """
<path d="M196 196c14-42 30-78 52-108" opacity=".9"/>
<path d="M248 88c26-30 54-46 82-48-4 30-20 56-46 78-14 12-30 20-48 22" opacity=".55"/>
<path d="M236 140c-16 6-28 16-36 30" opacity=".35"/>
<path d="M250 96c16-14 32-24 50-30" opacity=".3"/>
<path d="M120 92h64M120 112h52M120 132h60M120 152h38" opacity=".45"/>
<path d="M196 196h60" opacity=".25"/>
"""


def malaya_poema():
    return """
<path d="M240 60v120"/><path d="M240 60c-24-8-50-6-70 6v118c20-12 46-14 70-6"/>
<path d="M240 60c24-8 50-6 70 6v118c-24-12-50-14-70-6"/>
<path d="M188 86c14-4 30-4 42 0M188 108c14-4 30-4 42 0" opacity=".45"/>
<path d="M250 86c14-4 30-4 42 0M250 108c14-4 30-4 42 0" opacity=".45"/>
<path d="M196 196h140" opacity=".3"/>
"""


def poema():
    return """
<path d="M232 52c30 0 62 14 78 34 12 14 14 34 6 52-8 20-26 34-52 42"/>
<path d="M232 52c-30 0-62 14-78 34-12 14-14 34-6 52 8 20 26 34 52 42" opacity=".55"/>
<path d="M232 52v128" opacity=".5"/>
<path d="M168 96h48M168 116h44M168 136h48" opacity=".4"/>
<path d="M252 96h44M252 116h40M252 136h44" opacity=".4"/>
<path d="M198 196h72" opacity=".3"/>
"""


def statya():
    return """
<path d="M188 66h100v120H188z" opacity=".7"/>
<path d="M200 84h48" stroke-width="3" opacity=".6"/>
<path d="M200 100h76M200 114h76M200 128h60M200 142h76M200 156h48" opacity=".4"/>
<path d="M252 66v52h36" opacity=".35"/>
<path d="M300 96h34M300 116h30M300 136h34M300 156h24" opacity=".25"/>
<path d="M120 196h180" opacity=".3"/>
"""


def avtobiografiya():
    return """
<rect x="216" y="46" width="118" height="132" rx="8" opacity=".5"/>
<rect x="224" y="54" width="102" height="116" rx="5" opacity=".3"/>
<ellipse cx="275" cy="104" rx="34" ry="42"/>
<circle cx="275" cy="96" r="15"/>
<path d="M250 138c6-15 17-23 25-23s19 8 25 23"/>
<path d="M120 96h70M120 116h58M120 136h66" opacity=".4"/>
<path d="M275 54v-8M275 182v-8M224 104h-8M344 104h-8" opacity=".45"/>
"""


def proza():
    return """
<rect x="196" y="120" width="130" height="16" rx="2"/>
<rect x="206" y="102" width="110" height="16" rx="2"/>
<rect x="200" y="84" width="120" height="16" rx="2"/>
<path d="M196 136v56h130v-56" opacity=".45"/>
<path d="M212 120v72M300 104v88" opacity=".2"/>
<path d="M120 100h56M120 120h44M120 140h52" opacity=".4"/>
<path d="M170 196h176" opacity=".3"/>
"""


def default_genre():
    return """
<path d="M210 190c16-44 34-82 58-114" opacity=".9"/>
<path d="M268 76c28-32 58-48 88-50-4 32-22 60-50 84-15 13-32 21-51 23" opacity=".5"/>
<path d="M252 132c-18 6-32 18-42 34" opacity=".35"/>
<path d="M120 110h64M120 132h48" opacity=".4"/>
"""


# ---------- категории людей: 120×120, медальон без текста ----------

def p_family():
    return """
<path d="M22 96V62l20-14 20 14v34z"/><path d="M16 64l26-18 26 18" opacity=".7"/>
<path d="M36 96V78h12v18" opacity=".6"/>
<path d="M78 96V70l16-11 16 11v26z" opacity=".8"/>
<circle cx="60" cy="30" r="10" opacity=".0"/>
<path d="M68 96c0-14 6-22 12-22s12 8 12 22" opacity=".45"/>
"""


def p_relatives():
    return """
<path d="M60 104V56" opacity=".8"/>
<path d="M60 72h-22M60 72h22" opacity=".6"/>
<circle cx="60" cy="40" r="12"/>
<circle cx="26" cy="86" r="10" opacity=".8"/>
<circle cx="94" cy="86" r="10" opacity=".8"/>
<path d="M60 40v-14M26 86V72M94 86V72" opacity=".4"/>
"""


def p_friends():
    return """
<circle cx="40" cy="44" r="12"/>
<path d="M20 96c2-20 10-32 20-32s18 12 20 32"/>
<circle cx="82" cy="52" r="10" opacity=".85"/>
<path d="M64 96c2-16 8-26 18-26s16 10 18 26" opacity=".85"/>
<path d="M14 104h92" opacity=".35"/>
"""


def p_wives():
    return """
<circle cx="48" cy="60" r="22"/>
<circle cx="74" cy="60" r="22" opacity=".75"/>
<path d="M34 82l-8 14 8 4" opacity=".4"/>
<path d="M14 104h92" opacity=".3"/>
"""


def p_women():
    return """
<path d="M60 100V64" opacity=".8"/>
<path d="M60 74c-14-4-22-16-20-28 14 2 22 14 20 28z"/>
<path d="M60 74c14-4 22-16 20-28-14 2-22 14-20 28z" opacity=".7"/>
<circle cx="60" cy="46" r="8" opacity=".6"/>
<path d="M24 104h72" opacity=".3"/>
"""


def p_children():
    return """
<path d="M22 84c0-14 10-24 24-24h28c14 0 24 10 24 24" opacity=".85"/>
<path d="M18 84h84" opacity=".7"/>
<path d="M46 60v24M74 60v24" opacity=".35"/>
<circle cx="60" cy="30" r="9" opacity=".8"/>
<path d="M18 100c14-6 28-6 42 0s28 6 42 0" opacity=".3"/>
"""


# ---------- мелкие иконки: 160×160 ----------

def i_film():
    return """
<circle cx="80" cy="80" r="44"/>
<circle cx="80" cy="80" r="9"/>
<circle cx="80" cy="46" r="7" opacity=".7"/><circle cx="80" cy="114" r="7" opacity=".7"/>
<circle cx="46" cy="80" r="7" opacity=".7"/><circle cx="114" cy="80" r="7" opacity=".7"/>
<circle cx="56" cy="56" r="7" opacity=".45"/><circle cx="104" cy="56" r="7" opacity=".45"/>
<circle cx="56" cy="104" r="7" opacity=".45"/><circle cx="104" cy="104" r="7" opacity=".45"/>
"""


def i_serial():
    return """
<rect x="26" y="42" width="108" height="70" rx="8"/>
<path d="M44 62l20 14-20 14z" opacity=".75"/>
<path d="M78 64h42M78 80h42M78 96h28" opacity=".4"/>
<path d="M60 112v18M100 112v18M44 130h72" opacity=".45"/>
"""


def i_doc():
    return """
<rect x="34" y="58" width="70" height="54" rx="6"/>
<circle cx="69" cy="85" r="14"/>
<path d="M104 78l24-12v38l-24-12z" opacity=".8"/>
<path d="M44 46h30" opacity=".35"/>
<path d="M40 126h80" opacity=".3"/>
"""


def i_score():
    return """
<path d="M34 50h92M34 66h92M34 82h92M34 98h92M34 114h92" opacity=".35"/>
<circle cx="58" cy="58" r="7"/><circle cx="92" cy="74" r="7"/><circle cx="70" cy="106" r="7"/>
<path d="M65 58v48M99 74v34M77 106v-24" opacity=".6"/>
"""


def i_song():
    return """
<circle cx="66" cy="110" r="16"/>
<path d="M82 110V42l40-8v60" opacity=".85"/>
<circle cx="106" cy="96" r="16" opacity=".85"/>
<path d="M82 56l40-8" opacity=".45"/>
"""


def i_romance():
    return """
<path d="M52 34c10 22 26 40 46 54" opacity=".35"/>
<circle cx="60" cy="112" r="16"/>
<path d="M76 112V44l36-10" opacity=".9"/>
<path d="M76 62l36-10" opacity=".5"/>
<path d="M96 34c8-6 18-2 18 6s-10 10-16 5" opacity=".55"/>
"""


def i_chorus():
    return """
<circle cx="42" cy="58" r="11"/><circle cx="80" cy="48" r="11" opacity=".85"/><circle cx="118" cy="58" r="11" opacity=".7"/>
<path d="M26 118c2-20 8-32 16-32s14 12 16 32" />
<path d="M64 118c2-20 8-32 16-32s14 12 16 32" opacity=".85"/>
<path d="M102 118c2-20 8-32 16-32s14 12 16 32" opacity=".7"/>
<path d="M20 132h120" opacity=".3"/>
"""


def i_childsong():
    return """
<path d="M96 76c-14-16-34-14-34 6 0 18 22 34 34 44 12-10 34-26 34-44 0-20-20-22-34-6z" opacity=".85"/>
<path d="M40 124h80" opacity=".3"/>
<circle cx="80" cy="46" r="9" opacity=".6"/>
"""


def i_monograph():
    return """
<rect x="40" y="38" width="80" height="88" rx="4"/>
<rect x="46" y="46" width="68" height="72" rx="2" opacity=".3"/>
<path d="M58 64h44M58 78h44M58 92h30" opacity=".45"/>
<path d="M40 126h80" opacity=".35"/>
<path d="M120 46v80" opacity=".25"/>
"""


def i_article():
    return """
<path d="M44 40h60l16 16v68H44z"/>
<path d="M104 40v16h16" opacity=".55"/>
<path d="M58 74h48M58 88h48M58 102h32" opacity=".45"/>
<path d="M58 128h30" opacity=".3"/>
"""


def i_collection():
    return """
<rect x="38" y="96" width="88" height="14" rx="2" opacity=".6"/>
<rect x="44" y="78" width="76" height="14" rx="2" opacity=".8"/>
<rect x="50" y="60" width="64" height="14" rx="2"/>
<path d="M62 44h40" opacity=".5"/>
<path d="M30 124h100" opacity=".3"/>
"""


def i_thesis():
    return """
<rect x="42" y="34" width="76" height="92" rx="3" opacity=".8"/>
<path d="M54 52h52M54 66h52M54 80h40M54 94h48" opacity=".4"/>
<circle cx="112" cy="118" r="16" opacity=".6"/>
<path d="M104 118l6 6 11-12" opacity=".7"/>
"""


SCENES = {
    "genre/stihotvorenie": (stihotvorenie, 360, 220),
    "genre/malaya-poema": (malaya_poema, 360, 220),
    "genre/poema": (poema, 360, 220),
    "genre/statya": (statya, 360, 220),
    "genre/avtobiografiya": (avtobiografiya, 360, 220),
    "genre/proza": (proza, 360, 220),
    "genre/default": (default_genre, 360, 220),
    "people/art-family": (p_family, 120, 120),
    "people/art-relatives": (p_relatives, 120, 120),
    "people/art-friends": (p_friends, 120, 120),
    "people/art-wives": (p_wives, 120, 120),
    "people/art-women": (p_women, 120, 120),
    "people/art-children": (p_children, 120, 120),
    "art/film": (i_film, 160, 160),
    "art/serial": (i_serial, 160, 160),
    "art/documentary": (i_doc, 160, 160),
    "art/score": (i_score, 160, 160),
    "art/song": (i_song, 160, 160),
    "art/romance": (i_romance, 160, 160),
    "art/chorus": (i_chorus, 160, 160),
    "art/children-song": (i_childsong, 160, 160),
    "art/monograph": (i_monograph, 160, 160),
    "art/article": (i_article, 160, 160),
    "art/collection": (i_collection, 160, 160),
    "art/thesis": (i_thesis, 160, 160),
}


def main():
    total = 0
    for rel, (fn, w, h) in SCENES.items():
        path = os.path.join(IMG, rel + ".svg")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        body = svg(fn(), w, h)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(body)
        total += 1
    print("готово:", total, "файлов в", IMG)


if __name__ == "__main__":
    main()
