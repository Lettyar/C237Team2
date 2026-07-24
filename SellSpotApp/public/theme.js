(() => {
  'use strict';

  const storageKey = 'sellspot-theme';
  const root = document.documentElement;
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function getSavedTheme() {
    try {
      const savedTheme = window.localStorage.getItem(storageKey);
      return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : null;
    } catch (error) {
      return null;
    }
  }

  function getPreferredTheme() {
    return getSavedTheme() || (mediaQuery.matches ? 'dark' : 'light');
  }

  function updateToggle(theme) {
    const isDark = theme === 'dark';

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.setAttribute('aria-pressed', String(isDark));
      button.setAttribute(
        'aria-label',
        isDark ? 'Switch to light mode' : 'Switch to dark mode'
      );
      button.setAttribute(
        'title',
        isDark ? 'Switch to light mode' : 'Switch to dark mode'
      );

      const icon = button.querySelector('[data-theme-icon]');
      const label = button.querySelector('[data-theme-label]');

      if (icon) icon.textContent = isDark ? '☀' : '☾';
      if (label) label.textContent = isDark ? 'Light mode' : 'Dark mode';
    });

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', isDark ? '#0f172a' : '#f4f7fb');
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    updateToggle(theme);
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch (error) {
      // The selected theme still works for the current page if storage is unavailable.
    }
  }

  // This runs immediately in the document head to prevent the wrong theme flashing on load.
  applyTheme(getPreferredTheme());

  document.addEventListener('DOMContentLoaded', () => {
    updateToggle(root.dataset.theme);

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        saveTheme(nextTheme);
        applyTheme(nextTheme);
      });
    });
  });

  mediaQuery.addEventListener('change', (event) => {
    if (!getSavedTheme()) applyTheme(event.matches ? 'dark' : 'light');
  });
})();
