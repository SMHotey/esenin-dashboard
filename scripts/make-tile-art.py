#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Рисунки для карточек-плиток (Разделы проекта, Жизнь, Наследие).

Гравюрные линейные иллюстрации: золотая линия по прозрачному фону, 360×220.
В CSS они кладутся на правую часть плитки под затемняющую шторку, поэтому
рисунок не мешает тексту. Запуск: python scripts/make-tile-art.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "img", "tiles")

HEAD = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 220" fill="none" '
        'stroke="#c9a86a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">')
FOOT = '</svg>'

# ---------- отдельные мотивы ----------


def portrait_medallion():
    return """
<rect x="178" y="26" width="150" height="164" rx="9" opacity=".55"/>
<rect x="185" y="33" width="136" height="150" rx="6" opacity=".35"/>
<ellipse cx="253" cy="103" rx="46" ry="56"/>
<circle cx="253" cy="92" r="20"/>
<path d="M220 148c8-20 24-30 33-30s25 10 33 30"/>
<path d="M253 44v-9M253 171v-9M200 103h-9M315 103h-9" opacity=".6"/>
<path d="M196 205h38M272 205h38" opacity=".85"/>
"""


def people():
    return """
<path d="M56 176h248" opacity=".8"/>
<circle cx="132" cy="104" r="17"/>
<path d="M104 176c4-25 14-40 28-40s24 15 28 40"/>
<circle cx="200" cy="84" r="21"/>
<path d="M166 176c6-31 18-48 34-48s28 17 34 48"/>
<circle cx="270" cy="108" r="15"/>
<path d="M246 176c3-22 12-35 24-35s21 13 24 35"/>
"""


def izba():
    return """
<path d="M198 152V104l48-33 48 33v48z"/>
<path d="M186 106l60-41 60 41" opacity=".7"/>
<rect x="214" y="114" width="24" height="24" rx="2"/>
<path d="M226 114v24M214 126h24"/>
<rect x="256" y="114" width="24" height="24" rx="2"/>
<path d="M268 114v24M256 126h24"/>
<rect x="262" y="76" width="11" height="15" rx="2"/>
<path d="M268 76c-5-8 3-14-2-22" opacity=".5"/>
<path d="M120 176v-42M136 176v-46M152 176v-44M168 176v-46M184 176v-42" opacity=".55"/>
<path d="M112 148h80M112 166h80" opacity=".55"/>
<path d="M96 176v-52" opacity=".8"/>
<path d="M96 118c-14-4-20 8-14 16-12 4-8 20 6 20-6 10 10 18 18 8z" opacity=".8"/>
<path d="M60 176h250" opacity=".7"/>
"""


def open_book():
    return """
<path d="M180 62v96"/>
<path d="M180 62c-26-8-54-6-78 6v96c24-12 52-14 78-6"/>
<path d="M180 62c26-8 54-6 78 6v96c-24-12-52-14-78-6"/>
<path d="M118 84c18-6 38-6 54 0M118 104c18-6 38-6 54 0M118 124c18-6 38-6 54 0M118 144c18-6 38-6 54 0" opacity=".45"/>
<path d="M188 84c16-6 36-6 54 0M188 104c16-6 36-6 54 0M188 124c16-6 36-6 54 0M188 144c16-6 36-6 54 0" opacity=".45"/>
<path d="M96 176h168" opacity=".85"/>
<path d="M112 176v14M248 176v14" opacity=".5"/>
"""


def church():
    return """
<path d="M198 162v-52h84v52"/>
<path d="M216 110V88h48v22"/>
<path d="M240 88c-14-8-14-28 0-40 14 12 14 32 0 40z"/>
<path d="M240 48V30M232 39h16" opacity=".9"/>
<path d="M228 162v-22a12 12 0 0 1 24 0v22" opacity=".8"/>
<path d="M104 178c34-10 70-8 104-16" opacity=".5"/>
<path d="M118 162v-26M134 162v-30" opacity=".55"/>
<path d="M118 136c-10-2-14 6-10 12-8 3-6 14 4 14" opacity=".55"/>
<path d="M70 176h236" opacity=".75"/>
"""


