# 实现计划：独立设置/功能页迁移（Vue Router + wmfx:// 内部协议）

日期：2026-07-14
状态：待确认后实现
设计文档：`docs/superpowers/specs/2026-07-14-settings-page-tab-design.md`（已批准，rev v3）
工作方式：小步提交（每完成一个分组即 commit），改动后跑 `bun run lint` + 相关类型检查。

## 核心架构（务必先理解）

- 每个标签页 = 一个 `WebContentsView`（`tab-manager.ts`）。主窗口（`BrowserWindow`）渲染 ChromeUI **外壳**（TabBar + AddressBar + Viewport），各标签的 WebContentsView 作为 native 子视图挂到 `window.contentView`。
- 渲染进程是**单一 SPA 产物**，按路由区分两种身份：
  - 路由 `/`（无 hash）→ 渲染 **ChromeUI 外壳**（主窗口自身加载此产物）。
  - 路由 `/settings`、`/history`、`/bookmarks`、`/downloads`、`/proxy`、`/newtab` → 渲染对应的**内部页**（作为某标签的 WebContentsView 加载，不渲染外壳）。
- 内部标签：其 WebContentsView 加载的是**同一个 SPA 产物**，只是 hash 指向内部路由（`#/settings`）。因此内部页天然有 `window.browserAPI`（需 preload）。外部标签加载真实网址，无 preload。
- 地址栏展示 `wmfx://<path>`，但实际加载地址是 `file://.../index.html#/<path>`（prod）或 `http://localhost:xxxx/#/<path>`（dev）。主进程在 `did-navigate`/`did-navigate-in-page` 用 `wmfxFromActualUrl` 反向映射回 `wmfx://` 写入 `tab.state.url`，渲染侧据此展示并可编辑。

## 文件结构映射

| 现有文件 | 动作 | 说明 |
|---|---|---|
| `apps/renderer/src/router.ts` | 新增 | vue-router（hash 模式）+ 内部路由表 |
| `apps/renderer/src/main.ts` | 改 | `app.use(router)` |
| `apps/renderer/src/App.vue` | 改 | `<router-view/>` 按路由渲染 外壳/内部页；迁移主题 CSS 变量 |
| `apps/renderer/src/style.css` | 改 | 迁入 `:root` / `[data-theme]` 变量（来自 ChromeUI.vue） |
| `apps/renderer/src/components/ChromeUI.vue` | 改 | 去 Sidebar / NewTab 叠层；Viewport `v-if="activeTab"` |
| `apps/renderer/src/components/Sidebar.vue` | 删除 | 整体移除 |
| `apps/renderer/src/components/TabBar.vue` | 改 | 去侧栏按钮/prop；加应用菜单（⋮）；新建改 `createNewTab()` |
| `apps/renderer/src/views/NewTab.vue` | 改 | 去 `tabId` prop 与内联设置 Sheet；同标签打开改 `loadURLCurrent` |
| `apps/renderer/src/views/settings/*` | 新增 | 拆自 `SettingsView.vue` |
| `apps/renderer/src/views/ProxyPage.vue` | 新增 | 包裹 `ProxyPanel.vue` 作为 `/proxy` 路由 |
| `apps/main/src/internal-url.ts` | 新增 | `loadInternalView()` 等，常量引自 `@browser/shared` |
| `apps/main/src/tab-manager.ts` | 改 | `spawnView`/`relaunchView`、internal 决策、`isInternal`、删侧栏、getTabIdByWebContents |
| `apps/main/src/navigation-manager.ts` | 改 | `loadURL` 兼容 wmfx（relaunchView） |
| `apps/main/src/ipc/register.ts` | 改 | 删 `tab:setSidebarOpen`；加 `tab:createNewTab` / `nav:loadURLCurrent` |
| `apps/main/src/preload.ts` | 改 | 删 `setSidebarOpen`；加 `createNewTab` / `loadURLCurrent` |
| `packages/ipc-contract/src/channels.ts` | 改 | 删 `tab:setSidebarOpen`；加 `tab:createNewTab` / `nav:loadURLCurrent` |
| `apps/renderer/src/env.d.ts` | 改 | 同步上面三处 |
| E2E `app.spec.ts` | 改 | 移除 `.sidebar*` 用例、更新 new-tab / 内部页用例 |

