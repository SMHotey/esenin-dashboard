// Пути к рисункам-водяным знакам для карточек. Файлы создаёт scripts/make-card-art.py.
// Общий модуль: нужен и генератору страниц (scripts/build.mjs), и разделу sections.mjs,
// чтобы у карточек одного типа рисунок был одинаковым.

const GENRE_ART = {
  'Стихотворение': 'stihotvorenie',
  'Малая поэма': 'malaya-poema',
  'Поэма': 'poema',
  'Статья': 'statya',
  'Автобиография': 'avtobiografiya',
  'Проза': 'proza',
};
export const genreArt = (genre) => `/img/genre/${GENRE_ART[genre] || 'default'}.svg`;

const MUSIC_ART = {
  'вокально-симфоническая музыка': 'score',
  'песня': 'song',
  'романс': 'romance',
  'хоровая обработка': 'chorus',
  'детская песня': 'children-song',
};
export const musicArt = (kind) => `/img/art/${MUSIC_ART[kind] || 'song'}.svg`;

const FILM_ART = { 'игровой фильм': 'film', 'телесериал': 'serial', 'документальное кино': 'documentary' };
export const filmArt = (kind) => `/img/art/${FILM_ART[kind] || 'film'}.svg`;

export function researchArt(type) {
  const t = String(type || '');
  if (/Сборник/.test(t)) return '/img/art/collection.svg';
  if (/Монография|биография|исследование|ЖЗЛ/i.test(t)) return '/img/art/monograph.svg';
  if (/статья|хроника/i.test(t)) return '/img/art/article.svg';
  return '/img/art/thesis.svg';
}

// Категории людей: у кого нет портрета в свободных источниках — гравированный медальон.
const PEOPLE_ART = { family: 'family', relatives: 'relatives', friends: 'friends', wives: 'wives', women: 'women', children: 'children' };
export const personArt = (p) => `/img/people/art-${PEOPLE_ART[p.category] || 'friends'}.svg`;
