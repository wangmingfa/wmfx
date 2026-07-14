# 独立设置/功能页迁移设计（Vue Router 路由 + wmfx:// 内部协议）

日期：2026-07-14（修订 v3）
状态：已批准（待实现）

## 目标

将 **Sidebar** 整体移除，其承载的五类功能各自成为**独立的内部页面**，通过 **Vue Router 路由**渲染（**不新增 Vite entry**，复用单一 SPA 产物），并作为**真实的 Electron WebContentsView tab** 打开：

- `/settings`（嵌套子路由：外观/常规/下载/关于）
- `/history` —— 历史
- `/bookmarks` —— 书签
- `/downloads` —— 下载
- `/proxy` —— 代理
- `/newtab` —— 新标签页（原 ChromeUI 叠层 `NewTab.vue` 改为 WebContentsView 内部页，`about:blank` 叠层方式废弃）

统一行为（对齐 Chrome 的 `chrome://` 页面）：
- 地址栏显示 `wmfx://<path>`，**可编辑**，前进/后退/刷新**正常可用**。
- 在内部路由间切换保持内部态；在地址栏输入外部站点则转为普通标签。
- 通过 TabBar 的**应用菜单（⋮）**打开/聚焦这些内部页（focus-if-exists）。

## 背景与现状

- 每个标签页是真实的 `WebContentsView`（`apps/main/src/tab-manager.ts:34`），渲染进程 SPA（ChromeUI）只负责定位这些 View。
- 渲染进程当前**未使用 vue-router**。
- Sidebar（`Sidebar.vue`）以内联面板承载 history/bookmarks/downloads/proxy/settings 五项；其切换、宽度逻辑散布于 `ChromeUI.vue`、`TabBar.vue`、`tab-manager.ts`（`SIDEBAR_WIDTH`/`setSidebarOpen`/`applyBounds`）、`ipc/register.ts`（`tab:setSidebarOpen`）、`preload.ts`、`env.d.ts`、`channels.ts`。
- 下列**独立页面组件已存在**，可直接作为路由目标（均用 `window.browserAPI`，需 preload）：
  - `views/HistoryView.vue`、`views/BookmarkView.vue`、`views/DownloadsView.vue`、`views/ProxyPanel.vue`
  - `views/SettingsView.vue`（将拆分为 `/settings` 的子视图，见下）
- 普通标签的 WebContentsView **未挂载 preload**；内部页面需要 `window.browserAPI`，故内部标签必须挂载 preload。
- 标签创建经 `tab:create`；dev 加载 `VITE_DEV_SERVER_URL`，prod 加载 `apps/renderer/dist/index.html`（`paths.ts`）。

## 方案概览

单入口 SPA + `vue-router`（hash 模式）。主进程对 `wmfx://` 协议做通用重写：识别任意 `wmfx://<path>` → 把同一产物以 `#/<path>` hash 路由加载（dev 用 dev server，prod 用 `loadFile(index,{hash})`），展示地址保留 `wmfx://<path>`，并在 `did-navigate`/`did-navigate-in-page` 中反向映射同步。内部标签挂 preload + `isPinned`。`/newtab` 同样作为内部页走此路径，原 `about:blank` 叠层方案废弃。

## 详细改动

### 1. 新增依赖
`apps/renderer` 增加 `vue-router`（`bun add vue-router`）。使用 **hash 模式**（`createWebHashHistory`），天然兼容 `file://` 与 dev server。

