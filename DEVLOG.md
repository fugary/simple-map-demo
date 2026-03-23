# 开发日志

## 2026-03-23

### 附近搜索体验优化与自动路线规划

**变更内容：**

1. **中心点专属 Marker 样式**
   - **百度地图**: 为附近搜索的中心点 Marker 增加红色的「中心点」自定样式 Label，使其在众多结果中标注清晰，容易辨认。
   - **高德地图**: 附近搜索的中心点使用了专属的蓝色图标 (`mark_b.png`)，并与搜索结果的常规标点做显著区分。
   - **Google Maps**: 附近搜索中心点使用蓝色的标点图标 (`blue-dot.png`)。

2. **附近结果联动路线规划**
   - 新增交互功能：在附近搜索得到结果后，点击下方列表中的任一结果。
   - 界面行为对齐：三个地图页面会自动跳转到「路线」标签页，自动将查询的“中心坐标”赋值为路线起点、“附近地点的坐标”赋值为路线终点，并立即发起路线规划并绘制路线效果。

### Tauri 原生菜单多语言支持与搜索关键字优化

**变更内容：**

1. **地图搜索默认关键字更改**
   - 将 `baidu-map/app.js` 与 `google-map/app.js` 中的默认搜索关键词和终点由 `帝国大厦` 更改为 `自由女神像`，以便更好地进行海外地图定位测试。

2. **Tauri 原生菜单优化**
   - 移除了由于手动追加 `关于 (About)` 子菜单而在 Windows 环境下产生的重复冗余菜单。
   - 使用 Rust 原生重构了全局窗口默认菜单 (`File`, `Edit`, `View`, `Window`, `Help`)，将自定义的 `AboutMetadata` 成功注入到了标准的 Help > About 项中。

3. **前端国际化 (i18n) 与原生菜单同步**
   - 新增了 Tauri 暴露函数 `#[tauri::command] update_menu_language(lang)`，用于允许前端请求重新绑定并翻译 Tauri 窗口的原生菜单。
   - 在 `shared/i18n.js` 的 `setLang` 及 `bootstrap` 核心流程中挂载了对 `window.__TAURI__.core.invoke` 的通讯处理，使 Tauri 原生菜单能与 Web 界面的语言切换做到完全同步响应。

## 2026-03-11

### 新增 Google Maps 支持 & 多服务商架构重构

**变更内容：**

1. **项目架构重构**
   - 重命名 `citsgbt-map-test/` → `baidu-map/`，与后续地图服务商目录命名规范统一
   - 抽取公用模块到 `shared/` 目录：
     - `shared/utils.js`：JSON 高亮、距离/时间格式化、JSONP、配置存取、坐标解析等
     - `shared/common.css`：布局、侧边栏、Tab 面板、JSON 面板、路线详情等通用样式
   - 将 `package.json` 和 `eslint.config.mjs` 移至项目根目录，统一管理依赖和 Lint 规则
   - ESLint 按目录配置不同全局变量（百度: `BMapGL`、Google: `google`）

2. **百度地图页面重构**
   - `baidu-map/app.js` 使用 `MapUtils.*` 替换本地重复函数，减少约 80 行代码
   - `baidu-map/style.css` 精简为仅百度专有样式（蓝色主题），通用样式引用 `shared/common.css`

3. **新增 Google Maps 测试页面** (`google-map/`)
   - 与百度地图页面同等的四个功能 Tab：配置面板、地点搜索、路线规划、坐标显示
   - 使用 Google Maps JavaScript API，支持：
     - `PlacesService.textSearch()` 地点搜索
     - `DirectionsService` + `DirectionsRenderer` 路线规划（支持驾车/公交/步行/骑行）
     - `Geocoder` 地址↔坐标互转
   - 绿色主题 (`#34A853`) 与百度蓝色主题区分

4. **新增入口页面** (`index.html`)
   - 卡片式地图服务商选择页，渐变紫色背景
   - 包含百度地图、Google Maps 入口，以及高德地图「即将推出」占位
   - 悬停动画效果，标注国内/国际标签

5. **更新 AGENT.md**
   - 更新为多服务商架构文档，包含扩展指南

6. **新增侧边栏导航条**
   - 每个地图页面侧边栏头部新增导航栏，支持「返回首页」和「快速切换」到其他服务商
   - 导航链接使用胶囊式按钮样式（pill-style），半透明白色背景，hover 时浮起带阴影

7. **百度地图国际 API 支持**
   - 配置面板新增「接口范围」切换（国内/国际）
   - 国际模式下服务端 API 自动切换到 `place_abroad/v1/search` 和 `direction_abroad/v1/{mode}`
   - 快捷搜索新增 Airport / Hotel / Train Station 国际关键词按钮

8. **Google Maps 服务端模式（代理）支持**
   - 配置面板新增「代理地址」输入框，默认填入 `https://mock-dev.citsgbt.com/mock/...`
   - 启用服务端模式后，地点搜索通过 `place/textsearch/json` 代理接口，路线规划通过 `directions/json` 代理接口
   - 服务端模式结果支持 JSON 数据查看和列表展示双 Tab 切换
