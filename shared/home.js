import { createApp } from 'vue';
import './i18n.js';

import { ref, onMounted } from 'vue';

createApp({
  setup() {
    const currentLang = ref(window.AppI18n ? window.AppI18n.getLang() : 'zh');
    const t = (key, fallback, params) => {
      const lang = currentLang.value;
      return window.AppI18n ? window.AppI18n.t(key, fallback, params) : (fallback || key);
    };

    window.addEventListener('app-language-change', (e) => {
      currentLang.value = e.detail.lang;
    });

    const changeLang = (e) => {
      if (window.AppI18n) window.AppI18n.setLang(e.target.value, { reload: false });
    };

    return {
      currentLang,
      t,
      changeLang
    };
  }
}).mount('#app');