### 2. 渲染进程路由（含嵌套）
- 新增 `apps/renderer/src/router.ts`：
  ```ts
  import { createRouter, createWebHashHistory } from 'vue-router'
  import ChromeUI from './components/ChromeUI.vue'
  import SettingsLayout from './views/settings/SettingsLayout.vue'
  import AppearanceView from './views/settings/AppearanceView.vue'
  import GeneralView from './views/settings/GeneralView.vue'
  import SettingsDownloadsView from './views/settings/SettingsDownloadsView.vue'
  import AboutView from './views/settings/AboutView.vue'
  import HistoryView from './views/HistoryView.vue'
  import BookmarkView from './views/BookmarkView.vue'
  import DownloadsView from './views/DownloadsView.vue'
  import ProxyPage from './views/ProxyPage.vue'
  import NewTabView from './views/NewTab.vue'
  import { INTERNAL_ROUTE_PREFIXES } from '@browser/shared'

  export const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', component: ChromeUI },
      {
        path: '/settings',
        component: SettingsLayout,
        redirect: '/settings/appearance',
        children: [
          { path: 'appearance', component: AppearanceView },
          { path: 'general', component: GeneralView },
          { path: 'downloads', component: SettingsDownloadsView },
          { path: 'about', component: AboutView },
        ],
      },
      { path: '/history', component: HistoryView },
      { path: '/bookmarks', component: BookmarkView },
      { path: '/downloads', component: DownloadsView },
      { path: '/proxy', component: ProxyPage },
      { path: '/newtab', component: NewTabView },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })
  ```
- `main.ts`：`createApp(App).use(pinia).use(router).mount('#app')`。
- `App.vue`：改为 `<template><router-view /></template>`；内联全局样式（`*` reset、html/body/#app）迁移到 `style.css`。
- 主窗口加载 `index.html`（无 hash）→ `/` → `ChromeUI`，**原有行为不变**。

### 3. 各内部页面
- **设置（嵌套）**：
  - `views/settings/SettingsLayout.vue`：左侧菜单（`<router-link>` 到各子路由）+ 右侧 `<router-view/>`（Chrome 风格）。
  - 子视图（从 `SettingsView.vue` 拆分，沿用其 `window.browserAPI` 读写与 `applyTheme`）：
    - `AppearanceView.vue`：主题（Light/Dark/System）。
    - `GeneralView.vue`：默认搜索引擎、新标签页 URL、默认缩放。
    - `SettingsDownloadsView.vue`：下载路径（设置项，区别于下方独立 `/downloads` 列表页）。
    - `AboutView.vue`：检查更新 + 状态。
  - 删除原 `SettingsView.vue`。
- **历史/书签/下载列表**：直接复用已有 `HistoryView.vue` / `BookmarkView.vue` / `DownloadsView.vue`（页面态、无需包裹）。
- **代理**：新增 `views/ProxyPage.vue` 包裹 `<ProxyPanel />`（满高、可滚动），作为独立页。
- **主题变量迁移**：将 `ChromeUI.vue` 内 `:root`/`[data-theme]` CSS 变量块迁入 `apps/renderer/src/style.css`（全局），使 `/` 与所有内部路由共享配色。

