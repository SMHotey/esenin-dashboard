/* Тема до первой отрисовки: без вспышки светлого фона у тёмной темы. */
try {
  var saved = localStorage.getItem('site-theme');
  var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = saved || (dark ? 'dark' : 'light');
} catch (e) {}
