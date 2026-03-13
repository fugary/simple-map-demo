(() => {
  const STORAGE_KEY = "simple_map_demo_lang";
  const DEFAULT_LANG = "zh";

  const normalizeLang = (value) => {
    if (!value) return DEFAULT_LANG;
    const lower = String(value).toLowerCase();
    if (lower.startsWith("en")) return "en";
    return "zh";
  };

  const getLang = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeLang(saved);
    return normalizeLang(navigator.language || DEFAULT_LANG);
  };

  const setLang = (lang, options = {}) => {
    const next = normalizeLang(lang);
    const prev = getLang();
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent("app-language-change", { detail: { lang: next } }));
    if (options.reload !== false && next !== prev) {
      window.location.reload();
    }
  };

  const rememberOriginal = (element) => {
    if (!element) return;
    if (!element.dataset.i18nZhText) {
      element.dataset.i18nZhText = element.textContent;
    }
    if (!element.dataset.i18nZhHtml) {
      element.dataset.i18nZhHtml = element.innerHTML;
    }
    if (!element.dataset.i18nZhTitle) {
      element.dataset.i18nZhTitle = element.getAttribute("title") || "";
    }
  };

  const setTextByLang = (element, lang, enText) => {
    if (!element) return;
    rememberOriginal(element);
    element.textContent = lang === "en" ? enText : element.dataset.i18nZhText;
  };

  const setHtmlByLang = (element, lang, enHtml) => {
    if (!element) return;
    rememberOriginal(element);
    element.innerHTML = lang === "en" ? enHtml : element.dataset.i18nZhHtml;
  };

  const setTitleByLang = (element, lang, enTitle) => {
    if (!element) return;
    rememberOriginal(element);
    element.setAttribute("title", lang === "en" ? enTitle : element.dataset.i18nZhTitle);
  };

  const localizeHomePage = (lang) => {
    const path = window.location.pathname.replace(/\\/g, "/");
    const isHome = !/\/(baidu-map|google-map|amap-map)\//.test(path);
    if (!isHome) return;

    if (!document.documentElement.dataset.i18nZhTitle) {
      document.documentElement.dataset.i18nZhTitle = document.title;
    }
    document.title =
      lang === "en"
        ? "Map Web API Playground"
        : document.documentElement.dataset.i18nZhTitle;

    setTextByLang(document.querySelector(".portal-title"), lang, "Map Web API Playground");
    setTextByLang(
      document.querySelector(".portal-subtitle"),
      lang,
      "Unified testing across map providers for domestic and international scenarios"
    );

    document.querySelectorAll(".map-card").forEach((card) => {
      const href = card.getAttribute("href") || "";
      const nameNode = card.querySelector(".card-name");
      const descNode = card.querySelector(".card-desc");

      if (href.includes("baidu-map")) {
        setTextByLang(nameNode, lang, "Baidu Maps");
        setHtmlByLang(descNode, lang, "Baidu Maps API<br/>Supports WebGL rendering and server APIs");
      } else if (href.includes("google-map")) {
        setTextByLang(nameNode, lang, "Google Maps");
        setHtmlByLang(descNode, lang, "Google Maps Platform<br/>Supports Places, Directions, and Geocoding");
      } else if (href.includes("amap-map")) {
        setTextByLang(nameNode, lang, "Amap");
        setHtmlByLang(descNode, lang, "Amap Web JS API<br/>Supports frontend rendering and server APIs");
      }
    });
  };

  const localizeMapPage = (lang) => {
    const titleMap = {
      "baidu-map": "Baidu Maps Web API Playground",
      "google-map": "Google Maps API Playground",
      "amap-map": "Amap Web API Playground",
    };

    const path = window.location.pathname.replace(/\\/g, "/");
    const pageKey = Object.keys(titleMap).find((key) => path.includes(`/${key}/`));
    if (!pageKey) return;

    if (!document.documentElement.dataset.i18nZhTitle) {
      document.documentElement.dataset.i18nZhTitle = document.title;
    }
    document.title = lang === "en" ? titleMap[pageKey] : document.documentElement.dataset.i18nZhTitle;

    const homeLink = document.querySelector(".nav-home");
    if (homeLink) {
      rememberOriginal(homeLink);
      const iconHtml = homeLink.querySelector("svg")?.outerHTML || "";
      homeLink.innerHTML = lang === "en" ? `${iconHtml} Home` : homeLink.dataset.i18nZhHtml;
      setTitleByLang(homeLink, lang, "Back to Home");
    }

    document.querySelectorAll(".nav-switch").forEach((link) => {
      rememberOriginal(link);
      const iconHtml = link.querySelector("svg")?.outerHTML || "";
      const href = link.getAttribute("href") || "";
      let enLabel = "Map";
      let enTitle = "Switch map";

      if (href.includes("baidu-map")) {
        enLabel = "Baidu Maps";
        enTitle = "Switch to Baidu Maps";
      } else if (href.includes("google-map")) {
        enLabel = "Google Maps";
        enTitle = "Switch to Google Maps";
      } else if (href.includes("amap-map")) {
        enLabel = "Amap";
        enTitle = "Switch to Amap";
      }

      link.innerHTML = lang === "en" ? `${iconHtml} ${enLabel}` : link.dataset.i18nZhHtml;
      setTitleByLang(link, lang, enTitle);
    });

    setTextByLang(document.querySelector(".sidebar-header h2"), lang, titleMap[pageKey]);
    setTextByLang(
      document.querySelector(".map-overlay h2"),
      lang,
      "Configure API credentials and load the map first"
    );
  };

  const injectLangSwitch = (lang) => {
    const sidebarNav = document.querySelector(".sidebar-nav");
    const portalContainer = document.querySelector(".portal-container");

    if (sidebarNav && !sidebarNav.querySelector(".app-lang-switch")) {
      const wrapper = document.createElement("div");
      wrapper.className = "app-lang-switch";
      wrapper.innerHTML = `
        <label for="app-lang-select">Lang</label>
        <select id="app-lang-select">
          <option value="zh">ZH</option>
          <option value="en">EN</option>
        </select>
      `;
      sidebarNav.appendChild(wrapper);
    }

    if (!sidebarNav && portalContainer && !document.querySelector(".app-lang-switch-floating")) {
      const wrapper = document.createElement("div");
      wrapper.className = "app-lang-switch app-lang-switch-floating";
      wrapper.innerHTML = `
        <label for="app-lang-select">Lang</label>
        <select id="app-lang-select">
          <option value="zh">ZH</option>
          <option value="en">EN</option>
        </select>
      `;
      document.body.appendChild(wrapper);
    }

    const select = document.getElementById("app-lang-select");
    if (select) {
      select.value = lang;
      select.addEventListener("change", (event) => {
        setLang(event.target.value, { reload: true });
      });
    }
  };

  const injectStyles = () => {
    if (document.getElementById("app-i18n-style")) return;
    const style = document.createElement("style");
    style.id = "app-i18n-style";
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

  const applyLanguage = (lang) => {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    localizeHomePage(lang);
    localizeMapPage(lang);
  };

  const bootstrap = () => {
    const lang = getLang();
    injectStyles();
    injectLangSwitch(lang);
    applyLanguage(lang);
  };

  window.AppI18n = {
    getLang,
    setLang,
    normalizeLang,
    applyLanguage,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