def monument():
    return """
<path d="M146 182h150" opacity=".8"/>
<path d="M160 182v-26h122v26"/>
<path d="M170 156v-14h102v14"/>
<path d="M184 142v-8h74v8"/>
<circle cx="221" cy="104" r="22"/>
<path d="M196 134c10-16 20-22 25-22s15 6 25 22"/>
<path d="M170 182h122" opacity=".35"/>
<path d="M186 96c-8-10-8-24 0-34M256 96c8-10 8-24 0-34" opacity=".35"/>
"""


def birches():
    return """
<path d="M152 196c-3-42 2-80 0-124M214 196c2-36-1-66 1-100" opacity=".9"/>
<path d="M146 176h10M147 160h9M146 142h10M147 124h9M146 106h10M147 90h9M213 178h9M212 158h9M213 138h9M212 118h9" opacity=".6"/>
<path d="M152 72c-16-6-26 6-20 18-16 6-12 26 4 26-6 14 12 22 20 10 8 12 26 4 20-10 16 0 20-20 4-26 6-12-4-24-20-18z" opacity=".5"/>
<path d="M214 96c-12-4-20 6-15 14-12 4-9 18 3 18-4 10 9 16 15 7 6 9 19 3 15-7 12 0 15-14 3-18 5-8-3-18-15-14z" opacity=".4"/>
<path d="M276 52c6-6 12-12 18-18M296 40c6-6 12-12 18-18" opacity=".5"/>
<path d="M86 196c44-8 96-6 152-10" opacity=".5"/>
<path d="M120 190v10M140 188v11M300 186v12M318 184v12" opacity=".35"/>
"""


def book_shelf():
    spines = [
        (96, 112, 26, 66), (128, 96, 24, 82), (158, 120, 22, 58),
        (186, 104, 26, 74), (218, 116, 20, 62), (244, 92, 26, 86), (276, 124, 22, 54),
    ]
    out = []
    for x, y, w, h in spines:
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2"/>')
        out.append(f'<path d="M{x + 5} {y + 12}h{w - 10}M{x + 5} {y + 20}h{w - 10}" opacity=".4"/>')
        out.append(f'<path d="M{x + 5} {y + h - 14}h{w - 10}" opacity=".4"/>')
    out.append('<path d="M86 178h214M80 188h226" opacity=".8"/>')
    return "\n".join(out)


def research():
    return """
<rect x="112" y="146" width="112" height="15" rx="2"/>
<rect x="120" y="130" width="100" height="15" rx="2"/>
<rect x="128" y="114" width="86" height="15" rx="2"/>
<circle cx="248" cy="88" r="32"/>
<path d="M271 111l20 20" stroke-width="2.4"/>
<path d="M232 78h32M232 90h32M236 100h24" opacity=".45"/>
<path d="M96 174h150" opacity=".6"/>
"""


def glossary():
    return """
<rect x="96" y="86" width="78" height="90" rx="4"/>
<path d="M108 104h54M108 120h54M108 136h40M108 152h48" opacity=".45"/>
<path d="M196 168h44v10h-44z"/>
<path d="M200 168v-14h36v14"/>
<path d="M206 154h24" opacity=".6"/>
<path d="M252 34c14 30 12 66-8 98-10 16-22 26-32 32 4-22 12-46 20-66 8-22 14-44 20-64z"/>
<path d="M252 40c-6 24-16 52-30 78M258 62c-8 20-18 40-30 58M262 84c-8 16-16 30-26 44" opacity=".35"/>
"""


