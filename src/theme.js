/* Тема до первой отрисовки: по умолчанию светлая, тёмная — только если её выбрал читатель.
   Скрипт стоит в <head>, поэтому вспышки чужой темы не бывает. */
try {
  var saved = localStorage.getItem('site-theme');
  document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
} catch (e) {}
