# 开发日志

## 2026-03-23

### 新增 Tauri 原生直连 Google Server API (无需代理) 与 UI 优化
- **优化**: 之前由于浏览器的跨域(CORS)限制，Google Maps 的 Web API（如 TextSearch/Directions）必须经过中转代理服务器。现在通过在 `src-tauri` 后端手写暴露出 `native_http_get` 请求指令（基于 Rust `reqwest` 库），如果检测到当前应用运行在 Tauri 桌面端环境中，前端会自动拦截请求并使用原生途径直连 `maps.googleapis.com`，实现了 **零CORS阻碍、彻底告别本地调试代理**！
- **改动**: 新装 `reqwest` 后端依赖，扩展 `MapUtils.fetchData` 智能网络调度器，并重构了 `google-map/app.js` 的所有服务端 `fetch` 逻辑。同时通过在 Vue 模板中增加 `v-if="!isTauri"` 条件，在桌面端环境下自动隐藏掉“代理配置”填写框，提升用户体验。

### 附近搜索距离展示与专属路线详情卡片

**变更内容：**

1. **选中路线方案展示概览**
   - 附近地标搜索被选中并规划完路线时，现已直接在中心点坐标的下方即时展示目的地名称、地址及当前选择出行模式下的总体距离和时间预估，方便用户对比。
2. **搜索选项联动隐藏与列表距离测算**
   - 补充了各端返回近距离数据时的直线物理距离格式化列表展示字段 (`common.distance`)。
   - 只有在输入关键字进行实质上的周边搜索时，才会显示【搜索半径】和【结果数量】的选项配置项，精简仅输入中心点时的界面。
3. **修复路线总距离图标及百度端 Google 引擎数据展示问题**
   - 修复了在百度地图中，使用 Google API 服务进行周边搜索时，点击周边结果计算出的预估路程未能正确存入底层被激活节点变量（`nearbyRouteDetailInfo`），从而导致选中卡片无变化的兼容性 Bug。
   - 所有页面现在移除了原先写死的汽车硬编码前缀 `🚗`，重构引出专属函数 `getTravelModeIcon` 来基于用户不同出行模式动态选择对应的小型图形标志 (`🚗`, `🚌`, `🚶`, `🚲`)。
4. **附近搜索 UI 与状态逻辑深度优化**
   - **状态清理**: 在重新发起“搜索附近”操作时，现已强制重置已选中的地标信息及对应的路径详情，防止旧数据残留。
   - **布局调整**: 将“出行方式”选择框移动到了“搜索附近”按钮的正下方，使得“先搜索、后选路”的操作逻辑更加顺畅。
   - **兼容性大一统**: 统一了三端地图的出行方式枚举值为小写，并为 Google Maps 端增加了自动大小写转换与骑行模式（`riding` -> `BICYCLING`）的兼容层。


### 修复 Tauri 菜单语言切换失效问题
- **修复**: 前端在执行 `app-language-change` 试图调用 `window.__TAURI__.core.invoke` 同步修改 macOS/Windows 原生菜单时失败，原因是项目升级到 Tauri V2 后默认禁用了全局 API 注入。通过在 `tauri.conf.json` 的 `app` 中开启 `"withGlobalTauri": true` 恢复了前端访问能力。
- **优化**: 重构了 `shared/i18n.js` 中的通讯代码，增加了向下兼容 `window.__TAURI_INTERNALS__.invoke` 以及旧版本 V1 的多级降级安全保护。

### 修复 GitHub Actions Release 打包资源覆盖竞态问题
- **修复**: 在 `.github/workflows/build-exe.yml` 中，由于 `macos-latest`, `ubuntu-22.04`, `windows-latest` 三个任务处于同一矩阵并行执行，而每个任务都会执行一次“删除同名 Release”的脚本，导致早先编译完成的平台（例如 M1 芯片的 macOS 平台）上传的产物会被后来执行到删除步骤的平台强行抹掉。
- **方案**: 抽离了一个前置的 `prepare` 任务用于清理旧的 Tag 与 Release，矩阵编译 `publish` 任务则全部依赖（`needs: prepare`）前置任务，确保所有平台只在此后负责单独把编译好的文件上传追加进已有的 Release 中，完美找回丢失的 Mac 产物。

### 修复 macOS 原生编译错误
- **修复**: 移除了在尝试为 macOS 构建自定义应用原生菜单时引入的部分不兼容或缺失的 `PredefinedMenuItem` (如 `services`, `hide_others`, `show_all`, `zoom`)，以修复在 GitHub Actions 上构建 macos-latest 端出现的编译报错。

### 附近搜索结果的路线规划全解耦升级 (Baidu/Google/Amap)

**变更内容：**

1. **路线规划独立解耦**
   - 彻底分离了主“路线规划”面板与“附近搜索”结果点击时的计算逻辑，引入了 `doCalcRoute` 重构结构，并增加了关键的 `isNearby` 标识变量。
   - 附近地点的路线规划不再覆盖或污染旁边路线规划面板的表单数据，各 Tab 执行操作时有效隔离互不干扰。

2. **保留并保护现有搜索结果 Marker**
   - 针对三大地图服务商，实现了专属的 `clearNearbyRouteDrawings` 和多重图层管理逻辑。在展示附近地点路线时，系统不再暴力清空地图上的其他搜索结果钉子点，仅清除并更新单独的附近路线图层，极大增强了对比挑选附近地点的体验。

3. **原生支持出行方式切换计算**
   - 附近搜索面板新增了原生的出行方式选择器（支持：驾车、公交、步行、骑行）。

### 附近搜索体验优化与自动路线规划

**变更内容：**

1. **中心点专属 Marker 样式**
   - **百度地图**: 为附近搜索的中心点 Marker 增加专属的蓝色内联 SVG 纯图表，替代之前的红色标点加文本标签设计，在结果中一目了然。
   - **高德地图**: 附近搜索的中心点使用了专属的蓝色图标 (`mark_b.png`)，并与搜索结果的常规红色标点做完全图形区分。
   - **Google Maps**: 附近搜索中心点统一使用蓝色的标点图标 (`blue-dot.png`)。

2. **附近结果联动路线规划 (不跳转面板)**
   - 联动逻辑升级：点击下方列表中的任一结果时，当前页面**不再跳转**。
   - 自动在当前“附近搜索”页面底图上，将中心坐标作为起点、附近地点为终点，并自动继承当前所在页面的前端/服务器/Google 等 API 模式配置及路线规划规则，进行无缝路线绘制演示。

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