### 4. 主进程 `wmfx://` 通用重写
  - 新增 `apps/main/src/internal-url.ts`（承载 `loadInternalView` 等加载逻辑）：
  ```ts
  import { getRendererDevServerUrl, getRendererIndexHtml } from './paths'
  import type { WebContentsView } from 'electron'
  import { WMFX_SCHEME, isWmfxUrl, wmfxPath, wmfxFromActualUrl } from '@browser/shared'

  /** 将内部地址加载到 WebContentsView，兼容 dev 与打包模式。
   *  - dev：dev server 地址可能带尾斜杠，先去掉再拼，避免 `//#/x` 双斜杠。
   *  - prod：loadFile 的 hash 必须带前导 `/`（`/#/x`），否则 vue-router hash 模式解析不到子路由。 */
  export function loadInternalView(view: WebContentsView, path: string): void {
    const dev = getRendererDevServerUrl()
    if (dev) {
      const base = dev.replace(/\/+$/, '')
      void view.webContents.loadURL(`${base}/#/${path}`)
    } else {
      void view.webContents.loadFile(getRendererIndexHtml(), { hash: `/${path}` })
    }
  }
  ```
  > `WMFX_SCHEME` / `isWmfxUrl` / `wmfxPath` / `wmfxFromActualUrl` / `INTERNAL_ROUTE_PREFIXES` 统一放在 `@browser/shared`（见 `packages/shared/src/url.ts`），主进程与渲染进程两侧从 shared 引入，**不再各写一份**，避免不一致与循环依赖。
- `tab-manager.ts` `create()`：
  - 先判 `isWmfxUrl(opts.url)` 得 `wantInternal`；`tab.view = spawnView(tab, wantInternal)`（见下），`tab.isInternal = wantInternal`（`Tab` 接口新增 `isInternal: boolean` 字段，初值 false）、`tab.state.isPinned = wantInternal`、`tab.state.url = opts.url ?? ''`、`tab.state.title = opts.title ?? (opts.url ? internalTitleFromPath(wmfxPath(opts.url)) : '')`。
  - 加载：若 `wantInternal` → `loadInternalView(view, wmfxPath(opts.url))`；否则若 `opts.url` → `view.webContents.loadURL(opts.url)`。（原 `if (opts?.url) view.webContents.loadURL(opts.url)` 通用分支已被此「按 internal 决策」吸收，不会再出现把 `wmfx://newtab` 当未知协议直 `loadURL` 失败的情况。）
  - `restoreTabs()` 无标签时改调 `createNewTab()`。
  - `spawnView(tab, wantInternal): WebContentsView`（私有）：以 `webPreferences: { preload: wantInternal ? getPreloadPath() : undefined, session }` 创建 view，`setupTabListeners(tab)`、`contentView.addChildView`、`tabBounds` 存在则 `applyBounds(tab)`，返回 view（**不负责加载**）。`create()` 与 `relaunchView()` 共用，避免 preload 决策逻辑重复。
  - `relaunchView(tabId, url): { view, didRelaunch }`（私有）：`const tab = tabs.get(tabId)`；`const wantInternal = isWmfxUrl(url)`；**若 `tab.isInternal === wantInternal` 直接返回 `{ view: tab.view, didRelaunch: false }`（已一致：防 `did-navigate` 递归、也避免重复加载）**；否则**销毁旧 view**（`removeChildView` + `webContents.close()`）后 `tab.view = spawnView(tab, wantInternal)`、`tab.isInternal = wantInternal`、`tab.state.isPinned = wantInternal`，并按 `wantInternal` 加载 `url`（`loadInternalView` 或 `webContents.loadURL`），返回 `{ view: tab.view, didRelaunch: true }`。即「内外部切换 = 销毁旧 view + 按 internal 决策 spawn 新 view」，比原地改 preload 简单且无失效引用问题。
- `did-navigate` / `did-navigate-in-page` 监听器（统一处理）：
  - `const actual = wc.getURL()`（**在销毁旧 view 前先取出**，供 `relaunchView` 使用）。
  - `const wmfx = wmfxFromActualUrl(actual)`。
  - 非空（仍在内部路由）：`tab.state.url = wmfx`；**不**写历史；保持 `isInternal=true`。
  - 为空（跳到外部站点）：**`const { didRelaunch } = relaunchView(tab.id, actual)`**；`tab.state.url = actual`；**仅当 `!didRelaunch` 时写历史**（边界那次重建由新 view 的第二次 `did-navigate` 完成记录，避免重复写历史）。
- `checkSuspendTabs()`：内部标签已 `isPinned` 自然跳过（**故 `resumeTab` 直加载 `wmfx://` 原始 URL 的路径不会被触发**；若将来取消 pinned，必须由 `loadInternalView` 接管，否则 `resumeTab` 的 `loadURL(tab.state.url)` 会因未知协议失败）。

### 5. 地址栏兼容 `wmfx://`（可编辑、按钮正常）
- `navigation-manager.ts` `loadURL()`：在原有 `http/https/file/about` 判断前，先 `if (isWmfxUrl(url))` → `const { view, didRelaunch } = tabManager.relaunchView(tabId, url)`；**若 `!didRelaunch`（当前已是内部页，仅切换子路由）** 再 `loadInternalView(view, wmfxPath(url))`，**不**补 `https://`，仅 `setNavigating(tabId, url)` 更新展示地址。
- 地址栏**不再只读**，前进/后退/刷新按钮**正常显示并可用**（与普通网页标签一致）。
- `setWindowOpenHandler`：弹窗目标 `wmfx://` 时 `create({ url })`（防御性，可选）。
- `serializeTabs()`：普通标签与 `wmfx://` 内部标签**一视同仁**，重启后均恢复（内部标签按 `wmfx://...` 重新走内部加载）。

