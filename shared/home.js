import { createApp } from 'vue';
import './i18n.js';

    import { ref, watch, onMounted } from 'vue';

    createApp({
      setup() {
        const currentLang = ref(window.AppI18n ? window.AppI18n.getLang() : 'zh');
        const t = (key, fallback, params) => {
          const lang = currentLang.value;
          return window.AppI18n ? window.AppI18n.t(key, fallback, params) : (fallback || key);
        };

        watch(currentLang, (newLang) => {
          if (window.AppI18n && window.AppI18n.getLang() !== newLang) {
            window.AppI18n.setLang(newLang, { reload: false });
          }
        });

        window.addEventListener('app-language-change', (e) => {
          if (currentLang.value !== e.detail.lang) {
            currentLang.value = e.detail.lang;
          }
        });

        return {
          currentLang,
          t
        };
      }
}).mount('#app');
