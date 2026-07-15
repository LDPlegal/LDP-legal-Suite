/* ==================== LDP — i18n (ES/EN/DE) ====================
   Single source of truth: body[data-lang]. CSS rules in each page
   use [data-lang="xx"] [data-es|data-en|data-de] to toggle visibility.
   This file only manages the attribute + the toggle UI.
================================================================ */
const LDP_I18N = {
  get lang() {
    const v = localStorage.getItem('ldp_lang') || document.body?.dataset.lang || 'es';
    return (v === 'es' || v === 'en' || v === 'de') ? v : 'es';
  },
  set lang(v) {
    if (v !== 'es' && v !== 'en' && v !== 'de') return;
    localStorage.setItem('ldp_lang', v);
    this.apply();
  },
  apply() {
    const lang = this.lang;
    document.body.setAttribute('data-lang', lang);
    document.documentElement.lang = lang;
    // sync toggle buttons (any nav that has them)
    document.querySelectorAll('.lang-toggle button, .lang button').forEach(b => {
      b.classList.toggle('on', b.dataset.lang === lang);
    });
    // swap localized <title> / <meta description> / og:locale if present
    const tEl = document.querySelector('title[data-i18n-title]');
    if (tEl) {
      const v = tEl.getAttribute('data-' + lang);
      if (v) document.title = v;
    }
    const dEl = document.querySelector('meta[name="description"][data-i18n-desc]');
    if (dEl) {
      const v = dEl.getAttribute('data-' + lang);
      if (v) dEl.setAttribute('content', v);
    }
    const ogL = document.querySelector('meta[property="og:locale"]');
    if (ogL) {
      const map = { es: 'es_DO', en: 'en_US', de: 'de_DE' };
      ogL.setAttribute('content', map[lang]);
    }
  },
  init() {
    document.querySelectorAll('.lang-toggle button, .lang button').forEach(b => {
      b.addEventListener('click', () => { this.lang = b.dataset.lang; });
    });
    this.apply();
  }
};

window.LDP_I18N = LDP_I18N;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => LDP_I18N.init());
} else {
  LDP_I18N.init();
}