### 6. 打开入口（TabBar 应用菜单 ⋮）
移除 Sidebar 后，五项功能通过 **TabBar 右上角应用菜单（⋮）** 打开：
- `TabBar.vue`：删除 `.sidebar-toggle` 按钮、`toggleSidebar` emit 及 `.sidebar-toggle` 样式；新增 `.app-menu` 按钮（图标如 `carbon:overflow-menu`）。
- 点击切换下拉 `.app-menu-dropdown`，**顺序为**：书签(`wmfx://bookmarks`)、历史(`wmfx://history`)、下载(`wmfx://downloads`)、代理(`wmfx://proxy`)、设置(`wmfx://settings`)。
- 每项点击 → `openInternal(url)`：先 `getList()` 查找 `url.startsWith(wmfxBase)` 的标签，有则激活；否则 `createTab({ url, title })`。

### 7. 整体移除 Sidebar
- 删除 `apps/renderer/src/components/Sidebar.vue`。
- `ChromeUI.vue`：移除 `Sidebar` 引用、`isSidebarOpen`、`toggleSidebar`/`onCloseSidebar`。
- `TabBar.vue`：移除侧边栏切换按钮与 emit（见第 6 点替换为应用菜单）。
- `tab-manager.ts`：删除 `sidebarOpen` 字段、`SIDEBAR_WIDTH` 常量、`setSidebarOpen()`、`applyBounds()` 中的侧边栏宽度裁剪（标签恢复为满窗宽度）。
- IPC 清理：`register.ts` 删除 `tab:setSidebarOpen` handler；`preload.ts` 删除 `setSidebarOpen`；`env.d.ts` 删除对应声明；`channels.ts` 删除 `'tab:setSidebarOpen'`。
- E2E：更新/移除引用 `.sidebar`、`.sidebar-button`、`.sidebar-tab` 的用例（详见测试）。

### 8. NewTab 改为 WebContentsView 内部页
原 `NewTab.vue` 是 ChromeUI 的**叠层组件**（靠 `about:blank` 的空 WebContentsView + Vue 叠层渲染），现改为与普通内部页一致的 **WebContentsView 加载 `#/newtab` 路由**：
- `INTERNAL_ROUTE_PREFIXES` 增加 `/newtab`（`@browser/shared` 已加）。
- `ChromeUI.vue`：删除 `<NewTab v-if=...>` 叠层；`Viewport` 的 `v-if` 由 `activeTab && activeTab.url && activeTab.url !== 'about:blank'` **简化为 `v-if="activeTab"`**（新标签页现在是真实 WebContentsView，不再有 `about:blank` 空壳）。
- `TabBar.vue` 新建标签：`createTab({ url: 'about:blank' })` → 改为 `createNewTab()`（见下 `tab:createNewTab`）；**无痕新建** `createTab({ url: 'https://www.baidu.com', sessionId: 'incognito' })` 同样改为 `createNewTab('incognito')`（无痕也用 newtab 页，`relaunchView` 重建时会沿用 `tab.sessionId` 的 session 保留 incognito）。
- 新增封装 `tab:createNewTab`（`preload` + `ipc-contract` + `register.ts` + `tab-manager.createNewTab`）：
  - `tab-manager.ts` 新增 `createNewTab(sessionId = 'default'): TabState`：
    ```ts
    const url = NEW_TAB_URL // 'wmfx://newtab'，来自 @browser/shared
    return this.create({ url, sessionId })
    ```
    **未来支持「用户自定义新标签页地址」只需改这一处**（例如读 `settingsManager.get('newTabUrl')` 返回则用其替代 `NEW_TAB_URL`，外部地址会自然走普通标签逻辑）。
  - `register.ts`：`handle('tab:createNewTab', (event, sessionId) => inst.tabManager.createNewTab(sessionId))`。
  - `preload.ts` / `env.d.ts` / `channels.ts`：新增 `createNewTab: (sessionId?: string) => Promise<TabState>`。
  - `restoreTabs()` 无标签时默认 `createNewTab()`（替代 `create({ url: 'about:blank' })`）。
  - `TabBar.vue` 两个新建按钮分别调 `window.browserAPI.createNewTab()` / `createNewTab('incognito')`。
  - `tab-manager.ts` `restoreTabs()`：`this.create({ url: 'about:blank' })` → 改为 `createNewTab()`（无标签时默认新标签页）。
