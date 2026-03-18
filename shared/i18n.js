import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

const STORAGE_KEY = 'simple_map_demo_lang';
const DEFAULT_LANG = 'zh';
const RESOURCES = {
  zh: zhCN,
  en: enUS
};

const normalizeLang = (value) => {
  if (!value) return DEFAULT_LANG;
  return String(value).toLowerCase().startsWith('en') ? 'en' : 'zh';
};

const getLang = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return normalizeLang(saved || navigator.language || DEFAULT_LANG);
};

const readValue = (object, key) =>
  String(key || '')
    .split('.')
    .reduce((current, part) => (current && part in current ? current[part] : undefined), object);

const interpolate = (value, params = {}) =>
  String(value).replace(/\{(\w+)\}/g, (_, key) => (key in params ? String(params[key]) : `{${key}}`));

const t = (key, fallback = '', params = {}) => {
  const lang = getLang();
  const value = readValue(RESOURCES[lang], key);
  if (value == null) return interpolate(fallback || key, params);
  return typeof value === 'string' ? interpolate(value, params) : value;
};

const setLang = (lang, options = {}) => {
  const next = normalizeLang(lang);
  const prev = getLang();
  localStorage.setItem(STORAGE_KEY, next);
  applyLanguage(); // Apply static DOM localizations immediately
  window.dispatchEvent(new CustomEvent('app-language-change', { detail: { lang: next, reload: options.reload } }));
  if (options.reload === true && next !== prev) {
    window.location.reload();
  }
};

const setText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
};

const setHtml = (selector, value) => {
  const element = document.querySelector(selector);
  if (element) element.innerHTML = value;
};

const setTitle = (selector, value) => {
  const element = document.querySelector(selector);
  if (element) element.setAttribute('title', value);
};

const localizeHomePage = () => {
  const path = window.location.pathname.replace(/\\/g, '/');
  const isHome = !/\/(baidu-map|google-map|amap-map)\//.test(path);
  if (!isHome) return;

  document.title = t('home.title');
  setText('.portal-title', t('home.title'));
  setText('.portal-subtitle', t('home.subtitle'));
  setText('.portal-footer', t('home.footer'));

  document.querySelectorAll('.map-card').forEach((card) => {
    const href = card.getAttribute('href') || '';
    let prefix = '';
    if (href.includes('baidu-map')) prefix = 'home.providers.baidu';
    if (href.includes('google-map')) prefix = 'home.providers.google';
    if (href.includes('amap-map')) prefix = 'home.providers.amap';
    if (!prefix) return;
    const nameNode = card.querySelector('.card-name');
    const descNode = card.querySelector('.card-desc');
    if (nameNode) nameNode.textContent = t(`${prefix}.name`);
    if (descNode) descNode.innerHTML = t(`${prefix}.desc`);
  });
};

const getMapPageKey = () => {
  const path = window.location.pathname.replace(/\\/g, '/');
  if (path.includes('/baidu-map/')) return 'baidu';
  if (path.includes('/google-map/')) return 'google';
  if (path.includes('/amap-map/')) return 'amap';
  return '';
};

const localizeMapPage = () => {
  const pageKey = getMapPageKey();
  if (!pageKey) return;

  document.title = t(`pages.${pageKey}.title`);
  setText('.sidebar-header h2', t(`pages.${pageKey}.title`));
  setText('.map-overlay h2', t(`pages.${pageKey}.overlay`));

  const homeLink = document.querySelector('.nav-home');
  if (homeLink) {
    const icon = homeLink.querySelector('svg')?.outerHTML || '';
    homeLink.innerHTML = `${icon} ${t('nav.home')}`;
    setTitle('.nav-home', t('nav.homeTitle'));
  }

  document.querySelectorAll('.nav-switch').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const icon = link.querySelector('svg')?.outerHTML || '';
    let prefix = '';
    if (href.includes('baidu-map')) prefix = 'nav.baidu';
    if (href.includes('google-map')) prefix = 'nav.google';
    if (href.includes('amap-map')) prefix = 'nav.amap';
    if (!prefix) return;
    link.innerHTML = `${icon} ${t(prefix)}`;
    link.setAttribute('title', t(`${prefix}Title`));
  });

  document.querySelectorAll('.json-toolbar .el-button').forEach((button) => {
    button.textContent = t('common.copyJsonButton');
  });
};

const injectStyles = () => {
  if (document.getElementById('app-i18n-style')) return;
  const style = document.createElement('style');
  style.id = 'app-i18n-style';
  style.textContent = `
    .app-lang-switch {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.35);
      background: rgba(255, 255, 255, 0.16);
      color: #fff;
      font-size: 12px;
    }
    .app-lang-switch select {
      border: 0;
      outline: none;
      border-radius: 8px;
      padding: 2px 6px;
      font-size: 12px;
      color: #333;
    }
    .app-lang-switch-floating {
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 2000;
      border: 1px solid rgba(0, 0, 0, 0.12);
      background: rgba(255, 255, 255, 0.92);
      color: #111;
    }
  `;
  document.head.appendChild(style);
};

const injectLangSwitch = () => {
  const sidebarNav = document.querySelector('.sidebar-nav');
  const portalContainer = document.querySelector('.portal-container');

  if (sidebarNav && !sidebarNav.querySelector('.app-lang-switch')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'app-lang-switch';
    wrapper.innerHTML = `
      <label for="app-lang-select">${t('common.langLabel')}</label>
      <select id="app-lang-select" onchange="window.AppI18n && window.AppI18n.setLang(this.value)">
        <option value="zh">ZH</option>
        <option value="en">EN</option>
      </select>
    `;
    sidebarNav.appendChild(wrapper);
  }

  if (!sidebarNav && portalContainer && !document.querySelector('.app-lang-switch-floating')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'app-lang-switch app-lang-switch-floating';
    wrapper.innerHTML = `
      <label for="app-lang-select">${t('common.langLabel')}</label>
      <select id="app-lang-select" onchange="window.AppI18n && window.AppI18n.setLang(this.value)">
        <option value="zh">ZH</option>
        <option value="en">EN</option>
      </select>
    `;
    document.body.appendChild(wrapper);
  }

  const select = document.getElementById('app-lang-select');
  if (select) {
    select.value = getLang();
  }

  // Use event delegation so the handler survives Vue DOM replacement
  if (!window.__langSwitchDelegated) {
    window.__langSwitchDelegated = true;
    document.addEventListener('change', (event) => {
      if (event.target && event.target.id === 'app-lang-select') {
        console.log('[i18n] Language switch triggered:', event.target.value);
        setLang(event.target.value);
      }
    });
  }
};

const applyLanguage = () => {
  document.documentElement.lang = getLang() === 'en' ? 'en' : 'zh-CN';
  localizeHomePage();
  localizeMapPage();
};

const bootstrap = () => {
  injectStyles();
  injectLangSwitch();
  applyLanguage();

  // Re-sync the language select value after Vue re-renders the DOM.
  // Vue may replace DOM elements after bootstrap, losing the initial select value.
  const syncLangSelect = () => {
    const select = document.getElementById('app-lang-select');
    if (select && select.value !== getLang()) {
      select.value = getLang();
    }
  };
  // Retry a few times to catch Vue's async mount
  setTimeout(syncLangSelect, 100);
  setTimeout(syncLangSelect, 500);
  setTimeout(syncLangSelect, 1500);
};

export const AppI18n = {
  getLang,
  setLang,
  normalizeLang,
  t,
  applyLanguage
};

if (typeof window !== 'undefined') {
  window.AppI18n = AppI18n;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
