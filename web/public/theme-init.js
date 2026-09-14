/* Runs before the app loads to prevent a light/dark flash on first paint. */
(function () {
  try {
    var stored = localStorage.getItem('infin8-theme');
    var mode = stored === 'light' || stored === 'dark' ? stored : 'system';
    var dark =
      mode === 'dark' ||
      (mode === 'system' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (error) {
    /* Private browsing can block storage: the light theme is a fine default. */
  }
})();