`packages/shared/src/url.ts` 常量**已就位**，勿重复添加。

---

## 任务分组（按依赖顺序，每组结束即 commit）

### 分组 A：IPC 契约与类型（最底层）
1. `channels.ts`：
   - 从 `IpcContract`、`IPC_CHANNELS`、`isIpcChannel` 中**删除** `'tab:setSidebarOpen'`。
   - 新增 `'tab:createNewTab': (sessionId?: string) => TabState`。
   - 新增 `'nav:loadURLCurrent': (url: string) => void`。
2. `env.d.ts`：删除 `setSidebarOpen`；新增 `createNewTab: (sessionId?: string) => Promise<TabState>` 与 `loadURLCurrent: (url: string) => Promise<void>`（类型对齐 IpcInvoke）。
3. `preload.ts`：删除 `setSidebarOpen` 声明与实现；新增 `createNewTab: (sessionId) => ipcRenderer.invoke('tab:createNewTab', sessionId)`、`loadURLCurrent: (url) => ipcRenderer.invoke('nav:loadURLCurrent', url)`。
4. 验证：`bun run --filter @browser/ipc-contract typecheck`（或 `bun run lint:typecheck`）。

### 分组 B：主进程 internal-url + tab-manager 核心
5. 新增 `apps/main/src/internal-url.ts`：
   ```ts
   import { getRendererDevServerUrl, getRendererIndexHtml } from './paths'
   import { WMFX_SCHEME, wmfxPath, isWmfxUrl } from '@browser/shared'
   import type { WebContentsView } from 'electron'

   export { WMFX_SCHEME, isWmfxUrl, wmfxPath }

   export function loadInternalView(view: WebContentsView, path: string): void {
     const dev = getRendererDevServerUrl()
     if (dev) {
       view.webContents.loadURL(`${dev.replace(/\/+$/, '')}/#/${path}`)
     } else {
       view.webContents.loadFile(getRendererIndexHtml(), { hash: '/' + path })
     }
   }
   ```
6. `tab-manager.ts`：
   - `Tab` 接口新增 `isInternal: boolean`（初值 false）。
   - 抽出 `spawnView(tab, wantInternal)`：创建 `WebContentsView`（`session: this.getSession(sessionId)`；internal 时 `webPreferences.preload = getPreloadPath()`、并设置 `isPinned`；external 时按现有无 preload）。调用 `setupTabListeners`、`applyBounds`。
   - `relaunchView(tabId, url): { view, didRelaunch }`：
     - 算 `wantInternal = isWmfxUrl(url)`；
     - 若 `tab.isInternal === wantInternal` → 返回 `{ view: tab.view, didRelaunch: false }`（防递归/重复加载）；
     - 否则销毁旧 view（`removeChildView`+`close`），用 `spawnView(tab, wantInternal)` 重建、更新 `tab.isInternal`、加载 url、返回 `{ view, didRelaunch: true }`。
   - `create(opts)`：
     - 算 `wantInternal = isWmfxUrl(opts?.url ?? '')`；用 `spawnView` 建 view；`tab.isInternal = wantInternal`；`tab.state.url = opts.url ?? ''`；internal 时 `tab.state.title = internalTitleFromPath(wmfxPath(url))`；
     - 有 url 时：internal → `loadInternalView(view, wmfxPath(url))`；external → `view.webContents.loadURL(url)`。
   - 删除 `SIDEBAR_WIDTH`、`sidebarOpen` 字段、`setSidebarOpen()`；`applyBounds` 去掉侧栏裁剪（直接 `setBounds(bounds)`）。
   - `serializeTabs` 不变（存 `wmfx://...`，恢复时按 internal 决策自动分类）。
   - `restoreTabs`：空列表改 `this.createNewTab()` 取代 `create({ url: 'about:blank' })`。
   - 新增 `createNewTab(sessionId = 'default'): TabState` → `this.create({ url: NEW_TAB_URL, sessionId, activate: true })`（import `NEW_TAB_URL`）。
   - 新增 `getTabIdByWebContents(wc: Electron.WebContents): string | null` → 遍历 `tabs` 比对 `tab.view.webContents === wc`。
   - `resumeTab` 用 `spawnView` 重建（保留 internal 态），删除内联建 view 逻辑。
