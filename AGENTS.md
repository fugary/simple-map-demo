# 多地图服务商 Web API 测试平台

## 1. 项目概述
基于 Vue 3 + Element Plus + 纯 HTML 的静态 Web 应用，统一测试各地图服务商的 Web API。
支持国内（百度地图）与国际（Google Maps）场景，设计上便于未来扩展更多地图服务商（如高德地图）。

## 2. 架构设计

### 2.1 统一目录规范
每个地图服务商目录结构一致，公用逻辑/样式抽取到 `shared/` 模块：

```text
citsgbt-map-demo/
├── index.html                 # 入口页：地图服务商选择
├── package.json               # 统一 npm 项目配置
├── eslint.config.mjs          # 统一 ESLint 配置（按目录区分全局变量）
├── .gitignore
├── shared/                    # 公用模块
│   ├── utils.js               # MapUtils 工具函数
│   └── common.css             # 通用样式
├── baidu-map/                 # 百度地图
│   ├── index.html
│   ├── app.js
│   └── style.css
└── google-map/                # Google Maps
    ├── index.html
    ├── app.js
    └── style.css
```

### 2.2 公用模块 `shared/`

**`utils.js`** — 挂载到 `window.MapUtils`，包含：
- `highlightJson(str)` — JSON 语法高亮 HTML
- `copyJson(data)` — 复制 JSON 到剪贴板
- `formatDistance(meters)` — 距离格式化
- `formatDuration(seconds)` — 时长格式化
- `jsonp(url)` — JSONP 请求
- `saveConfigVal(ref, val, key)` — 配置存取（localStorage）
- `loadConfigList(key)` — 配置加载
- `parseCoords(str)` — 坐标字符串解析

**`common.css`** — 通用布局、侧边栏、Tab、JSON 面板、路线详情等样式。

### 2.3 功能模块（各服务商一致）

| Tab | 功能 | 百度 API | Google API |
|-----|------|----------|-----------|
| 配置面板 | API Key 管理、地图加载 | BMapGL WebGL | Maps JS API |
| 地点搜索 | 关键词搜索（前端/服务端） | LocalSearch / Place API | PlacesService.textSearch |
| 路线规划 | 起终点路线规划 | DrivingRoute 等 / Direction Lite | DirectionsService |
| 坐标显示 | 地址↔坐标互转 | Geocoder | Geocoder |

### 2.4 扩展新服务商
新增地图服务商只需：
1. 在根目录新建 `{provider}-map/` 目录，包含 `index.html`、`app.js`、`style.css`
2. 在 `eslint.config.mjs` 添加该目录的全局变量配置
3. 在 `index.html` 入口页添加卡片入口

## 3. 开发规范与避坑指南

### 3.1 Vue 组件化而非原生 DOM 操作
虽然为了轻量化项目我们使用了直接在 HTML 中引入 Vue 的方式，但必须严格遵守 Vue 的**数据驱动与声明式渲染**思想，严禁“原生混用”导致响应式丢失：
- **禁止原生 DOM 注入**：不得在业务代码或工具类库（如 `i18n.js`）中使用 `document.createElement`、`.innerHTML` 或是 `appendChild` 将 UI 元素（如语言切换下拉框等 UI 控件）强行推入 Vue 所管理的 `<div id="app">` 中。
- **模板层管理**：所有的下拉框、弹窗等 UI 组件必须老老实实写在 `index.html` 的 Vue 模板定义内，使用 `v-model` 或 `@click` 绑定事件并使用 `setup()` 导出。

### 3.2 国际化 (i18n) 响应式更新原理
由于 `i18n.t()` 翻译函数需要被大量写在 Vue 模板中（如 `{{ t('common.name') }}`），如果 `t()` 执行时内部仅仅是调用非响应式的原生逻辑或读取 `localStorage`，Vue 就无法识别到依赖追踪，导致语言切换时页面文本不刷新。
- **绑定响应式引用**：在 `setup()` 暴露出 `t` 函数时，必须在函数体内部显式地触碰一次响应式变量（例如 `const lang = currentLang.value;`），以此触发 Vue 的 Proxy getter，使模板正确订阅 `currentLang` 的变化。
- **语言切换无刷新**：不要使用 `window.location.reload()` 刷新整个网页来更新语言。使用 `window.dispatchEvent` 抛出全局自定义事件（如 `app-language-change`），在每个地图组件的 `setup()` 中监听并同步修改 `currentLang.value`。仅针对无法实时改变外语类型的第三方图商 SDK（如 Google / Amap）做**局部 `<script>` 卸载重载**。

### 3.3 每次开发后必须记录开发日志
【**重要规则**】每次完成一个功能迭代或修复后，**必须自动将开发日志记录到 `DEVLOG.md` 中**，记录修改的功能点、影响的文件以及背后的原因。这保证了项目迭代历史清晰可见，避免遗忘修改的内容。

## 4. 技术栈
- **框架**：Vue 3 (CDN)
- **UI 库**：Element Plus (CDN)
- **地图引擎**：百度地图 JavaScript API GL / Google Maps JavaScript API
- **ESLint**：统一配置，按目录区分全局变量