def faq():
    return """
<rect x="104" y="94" width="116" height="72" rx="4"/>
<path d="M104 96l58 40 58-40"/>
<path d="M104 164l44-36M220 164l-44-36" opacity=".45"/>
<circle cx="278" cy="104" r="40" opacity=".5"/>
<text x="278" y="126" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="56" fill="#c9a86a" stroke="none" opacity=".9">?</text>
"""


def about():
    return """
<path d="M60 182h248" opacity=".8"/>
<path d="M96 182v-8h96v8"/>
<rect x="108" y="120" width="72" height="54" rx="3"/>
<path d="M118 136h52M118 150h52M118 164h34" opacity=".45"/>
<path d="M188 122c-2-14 4-28 12-40 4 22 2 40-6 54 18-16 30-38 36-60-6 30-18 54-34 72" opacity=".7"/>
<path d="M258 182v-58h18v58z"/>
<path d="M262 124c-4-10 2-18 0-26 10 8 12 18 6 28z" opacity=".8"/>
<path d="M258 140h18M258 156h18" opacity=".4"/>
"""


def candle():
    return """
<path d="M246 176V96h22v80z"/>
<path d="M252 96c-4 8-6 14-6 22M262 96c3 8 5 16 5 26" opacity=".35"/>
<path d="M257 84c-8-8-8-20 0-28 9 9 9 20 0 28z"/>
<path d="M257 46c-14 14-22 26-22 42M257 46c14 14 22 26 22 42" opacity=".25"/>
<path d="M120 176h68" opacity=".6"/>
<path d="M132 176v-46h44v46z"/>
<path d="M140 146h28M140 158h28" opacity=".4"/>
<path d="M96 188h180" opacity=".7"/>
"""


def museum_house():
    return """
<path d="M176 176v-56h116v56"/>
<path d="M166 120l68-42 68 42" opacity=".8"/>
<path d="M198 176v-40a12 12 0 0 1 24 0v40" opacity=".7"/>
<path d="M236 132h20v22h-20z"/>
<path d="M204 176v-64M262 176v-64" opacity=".35"/>
<rect x="212" y="98" width="46" height="14" rx="2" opacity=".6"/>
<path d="M112 176v-40" opacity=".8"/>
<path d="M112 140c-14-4-22 8-15 16-12 4-8 20 7 20-5 10 11 18 19 7z" opacity=".7"/>
<path d="M70 188h240" opacity=".6"/>
"""


def violin():
    return """
<path d="M150 60h100" opacity=".3"/>
<path d="M150 72h100" opacity=".3"/>
<path d="M150 84h100" opacity=".3"/>
<path d="M150 96h100" opacity=".3"/>
<path d="M150 108h100" opacity=".3"/>
<circle cx="176" cy="72" r="4" fill="#c9a86a" stroke="none"/>
<circle cx="214" cy="84" r="4" fill="#c9a86a" stroke="none"/>
<circle cx="196" cy="108" r="4" fill="#c9a86a" stroke="none"/>
<path d="M262 96c-14-4-26 2-30 12-6-6-16-6-22 2-8 10-6 24 6 32 8 6 18 4 22-4 6 10 18 14 28 8 12-8 12-24 2-32 8-4 10-12 4-18z" opacity=".9"/>
<path d="M266 84l14-30" opacity=".7"/>
<path d="M282 50c6-6 14-2 14 4s-8 8-12 4" opacity=".7"/>
<path d="M292 46c-26 40-46 70-58 84" stroke-width="1" opacity=".35"/>
"""