7. `navigation-manager.ts`：
   - `loadURL(tabId, url)`：若 `isWmfxUrl(url)` 或当前 tab 是 internal，调用 `tabManager.relaunchView(tabId, url)`（若 `didRelaunch` 则已加载；否则沿用旧逻辑 `webContents.loadURL(url)`）；external 普通路径保持原 normalize + `setNavigating` + `loadURL`。
   - **注意**：`loadURLCurrent`（同标签打开）在 register 里调到 navigationManager 时直接用 `loadURL`。
8. `register.ts`：
   - 删除 `tab:setSidebarOpen` handler 与 `IPC`/注释。
   - 新增 `handle('tab:createNewTab', (event, sessionId) => { ... return inst.tabManager.createNewTab(sessionId) })`。
   - 新增 `handle('nav:loadURLCurrent', (event, url) => { const id = inst.tabManager.getTabIdByWebContents(event.sender); if (id) inst.navigationManager.loadURL(id, url) })`。
9. tabs 的 `did-navigate` 监听：external 分支仅在 `!didRelaunch` 写历史（`setupTabListeners` 内 `relaunchView` 返回值需传入；通过把 relaunch 决策放到 navigation-manager 调用点，did-navigate 里读 `tab` 的标记位判断）。简化做法：`did-navigate` 里 `if (!tab.__relaunchedThisNav) addHistory`；在 relaunch 后设 `tab.__relaunchedThisNav = true` 并在下一帧清掉。
   - 提交 B 后 `bun run lint:typecheck`。

### 分组 C：渲染进程路由 + 外壳改造
10. `apps/renderer` 加依赖：`bun add vue-router`。
11. 新增 `router.ts`：`createWebHashHistory()`，路由：
    - `/` → `ChromeUI`
    - `/settings` → `SettingsLayout`（children: `appearance`→AppearanceView, `general`→GeneralView, `downloads`→SettingsDownloadsView, `about`→AboutView；默认 redirect `/settings/appearance`）
    - `/history` → `HistoryView`
    - `/bookmarks` → `BookmarkView`
    - `/downloads` → `DownloadsView`
    - `/proxy` → `ProxyPage`
    - `/newtab` → `NewTab`
12. `main.ts`：`app.use(router)`。
13. `App.vue`：`<router-view v-slot="{ Component }"><component :is="Component" /></router-view>`；**删除** 主题 `:root`/`[data-theme]` 块（迁入 style.css）。保留 `* { margin... }` 等基础样式。
14. `style.css`：追加原 `ChromeUI.vue` 的 `:root` 与 `[data-theme="light"]` 变量（dark 仍由 nativeTheme + 现有 `.dark` 处理；保留两套不冲突）。
15. `ChromeUI.vue`：
    - 模板：删 `<Sidebar>`、删 `<NewTab>` 叠层；`<Viewport :v-if="activeTab">`（去掉 `&& url !== about:blank`）；`<AddressBar v-if="activeTab">` 保留。
    - 脚本：删 `isSidebarOpen` / `toggleSidebar` / `onCloseSidebar` / `window.browserAPI.setSidebarOpen`。删 `import Sidebar`。
