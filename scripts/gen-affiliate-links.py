"""Генератор партнёрских ссылок «Читай-города» (работает внутри browser_exec).

Зачем: кабинет partners.chitai-gorod.ru — SPA, ссылки выдаются по одной. Этот модуль
делает то же самое пачкой и складывает результат в JSON, чтобы прерванный прогон
можно было продолжить.

Как пользоваться (внутри одного вызова browser_exec):

    import sys
    sys.path.insert(0, "/путь/к/skills/productivity/chitai-gorod-affiliate/scripts")
    from gen_affiliate_links import prepare, gen

    # 1. Открыть https://partners.chitai-gorod.ru/tools/affiliate-link и войти через vault
    #    (browser_vault_save_login / browser_vault_fill) — отдельными вызовами, не здесь.
    prepare(js)                 # закроет модалку и выставит тип «Текстовый блок»
    gen(URLS[0:20], js, desc="site.ru — просветительский сайт, раздел «Книги»")

Аргументы gen:
    urls   — список ссылок на товары https://www.chitai-gorod.ru/product/<slug>-<id>
    out    — путь к JSON-файлу прогресса (по умолчанию ./affiliate_links.json)
    desc   — текст «Данные о распространении ссылки» (до 512 символов)
    tries  — сколько раз опрашивать DOM в ожидании новой ссылки
"""
import json
import os
import time

OUT_DEFAULT = os.path.abspath("affiliate_links.json")

SET_JS = r"""((uri, desc) => {
  const setVal = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const u = document.querySelector('input[name=uri]');
  if (!u) return 'нет поля uri';
  setVal(u, uri);
  const d = document.querySelector('textarea[name=description]');
  if (d) setVal(d, desc);
  return d ? 'uri+desc' : 'uri';
})(%s, %s)"""

CLICK_JS = """(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.innerText || '').trim() === 'Получить код ссылки');
  if (!b) return 'нет кнопки';
  ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(t => b.dispatchEvent(new MouseEvent(t, { bubbles: true })));
  return 'клик';
})()"""

READ_JS = """(() => {
  const el = [...document.querySelectorAll('input')].find(i => /\/r\/[A-Za-z0-9]+\?erid=/.test(i.value || ''));
  return el ? el.value : '';
})()"""

DESC_JS = """(() => { const d = document.querySelector('textarea[name=description]'); return d ? d.value : null; })()"""

CLOSE_MODAL_JS = """(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.innerText || '').trim() === 'Продолжить');
  if (!b) return 'модалки нет';
  ['pointerdown','mousedown','click'].forEach(t => b.dispatchEvent(new MouseEvent(t, { bubbles: true })));
  return 'закрыл';
})()"""

OPEN_TYPE_JS = """(() => {
  const btn = [...document.querySelectorAll('button')].find(x => /Выберите тип рекламы|Текстовый блок|Баннер/.test((x.innerText || '').trim()));
  if (!btn) return 'нет дропдауна';
  ['pointerdown','mousedown','pointerup','click'].forEach(t => btn.dispatchEvent(new MouseEvent(t, { bubbles: true })));
  return 'открыл';
})()"""

PICK_TYPE_JS = """(() => {
  const opt = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.innerText || '').trim() === 'Текстовый блок');
  if (!opt) return 'нет варианта';
  const target = opt.closest('[role=option],li,[class*=item],[class*=option]') || opt;
  ['pointerdown','mousedown','pointerup','click'].forEach(t => target.dispatchEvent(new MouseEvent(t, { bubbles: true })));
  return 'выбрал';
})()"""

FORM_JS = "(() => { const f = document.querySelector('input[name=form]'); return f ? f.value : ''; })()"


def prepare(js_fn, log=print):
    """Закрывает юридическую модалку и выставляет тип рекламы. Без этого генерация не работает."""
    log("модалка:", js_fn(CLOSE_MODAL_JS))
    time.sleep(0.8)
    if js_fn(FORM_JS) != "textBlock":
        log("дропдаун:", js_fn(OPEN_TYPE_JS))
        time.sleep(0.8)
        log("выбор типа:", js_fn(PICK_TYPE_JS))
        time.sleep(0.8)
    form = js_fn(FORM_JS)
    log("form =", form)
    return form == "textBlock"


def _load(path):
    if os.path.exists(path):
        try:
            return json.load(open(path, encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save(path, data):
    tmp = path + ".tmp"
    json.dump(data, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def gen(urls, js_fn, out=OUT_DEFAULT, desc="", tries=20, log=print):
    """Генерирует ссылки пачкой. Возвращает словарь {url: affiliate_link}.

    На один товар — один клик: при неудаче идём дальше, чтобы не принять чужое значение.
    Уже готовые записи пропускаются, поэтому прогон можно повторять после обрыва.
    """
    done = _load(out)
    ok = 0
    for i, url in enumerate(urls, 1):
        if done.get(url):
            continue
        js_fn(SET_JS % (json.dumps(url), json.dumps(desc)))
        time.sleep(0.5)
        js_fn(CLICK_JS)
        time.sleep(1.2)
        if js_fn(DESC_JS) is not None and not js_fn(DESC_JS):
            js_fn(SET_JS % (json.dumps(url), json.dumps(desc)))
            time.sleep(0.4)
            js_fn(CLICK_JS)
        prev = ""
        link = ""
        for _ in range(tries):
            time.sleep(0.6)
            cand = js_fn(READ_JS) or ""
            if not cand or cand == prev:
                continue
            if any(v == cand and k != url for k, v in done.items()):
                prev = cand
                continue
            link = cand
            break
        if link:
            done[url] = link
            ok += 1
            _save(out, done)
            log(f"[{i}/{len(urls)}] OK {link}")
        else:
            log(f"[{i}/{len(urls)}] не получилось — повторите этот товар отдельно")
    log(f"итого: {len(done)} ссылок в {out}")
    return done