- `NewTab.vue`（作为路由组件复用）改造：
  - **移除 `tabId` prop**（路由页不知道自身 tabId）。
  - 移除内联的「设置」Sheet（原 `在新标签页打开链接` 开关），该设置项**迁移到设置页**：在 `GeneralView.vue` 增加「新标签页」分组，绑定同一 `newTabOpenInNewTab` 设置（`getSetting`/`setSetting`）。
  - 「当前标签打开」分支（`openInNewTab === false`）不再调 `loadURL(props.tabId, url)`，改为 `window.browserAPI.loadURLCurrent(url)`（见下新 IPC）。
- 新增 IPC `nav:loadURLCurrent`（preload + `ipc-contract` + `register.ts`）：
  - preload：`loadURLCurrent: (url) => ipcRenderer.invoke('nav:loadURLCurrent', url)`。
  - `register.ts` handler：以 `event.sender`（发起调用的 WebContents）反查所属 tab（`tabManager.getTabIdByWebContents(event.sender)`），再 `navigationManager.loadURL(tabId, url)`。这样路由页无需知道自身 tabId，且复用 `loadURL` 的 wmfx/内外态逻辑（导航到外部站点时自动剥离 preload）。
- `tab-manager.ts` 新增 `getTabIdByWebContents(wc)`：遍历 `tabs` 匹配 `tab.view.webContents === wc` 返回 id（供 `nav:loadURLCurrent` 反查）。

## 数据流

应用菜单点「设置」→ `createTab({url:'wmfx://settings'})` → TabManager 识别 `wmfx://` → 建带 preload 的 WebContentsView → `loadInternalView` 加载 `index.html#/settings`（重定向 `#/settings/appearance`）→ Router 命中嵌套路由 → `SettingsLayout` + `AppearanceView`。展示地址恒为 `wmfx://settings/appearance`。点左侧菜单 → hash 路由切换 → `did-navigate-in-page` 经 `wmfxFromActualUrl` 同步展示地址。地址栏可编辑，输入外部 URL 则标签转为普通页。历史/书签/下载/代理同理，分别对应 `wmfx://history` 等独立路由。

## 边界情况

- **Dev/Prod 兼容**：`loadInternalView` 用 `VITE_DEV_SERVER_URL` 判 dev；prod 用 `loadFile(index,{hash})`。hash 路由对 `file://` 与 dev server 均兼容。
- **展示地址 vs 实际地址**：实际加载 `index.html#/<path>`，展示 `wmfx://<path>`；由 `wmfxFromActualUrl` 映射，子路由切换实时同步。
- **preload 仅挂内部 tab**：普通网页标签仍不挂 preload，`browserAPI` 不会注入任意站点（与现状一致）。
- **内外态切换（含 preload 同步）**：在内部路由内导航保持内部态；跳到外部站点时 `relaunchView(tab.id, actual)` **销毁旧 view + 按 internal 决策 spawn 新 view**（无 preload），外部站点拿不到 `browserAPI`；反向从外部标签输入 `wmfx://` 时 `relaunchView` 同样销毁+重建并注入 preload，确保设置/历史等内部页接口可用。两类转换均通过「销毁重建」同步 preload 有无，任意网页既不会被注入也不会缺失 `browserAPI`。
- **挂起/恢复**：内部标签 `isPinned` 不自动挂起；恢复亦正常（`loadInternalView`）。
- **会话恢复**：`serializeTabs` 不区分内部/外部标签，重启后所有页（含 `wmfx://`）一并恢复。
- **主题同步（可选增强）**：设置页改主题后经 IPC 广播让 ChromeUI 实时刷新；最低保障为持久化 + 下次启动生效。

## 测试