16. 删除 `Sidebar.vue`。
17. 提交 C 后 `bun run lint:vue`（eslint）+ `bun run lint:typecheck`。

### 分组 D：TabBar + 应用菜单（⋮）
18. `TabBar.vue`：
    - 删 `sidebar-toggle` 按钮与 `SIDEBAR_BTN_WIDTH` 在 `tabWidth` 计算中的扣除；删 `defineProps isSidebarOpen`、`emit toggleSidebar`、`toggleSidebar()`、`createTab` 改调 `window.browserAPI.createNewTab()`、`createIncognitoTab` 改 `window.browserAPI.createNewTab('incognito')`（去掉固定 baidu url，无痕也用 newtab 页）。
    - 新增应用菜单（⋮）按钮 + 下拉：书签→历史→下载→代理→设置，每项调用 `openInternal('/bookmarks')` 等（函数：若已有该 url 标签则 `activateTab`，否则 `createNewTab()` 后 `loadURLCurrent`）。
    - 保留 `createTab` 作为普通新建（仍走 `createNewTab()`）。
19. 提交 D。

### 分组 E：NewTab / Settings / ProxyPage 组件拆分
20. `NewTab.vue`：去 `props.tabId`、删设置 Sheet 与 `openInNewTab` 内联开关、删相关 import（Sheet* / Switch）；`openLink` 同标签打开改 `window.browserAPI.loadURLCurrent(url)`；`createTab` 分支改 `window.browserAPI.createNewTab()`。保留 quickLinks / recentHistory 逻辑。
21. `views/settings/`：拆 `SettingsView.vue` → `SettingsLayout.vue`（侧栏导航 + `<router-view/>`）+ `AppearanceView/GeneralView/SettingsDownloadsView/AboutView.vue`。原 `openInNewTab` 开关迁到 `GeneralView`，绑定 `newTabOpenInNewTab`（读/写 `settings:get/set`）。`SettingsView.vue` 可删除或保留供参考（建议删除）。
22. 新增 `views/ProxyPage.vue`：包裹 `ProxyPanel.vue`（加 `.internal-page` 容器样式）。
23. 提交 E 后 `bun run lint:vue`。

### 分组 F：E2E 与收尾
24. `e2e/app.spec.ts`：删除 `.sidebar*` / 侧栏相关断言；新增/更新：打开 `wmfx://newtab` 标签、地址栏显示 `wmfx://`、应用菜单打开内部页、内部页切换保持 internal、地址栏输入外部网址转为普通标签、前进/后退在内部页可用。
25. `bun run lint` 全量 + 本地启动 `bun run dev` 冒烟（手测内部页路由、新建标签、菜单打开）。
26. 提交 F。

---

## 关键风险与守卫（来自设计 review）
- `relaunchView` 守卫 `tab.isInternal === wantInternal` 直接返回 `didRelaunch:false`，避免 `did-navigate` 递归与重复加载。
- `did-navigate` 写历史仅在 `!didRelaunch` 时，避免 relaunch 触发重复历史。
- internal 标签必须挂 preload（否则 `window.browserAPI` 未定义）；spawnView 中按 wantInternal 决定 preload。
- 主题实时同步为可选增强（本计划不含，留待后续）。
- 会话恢复不区分内外（存 `wmfx://...`），恢复时由 `isWmfxUrl` 自动分类。

## 验证清单
- [ ] `bun run lint` 全绿
- [ ] 新建标签 → `wmfx://newtab` 页正常
- [ ] TabBar ⋮ 菜单 5 项可打开/聚焦对应内部页
- [ ] 地址栏编辑 `wmfx://settings/appearance` 回车 → 跳转到对应内部页
- [ ] 地址栏输入 `example.com` → 转为普通标签并加载外部站
- [ ] 内部页前进/后退/刷新可用
- [ ] 无侧栏残留（旧 Sidebar 逻辑全删）
- [ ] 会话恢复后内部标签仍以 `wmfx://` 显示
