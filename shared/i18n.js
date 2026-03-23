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
  const tauriInvoke = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (tauriInvoke) {
    tauriInvoke('update_menu_language', { lang: next }).catch(console.error);
  }

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

const applyLanguage = () => {
  document.documentElement.lang = getLang() === 'en' ? 'en' : 'zh-CN';
  
  const path = window.location.pathname.replace(/\\/g, '/');
  const isHome = !/\/(baidu-map|google-map|amap-map)\//.test(path);
  
  if (isHome) {
    document.title = t('home.title');
  } else {
    let pageKey = '';
    if (path.includes('/baidu-map/')) pageKey = 'baidu';
    if (path.includes('/google-map/')) pageKey = 'google';
    if (path.includes('/amap-map/')) pageKey = 'amap';
    if (pageKey) {
      document.title = t(`pages.${pageKey}.title`);
    }
  }
};

const bootstrap = () => {
  applyLanguage();
  const tauriInvoke = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (tauriInvoke) {
    tauriInvoke('update_menu_language', { lang: getLang() }).catch(console.error);
  }
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
