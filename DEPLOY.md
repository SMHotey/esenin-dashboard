# Деплой и продакшен-чеклист

Сайт полностью статический: `npm run build` собирает `dist/`, дальше это просто файлы.
Никаких серверных зависимостей, базы данных и переменных окружения нет.

## 1. Перед публикацией

1. **Домен.** В `site.config.json` замените `siteUrl` на боевой адрес без слэша в конце:

   ```json
   "siteUrl": "https://example.ru"
   ```

   От него зависят `canonical`, OpenGraph, `sitemap.xml` и `robots.txt`.

2. **Партнёрские метки.** В `affiliate.stores` заполните `tag` для магазинов, где у вас есть
   партнёрская программа (ЛитРес — `lfrom`, Ozon — параметр партнёрской ссылки, Лабиринт — свой).
   Пока метки пусты, ссылки работают, но вознаграждение не начисляется, а сборка предупреждает об этом.

3. **Аналитика (по желанию).** В `analytics` укажите `yandexMetrika` и/или `googleAnalytics`.
   Счётчики подключаются только при непустом значении. При включении аналитики сборка сама
   расширяет Content-Security-Policy в `_headers`.

4. **Права и контакты.** Проверьте тексты в `about.html` (раздел «О проекте») и `footerAbout`:
   там указаны принципы, лицензии и правила партнёрских ссылок.

5. **OG-изображение.** `public/img/og.jpg` (1200×630) собирается скриптом
   `python scripts/make-og.py` и подключён в `site.config.json` → `ogImage`.
   После смены домена или портрета пересоберите картинку, чтобы на ней был верный адрес.

## 2. Проверка

```bash
npm run verify          # build + проверка ссылок + verify.mjs
npm run verify:strict   # то же, но предупреждения считаются ошибкой (для CI)
```

`verify.mjs` проверяет:

- наличие всех страниц, `404.html`, `books/`, `robots.txt`, `sitemap.xml`, `search.json`;
- canonical/OG/description/title, отсутствие дублей title и битого JSON-LD;
- одну `<h1>` на страницу и `noindex` у 404;
- все внутренние ссылки и ссылки из `search.json`/`sitemap.xml`;
- пометку «реклама» и `rel="sponsored nofollow noopener"` у книжных ссылок;
- наличие `_headers`, `_redirects`, `.nojekyll` и анти-вспышки темы.

Ожидаемые предупреждения до заполнения конфига: заглушка домена и пустые партнёрские метки.

Локальный просмотр:

```bash
npm run preview   # http://localhost:4173
```

Открывать только по HTTP. Через `file://` не работают абсолютные пути `/styles.css` и `/app.js`.

## 3. Хостинг

### Netlify

`netlify.toml` уже в репозитории: команда `npm run verify`, публикация `dist/`.
Файлы `dist/_headers` и `dist/_redirects` подхватываются автоматически, `404.html` отдаётся как страница ошибки.

### Cloudflare Pages

- Build command: `npm run verify`
- Build output directory: `dist`
- `_headers` и `_redirects` поддерживаются; `404.html` используется автоматически.

### Vercel

`vercel.json` в корне: `buildCommand` и `outputDirectory` заданы, security- и cache-заголовки продублированы.
Vercel отдаёт `404.html` для неизвестных путей автоматически.

### GitHub Pages

Workflow `.github/workflows/deploy.yml` собирает и публикует `dist/` при пуше в `master`.
В настройках репозитория включите Pages → Source: GitHub Actions.
Файл `.nojekyll` создаётся сборкой, чтобы GitHub не трогал каталоги с подчёркиванием.

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name example.ru;
    root /var/www/esenin/dist;
    index index.html;

    location / {
        try_files $uri $uri/ $uri.html =404;
    }
    error_page 404 /404.html;

    location = /404.html { internal; }

    location ~* \.(css|js)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    location /img/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    location ~* \.html$ {
        add_header Cache-Control "public, max-age=0, must-revalidate";
    }

    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;
    add_header X-Frame-Options SAMEORIGIN;
}
```

Важно: `internal` у `/404.html` не обязателен; если убрать — страница останется доступной по прямому адресу,
это нормально.

## 4. Кэш и версии ассетов

CSS/JS подключаются как `/styles.css?v=<hash>`. Хэш считается от содержимого `styles.css`, `app.js`
и `theme.js`, поэтому после правок ссылки меняются и кэш браузера сбрасывается сам.
Заголовки `immutable` безопасны именно из-за версионирования.

## 5. Обновления контента

| Что | Где | Как часто |
|---|---|---|
| Тексты произведений | `data/works.json` | по мере импорта |
| Люди, хронология | `data/people.json`, `data/timeline.json` | по мере проверки |
| Книги и ссылки | `data/books.json` | раз в квартал: цены, наличие, новые издания |
| Научные работы | `data/research.json` | раз в полгода |
| Источники | `data/sources.json` | раз в квартал |
| Дата обновления | `site.config.json` → `updated` | при каждой публикации |

После правок: `npm run verify` и деплой.

## 6. Юридические заметки

- Тексты Есенина — общественное достояние; у каждого произведения указан источник.
- Партнёрские ссылки помечены словом «реклама» и раскрыты в блоке перед списком книг.
  Это соответствует требованию маркировки рекламы; при необходимости добавьте ИНН/реквизиты
  рекламодателя в `affiliate.disclosure`.
- Не добавляйте обложки и фотографии издательств без разрешения: в проекте используются
  типографические обложки, чтобы не нарушать права на дизайн.
- Политика конфиденциальности не нужна, пока нет форм сбора данных и аналитики.
  При включении Метрики/GA добавьте страницу политики и ссылку в подвал.

## 7. Что осталось сделать руками

- [ ] Заменить `siteUrl` на боевой домен.
- [ ] Заполнить партнёрские метки магазинов.
- [ ] Подключить аналитику и, если нужно, страницу политики конфиденциальности.
- [x] OG-картинка 1200×630 собрана (`scripts/make-og.py`); пересоберите после смены домена.
- [ ] Проверить книги: ссылки, ISBN, наличие.
- [ ] Прогнать `npm run verify:strict` и убедиться, что предупреждений не осталось.
