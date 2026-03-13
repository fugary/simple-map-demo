import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const rootDir = resolve('.');

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      vue: 'vue/dist/vue.esm-bundler.js'
    }
  },
  server: {
    host: '0.0.0.0',
    port: 8080
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/element-plus')) return 'element-plus';
          if (id.includes('node_modules/vue')) return 'vue';
          if (id.includes('/shared/i18n.js') || id.includes('/shared/locales/')) return 'i18n';
          if (id.includes('/shared/utils.js') || id.includes('/shared/google-provider.js')) return 'shared-utils';
          return undefined;
        }
      },
      input: {
        home: resolve(rootDir, 'index.html'),
        baidu: resolve(rootDir, 'baidu-map/index.html'),
        google: resolve(rootDir, 'google-map/index.html'),
        amap: resolve(rootDir, 'amap-map/index.html')
      }
    }
  }
});
