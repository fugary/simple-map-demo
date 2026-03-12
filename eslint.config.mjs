import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2021,
      globals: {
        "Vue": "readonly",
        "ElementPlus": "readonly",
        "MapUtils": "readonly",
        "window": "readonly",
        "document": "readonly",
        "console": "readonly",
        "localStorage": "readonly",
        "navigator": "readonly"
      }
    },
    rules: {
      "no-undef": "warn",
      "no-unused-vars": "warn"
    }
  },
  // 百度地图 - 额外全局变量
  {
    files: ["baidu-map/**/*.js"],
    languageOptions: {
      globals: {
        "BMapGL": "readonly",
        "BMAP_STATUS_SUCCESS": "readonly"
      }
    }
  },
  // Google Maps - 额外全局变量
  {
    files: ["google-map/**/*.js"],
    languageOptions: {
      globals: {
        "google": "readonly",
        "fetch": "readonly",
        "URLSearchParams": "readonly"
      }
    }
  }
];