- `bun run build:renderer` 确认单一 `index.html` 产物正常。
- 新增/更新 E2E：
  - 应用菜单打开「设置」，地址栏显示 `wmfx://settings/appearance` 且可编辑、前进/后退/刷新可用。
  - 点设置左侧菜单切到 `/settings/general`，地址栏同步 `wmfx://settings/general`。
  - 应用菜单打开「历史/书签/下载/代理」，分别落到 `wmfx://history` 等并正确渲染。
  - 改主题后关闭重开，设置持久化。
  - 地址栏输入外部 URL 跳转，标签转为普通页（历史正常）。
  - 再次点菜单打开已存在的内部页，被激活而非重复创建。
  - 移除/改写引用 `.sidebar*` 的旧用例（downloads-in-sidebar、sidebar-toggle、proxy-from-sidebar）。
  - dev 与打包两模式下各内部页均可正常加载（手动验证）。

## 文件清单

| 文件 | 改动类型 |
|------|---------|
| `apps/renderer/package.json` | 修改（新增 `vue-router`） |
| `apps/renderer/src/router.ts` | 新增（含嵌套路由 + `INTERNAL_ROUTE_PREFIXES`） |
| `apps/renderer/src/main.ts` | 修改（挂载 router） |
| `apps/renderer/src/App.vue` | 修改（`<router-view/>`，全局样式迁移） |
| `apps/renderer/src/style.css` | 修改（迁入 `:root`/`[data-theme]` 变量） |
| `apps/renderer/src/components/ChromeUI.vue` | 修改（移除 Sidebar 引用/状态） |
| `apps/renderer/src/components/Sidebar.vue` | **删除** |
| `apps/renderer/src/views/SettingsView.vue` | **删除**（拆分为子视图） |
| `apps/renderer/src/views/settings/SettingsLayout.vue` | 新增 |
| `apps/renderer/src/views/settings/AppearanceView.vue` | 新增 |
| `apps/renderer/src/views/settings/GeneralView.vue` | 新增 |
| `apps/renderer/src/views/settings/SettingsDownloadsView.vue` | 新增 |
| `apps/renderer/src/views/settings/AboutView.vue` | 新增 |
| `apps/renderer/src/views/ProxyPage.vue` | 新增（包裹 ProxyPanel） |
| `apps/renderer/src/views/HistoryView.vue` / `BookmarkView.vue` / `DownloadsView.vue` | 复用（不变） |
| `apps/renderer/src/views/NewTab.vue` | 修改（作 `/newtab` 路由组件：去 `tabId` prop、去内联设置 Sheet；同标签打开改用 `loadURLCurrent`） |
| `apps/renderer/src/components/TabBar.vue` | 修改（移除侧栏按钮，新增应用菜单 ⋮；新建标签 url 改 `wmfx://newtab`） |
| `packages/shared/src/url.ts` | 修改（`WMFX_SCHEME`/`isWmfxUrl`/`wmfxPath`/`wmfxFromActualUrl`/`INTERNAL_ROUTE_PREFIXES`/`internalTitleFromPath`/`NEW_TAB_URL`，主/渲染共用） |
| `apps/main/src/internal-url.ts` | 新增（承载 `loadInternalView` 等加载逻辑，常量/标题引自 shared） |
| `apps/main/src/tab-manager.ts` | 修改（识别内部 URL、`spawnView`/`relaunchView` 销毁+重建同步 preload、`getTabIdByWebContents`、navigate/历史/内外态切换；`create`/`createNewTab`/`restoreTabs` 走统一 internal 决策；`Tab` 接口新增 `isInternal`；移除侧栏宽度逻辑） |
| `apps/main/src/navigation-manager.ts` | 修改（`loadURL` 兼容 `wmfx://`） |
| `apps/main/src/ipc/register.ts` | 修改（删除 `tab:setSidebarOpen`；新增 `nav:loadURLCurrent`/`tab:createNewTab`） |
| `apps/main/src/preload.ts` | 修改（删除 `setSidebarOpen`；新增 `loadURLCurrent`/`createNewTab`） |
| `apps/renderer/src/env.d.ts` | 修改（删除 `setSidebarOpen` 声明；新增 `loadURLCurrent`/`createNewTab` 声明） |
| `packages/ipc-contract/src/channels.ts` | 修改（删除 `tab:setSidebarOpen`；新增 `nav:loadURLCurrent`/`tab:createNewTab`） |
| `e2e/app.spec.ts` | 修改（移除/改写 `.sidebar*` 用例；更新 new-tab 相关用例） |