def film():
    return """
<rect x="76" y="66" width="212" height="96" rx="6"/>
<path d="M76 84h212M76 144h212" opacity=".5"/>
<path d="M92 72h10v8H92zM112 72h10v8h-10zM132 72h10v8h-10zM152 72h10v8h-10zM172 72h10v8h-10zM192 72h10v8h-10zM212 72h10v8h-10zM232 72h10v8h-10zM252 72h10v8h-10z" opacity=".45"/>
<path d="M92 148h10v8H92zM112 148h10v8h-10zM132 148h10v8h-10zM152 148h10v8h-10zM172 148h10v8h-10zM192 148h10v8h-10zM212 148h10v8h-10zM232 148h10v8h-10zM252 148h10v8h-10z" opacity=".45"/>
<path d="M100 96h72v36h-72z" opacity=".7"/>
<path d="M186 96h66v10h-66zM186 112h66v8h-66zM186 126h44v7h-44z" opacity=".45"/>
"""


def globe():
    return """
<circle cx="216" cy="106" r="56"/>
<ellipse cx="216" cy="106" rx="24" ry="56" opacity=".6"/>
<ellipse cx="216" cy="106" rx="44" ry="56" opacity=".35"/>
<path d="M162 88h108M158 106h116M162 124h108" opacity=".45"/>
<path d="M186 168a30 30 0 0 1 60 0" opacity=".0"/>
<path d="M216 50v112" opacity=".25"/>
<text x="104" y="150" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="46" fill="#c9a86a" stroke="none" opacity=".75">А</text>
<text x="316" y="150" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="46" fill="#c9a86a" stroke="none" opacity=".75">A</text>
"""


def studies():
    return """
<path d="M96 168h168" opacity=".7"/>
<path d="M110 168v-52h48v52z"/>
<path d="M104 116l30-22 30 22" opacity=".8"/>
<path d="M124 168v-30h20v30" opacity=".6"/>
<rect x="186" y="120" width="66" height="48" rx="3"/>
<path d="M196 134h46M196 146h46M196 158h28" opacity=".45"/>
<path d="M196 120v-14h20v14" opacity=".5"/>
<circle cx="262" cy="86" r="16" opacity=".5"/>
<path d="M262 54v-8M262 126v8M230 86h-8M294 86h8" opacity=".4"/>
"""


def passions():
    return """
<circle cx="150" cy="96" r="26" opacity=".8"/>
<path d="M150 70v-12M150 122v12M124 96h-12M176 96h12M132 78l-9-9M168 114l9 9M168 78l9-9M132 114l-9 9" opacity=".5"/>
<path d="M206 166c14-30 34-56 58-78" opacity=".7"/>
<path d="M206 166c-6-26-2-52 12-72 20-28 44-44 66-46-4 24-16 48-32 66-12 14-28 26-46 34z" opacity=".35"/>
<path d="M246 128c-18 10-32 22-40 38" opacity=".5"/>
<path d="M84 176h192" opacity=".5"/>
"""


def timeline():
    return """
<path d="M92 110h176" opacity=".8"/>
<circle cx="112" cy="110" r="6"/>
<circle cx="164" cy="110" r="6"/>
<circle cx="216" cy="110" r="6"/>
<circle cx="252" cy="110" r="6" opacity=".6"/>
<path d="M112 104V76M164 116v28M216 104V76M252 116v28" opacity=".6"/>
<path d="M96 70h34M150 148h34M200 70h34M236 148h34" opacity=".55"/>
<path d="M92 62v96" opacity=".25"/>
"""


SCENES = {
    "biography": portrait_medallion,
    "people": people,
    "life": izba,
    "library": open_book,
    "places": church,
    "legacy": monument,
    "topics": birches,
    "books": book_shelf,
    "research": research,
    "glossary": glossary,
    "faq": faq,
    "about": about,
    "gibel": candle,
    "memory": museum_house,
    "music": violin,
    "cinema": film,
    "translations": globe,
    "studies": studies,
    "passions": passions,
    "timeline": timeline,
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in SCENES.items():
        svg = HEAD + fn() + FOOT
        path = os.path.join(OUT, name + ".svg")
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(svg)
        print("ok", name, len(svg), "байт")
    print("\nвсего:", len(SCENES), "->", OUT)


if __name__ == "__main__":
    main()
