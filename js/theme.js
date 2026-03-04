// ===== THEME TOGGLE =====
// Reads/saves light|dark preference to localStorage.
// Apply to every page by loading this script before </body>.

(function () {
    const STORAGE_KEY = 'chess-theme';

    function getPreferred() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return saved;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        // Update all toggle button icons
        document.querySelectorAll('.theme-toggle').forEach(btn => {
            btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
            btn.title = theme === 'dark' ? 'Light mode' : 'Dark mode';
        });
    }

    // Apply immediately (before render to avoid flash)
    applyTheme(getPreferred());

    // Wire up toggle buttons once DOM is ready
    function wireButtons() {
        document.querySelectorAll('.theme-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-theme') || 'light';
                applyTheme(current === 'dark' ? 'light' : 'dark');
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireButtons);
    } else {
        wireButtons();
    }

    // Mobile hamburger menu
    function wireHamburger() {
        const btn = document.querySelector('.nav-hamburger');
        const links = document.querySelector('.nav-links');
        if (!btn || !links) return;
        btn.addEventListener('click', () => {
            links.classList.toggle('open');
            btn.setAttribute('aria-expanded', links.classList.contains('open'));
        });
        // Close when a link is clicked
        links.querySelectorAll('.nav-link').forEach(a => {
            a.addEventListener('click', () => links.classList.remove('open'));
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireHamburger);
    } else {
        wireHamburger();
    }
})();
