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

## 3. 技术栈
- **框架**：Vue 3 (CDN)
- **UI 库**：Element Plus (CDN)
- **地图引擎**：百度地图 JavaScript API GL / Google Maps JavaScript API
- **ESLint**：统一配置，按目录区分全局变量
