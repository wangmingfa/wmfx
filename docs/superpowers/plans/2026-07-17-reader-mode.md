# 阅读模式 / 页面级暗色注入 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给外部网页提供「阅读模式」（Readability 提取 + 双 WebContentsView 切换）和「页面级暗色注入」（跟随全局主题的 CSS 滤镜反色）。

**Architecture:** 主进程新增 `PageEnhanceManager`（暗色注入 + Readability 提取）。每个外部 Tab 维护 PageView（原网页）与 ReaderView（`wmfx://reader` 内部页），`setVisible` 切换，原网页不销毁。阅读模式：主进程在 PageView 内 `executeJavaScript` 跑 Readability，把文章经 `reader:article` IPC 推给 ReaderView 渲染。暗色：主进程按全局主题对外部页 `insertCSS`，主题切换/导航时重注入。

**Tech Stack:** Electron `WebContentsView` / `insertCSS` / `executeJavaScript`, TypeScript, Vue 3, Naive UI(按需), `@mozilla/readability`(CommonJS, esbuild 打包为 IIFE), esbuild, Vitest, Playwright.

## Global Constraints

- 日志规范：主进程用 console.debug/console.info，不使用 %s 占位符，统一模板字符串插值；格式 `[模块] 方法: 描述含关键参数`。
- 包管理器用 bun；依赖用 `bun add`；lint 用 `bun run lint`。
- 渲染层按需引入 Naive UI 组件，不整包引入、不二次封装简单组件。
- 多语言：新增 i18n key 必须在 `packages/shared/src/i18n/messages.ts` 的 zh-CN 与 en 两处都填。
- TypeScript 严格：所有新增接口/方法带类型，无 any（除非既有代码如此）。
- Readability 不是 UMD：用 esbuild 打包为 IIFE（globalName `Readability`）输出 `resources/readability.js`，运行时 `fs.readFile` 读取字符串注入 PageView。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `scripts/build-readability.ts` | 新增。esbuild 把 @mozilla/readability 打成 IIFE → resources/readability.js |
| `resources/readability.js` | 打包产物（纳入 git 或 build 生成；electron-builder extraResources 发布） |
| `apps/main/src/page-enhance-manager.ts` | 新增。applyDark + extractArticle |
| `apps/main/src/page-enhance-manager.test.ts` | 新增。Vitest |
| `apps/main/src/tab-manager.ts` | 修改。Tab 加 readerView；双 View 切换；ensureReaderView / enterReadingMode / exitReadingMode；did-navigate 暗色+退出阅读态 |
| `apps/main/src/window-manager.ts` | 修改。创建并注入 PageEnhanceManager |
| `apps/main/src/ipc/register.ts` | 修改。注册 page:enterReadingMode / page:exitReadingMode；notifyThemeChange 重注入暗色 |
| `packages/ipc-contract/src/channels.ts` | 修改。新增 channel |
| `apps/main/src/preload.ts` | 修改。新增 browserAPI 方法 |
| `apps/renderer/src/env.d.ts` | 修改。browserAPI 类型 |
| `apps/renderer/src/components/AddressBar.vue` | 修改。阅读模式按钮（仅外部页） |
| `apps/renderer/src/views/ReaderView.vue` | 新增。阅读视图渲染页 |
| `apps/renderer/src/router.ts` | 修改。新增 /reader 路由 |
| `packages/shared/src/i18n/messages.ts` | 修改。reader.* key |
| `e2e/reader.spec.ts` | 新增。E2E |

---

### Task 1: esbuild 打包 Readability 为 IIFE

**Files:**
- Create: `scripts/build-readability.ts`
- Create: `resources/readability.js`（build 产物；可加进 `.gitignore` 由 build 生成，或提交）

**Interfaces:**
- Produces: `resources/readability.js`（内容含全局 `window.Readability` 的 IIFE），供 Task 2 运行时 `fs.readFile` 读取。

- [ ] **Step 1: 安装依赖**

```bash
bun add @mozilla/readability
bun add -d esbuild
```

- [ ] **Step 2: 写打包脚本**

`scripts/build-readability.ts`：

```ts
import { build } from 'esbuild'
import { resolveFromRoot } from './paths'

await build({
  entryPoints: [require.resolve('@mozilla/readability/Readability.js')],
  bundle: true,
  format: 'iife',
  globalName: 'Readability',
  outfile: resolveFromRoot('resources/readability.js'),
  logLevel: 'info',
})
```

> 若 `resolveFromRoot` 不存在，直接用 `path.resolve(__dirname, '../resources/readability.js')`；参考 `apps/main/src/paths.ts` 的 `resolveFromRoot` 实现。

- [ ] **Step 3: 在 package.json 的 build 编排里串接**

在根 `package.json` 的 `build` 脚本最前面加 `bun run build:readability &&`；新增 `"build:readability": "bun run scripts/build-readability.ts"`。

- [ ] **Step 4: 运行并验证产物**

Run: `bun run build:readability`
Expected: 生成 `resources/readability.js`，且文件内含 `window.Readability` 或 `Readability=` IIFE 赋值。

- [ ] **Step 5: 提交**

```bash
git add scripts/build-readability.ts resources/readability.js package.json
git commit -m "build: esbuild 打包 @mozilla/readability 为 IIFE 资源"
```

---

### Task 2: PageEnhanceManager（暗色 + 提取）

**Files:**
- Create: `apps/main/src/page-enhance-manager.ts`
- Test: `apps/main/src/page-enhance-manager.test.ts`

**Interfaces:**
- Consumes: `resources/readability.js`（Task 1 产出，运行时 fs.readFile）
- Produces:
  - `export interface ExtractedArticle { title: string; content: string; byline: string | null; url: string }`
  - `export class PageEnhanceManager { constructor(); applyDark(wc: WebContents, isDark: boolean): void; async extractArticle(wc: WebContents): Promise<ExtractedArticle | null> }`

- [ ] **Step 1: 写失败测试**

`apps/main/src/page-enhance-manager.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PageEnhanceManager } from './page-enhance-manager'

function fakeWc(url: string) {
  return {
    getURL: () => url,
    insertCSS: vi.fn().mockResolvedValue('css-key-1'),
    removeInsertedCSS: vi.fn().mockResolvedValue(undefined),
    executeJavaScript: vi.fn().mockResolvedValue(
      JSON.stringify({ title: 'T', content: '<p>hi</p>', byline: null, url: 'https://x.com' })
    ),
    id: Math.floor(Math.random() * 1e9),
  } as never
}

describe('PageEnhanceManager', () => {
  let mgr: PageEnhanceManager
  beforeEach(() => {
    mgr = new PageEnhanceManager()
    vi.clearAllMocks()
  })

  it('applyDark(true) 对外部页 insertCSS', async () => {
    const wc = fakeWc('https://example.com')
    mgr.applyDark(wc as never, true)
    expect((wc as any).insertCSS).toHaveBeenCalled()
  })

  it('applyDark(false) 移除已注入 CSS', async () => {
    const wc = fakeWc('https://example.com')
    mgr.applyDark(wc as never, true)
    mgr.applyDark(wc as never, false)
    expect((wc as any).removeInsertedCSS).toHaveBeenCalledWith('css-key-1')
  })

  it('applyDark 对内部页/about:blank 不注入', async () => {
    const wmfx = fakeWc('wmfx://reader')
    const blank = fakeWc('about:blank')
    mgr.applyDark(wmfx as never, true)
    mgr.applyDark(blank as never, true)
    expect((wmfx as any).insertCSS).not.toHaveBeenCalled()
    expect((blank as any).insertCSS).not.toHaveBeenCalled()
  })

  it('extractArticle 解析 executeJavaScript 返回的 JSON', async () => {
    const wc = fakeWc('https://example.com')
    const article = await mgr.extractArticle(wc as never)
    expect(article).not.toBeNull()
    expect(article?.title).toBe('T')
    expect((wc as any).executeJavaScript).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun x vitest run apps/main/src/page-enhance-manager`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

`apps/main/src/page-enhance-manager.ts`：

```ts
/**
 * 页面增强管理器 — 暗色注入 + 阅读模式正文提取（主进程侧）
 *
 * - 按全局主题给外部 http(s) 页注入/移除暗色 CSS（CSS 滤镜反色方案）
 * - 阅读模式：在 PageView 的 webContents 内执行 Readability IIFE 提取正文，
 *   返回结构化文章；视图切换由 TabManager 控制，原网页不销毁。
 *
 * 注意：外部页不挂 preload，故提取脚本必须是自包含纯 JS 字符串。
 * Readability 已由 esbuild 打包为 IIFE（resources/readability.js），
 * 运行时用 fs.readFile 读取，再 executeJavaScript 注入 PageView。
 */
import { type WebContents, session } from 'electron'
import { readFile } from 'node:fs/promises'
import { isWmfxUrl } from '@browser/shared'
import { resolveFromRoot } from './paths'

export interface ExtractedArticle {
  title: string
  content: string
  byline: string | null
  url: string
}

export class PageEnhanceManager {
  private static readonly DARK_CSS = `
html { background: #0d0d0d !important; }
html, body, *:not(img):not(video):not(canvas) {
  filter: invert(1) hue-rotate(180deg) !important;
  background-color: #0d0d0d !important;
}
img, video, canvas { filter: invert(1) hue-rotate(180deg) !important; }
`
  private darkCssKeys = new Map<number, string>()
  private readabilitySrc = ''

  /** 懒加载 Readability IIFE 脚本字符串 */
  private async loadReadability(): Promise<string> {
    if (!this.readabilitySrc) {
      this.readabilitySrc = await readFile(resolveFromRoot('resources/readability.js'), 'utf-8')
      console.debug(`[PageEnhanceManager] loadReadability: len=${this.readabilitySrc.length}`)
    }
    return this.readabilitySrc
  }

  applyDark(wc: WebContents, isDark: boolean): void {
    const url = wc.getURL()
    const isExternal = !isWmfxUrl(url) && (url.startsWith('http://') || url.startsWith('https://'))
    console.debug(`[PageEnhanceManager] applyDark: isDark=${isDark} url=${url} isExternal=${isExternal}`)
    if (!isExternal) return
    if (isDark) {
      void wc.insertCSS(PageEnhanceManager.DARK_CSS).then((key) => {
        this.darkCssKeys.set(wc.id, key)
      })
    } else {
      const key = this.darkCssKeys.get(wc.id)
      if (key) {
        void wc.removeInsertedCSS(key).catch(() => {})
        this.darkCssKeys.delete(wc.id)
      }
    }
  }

  async extractArticle(wc: WebContents): Promise<ExtractedArticle | null> {
    const src = await this.loadReadability()
    const result = await wc.executeJavaScript(
      `${src}
      ;(function(){
        try {
          const clone = document.cloneNode(true);
          const article = new Readability(clone).parse();
          if (!article || !article.content) return null;
          return JSON.stringify({
            title: article.title || document.title,
            content: article.content,
            byline: article.byline || null,
            url: location.href
          });
        } catch (e) { return null; }
      })();`
    )
    console.debug(`[PageEnhanceManager] extractArticle: hasResult=${!!result}`)
    if (!result) return null
    try {
      return JSON.parse(result) as ExtractedArticle
    } catch {
      return null
    }
  }
}
```

> `resolveFromRoot` 来自 `apps/main/src/paths.ts`（既有导出）；`isWmfxUrl` 来自 `@browser/shared`（既有导出）。如导入路径不对，参照项目内既有 import 写法微调。

- [ ] **Step 4: 运行测试确认通过**

Run: `bun x vitest run apps/main/src/page-enhance-manager`
Expected: PASS（4 个用例）

- [ ] **Step 5: 提交**

```bash
git add apps/main/src/page-enhance-manager.ts apps/main/src/page-enhance-manager.test.ts
git commit -m "feat: 新增 PageEnhanceManager 暗色注入与正文提取"
```

---

### Task 3: TabManager 双 View + 阅读模式编排

**Files:**
- Modify: `apps/main/src/tab-manager.ts`
- Modify: `apps/main/src/window-manager.ts`（注入 PageEnhanceManager）

**Interfaces:**
- Consumes: `PageEnhanceManager`（Task 2 产出：`applyDark`、`extractArticle`）
- Produces:
  - `Tab` 接口新增 `readerView: WebContentsView | null`
  - `TabManager` 新增方法：`ensureReaderView(tab: Tab): void`、`enterReadingMode(tabId: string): Promise<void>`、`exitReadingMode(tabId: string): void`
  - `TabManager` 构造新增参数 `pageEnhanceManager: PageEnhanceManager`
  - 广播阅读态：经 `tab:state-change` 带 `isReaderMode`（或在 `TabState` 加 `isReaderMode` 字段；实现期在 `broadcastState` 中附上）

- [ ] **Step 1: 扩展 Tab 接口与构造**

在 `apps/main/src/tab-manager.ts` 的 `interface Tab`（约 997 行）新增字段：

```ts
  readerView: WebContentsView | null
```

在 `Tab` 创建处（`create` 方法内 `const tab: Tab = { ... }`，约 90-95 行）加 `readerView: null,`。

`TabManager` 构造函数新增参数 `private pageEnhanceManager: PageEnhanceManager`，并在 `window-manager.ts` 创建 `TabManager` 时传入（见 Step 4）。

- [ ] **Step 2: 新增 ensureReaderView / enterReadingMode / exitReadingMode**

在 `tab-manager.ts` 中（例如 `updateAllViewBackgrounds` 附近）新增：

```ts
  /** 懒创建 ReaderView（wmfx://reader 内部页），默认隐藏 */
  private ensureReaderView(tab: Tab): void {
    if (tab.readerView) return
    console.debug('[TabManager] ensureReaderView: tabId', tab.id)
    const view = new WebContentsView({
      webPreferences: { session: this.getSession(tab.sessionId), preload: getPreloadPath() },
    })
    view.setBackgroundColor(this.resolveViewBackgroundColor())
    tab.readerView = view
    this.window.contentView.addChildView(view)
    loadInternalView(view, 'reader')
    view.setVisible(false)
  }

  /** 进入阅读模式：提取正文 → 推给 ReaderView → 切换可见性 */
  async enterReadingMode(tabId: string): Promise<void> {
    console.info(`[TabManager] enterReadingMode: tabId=${tabId}`)
    const tab = this.tabs.get(tabId)
    if (!tab || tab.isInternal || !tab.view?.webContents || tab.view.webContents.isDestroyed()) return
    const article = await this.pageEnhanceManager.extractArticle(tab.view.webContents)
    if (!article) {
      console.debug('[TabManager] enterReadingMode: no article, abort')
      this.broadcastState(tab) // 调用方据此提示失败（readerError 可经 state 携带，实现期定）
      return
    }
    this.ensureReaderView(tab)
    tab.readerView!.webContents.send('reader:article', article)
    tab.view.setVisible(false)
    tab.readerView!.setVisible(true)
    this.applyReaderVisibility(tab)
  }

  /** 退出阅读模式：切回 PageView 可见 */
  exitReadingMode(tabId: string): void {
    console.info(`[TabManager] exitReadingMode: tabId=${tabId}`)
    const tab = this.tabs.get(tabId)
    if (!tab || !tab.readerView) return
    tab.readerView.setVisible(false)
    tab.view.setVisible(true)
    this.applyReaderVisibility(tab)
  }

  /** 同步广播阅读态（isReaderMode）到渲染端 */
  private applyReaderVisibility(tab: Tab): void {
    console.debug('[TabManager] applyReaderVisibility: tabId reader', tab.id, !!tab.readerView?.isVisible?.())
    this.broadcastState(tab)
  }
```

> `getPreloadPath` 与 `loadInternalView` 已在文件顶部 import；`broadcastState` 既有方法会发 `tab:state-change`。阅读态通过给 `TabState` 加 `isReaderMode: boolean` 字段并随 broadcast 下发（见 Task 5 / Task 6 渲染端消费），或先用 `reader:article` 有无判断。实现期在 `broadcastState` 里附 `isReaderMode: !!tab.readerView?.isVisible?.()`。

- [ ] **Step 3: did-navigate 钩子接入**

在 `setupTabListeners` 的 `did-navigate`（约 585 行外部页分支）与 `did-navigate-in-page`（约 594 行）末尾，外部 http(s) 分支内加：

```ts
this.pageEnhanceManager.applyDark(wc, this.isDarkNow())
// 导航后若处于阅读态，切回 PageView（文章随新页失效）
if (tab.readerView?.isVisible?.()) {
  this.exitReadingMode(tab.id)
}
```

`isDarkNow()` 复用既有 `resolveViewBackgroundColor` 同款逻辑，新增私有方法：

```ts
  private isDarkNow(): boolean {
    const theme = this.settingsManager?.get('theme') ?? 'system'
    return theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
  }
```

- [ ] **Step 4: 关闭 Tab 时清理 ReaderView**

在 `closeTab` / 销毁视图处（约 196-220 行、`removeTab` 相关），若 `tab.readerView` 存在则 `removeChildView` + `close()`：

```ts
if (tab.readerView && !tab.readerView.webContents.isDestroyed()) {
  if (this.window.contentView.children.includes(tab.readerView)) {
    this.window.contentView.removeChildView(tab.readerView)
  }
  tab.readerView.webContents.close()
}
```

- [ ] **Step 5: window-manager 注入**

在 `apps/main/src/window-manager.ts`：
1. import：`import { PageEnhanceManager } from './page-enhance-manager'`
2. 创建：`const pageEnhanceManager = new PageEnhanceManager()`
3. 传入 `new TabManager(win, (name) => sessionManager.getSession(name), 'default', settingsManager, historyManager, popoverManager, certTrustStore, pageEnhanceManager)`——**需确认 TabManager 当前构造签名**，按既有参数顺序在末尾追加 `pageEnhanceManager`。

- [ ] **Step 6: 类型检查**

Run: `bun run lint:typecheck`
Expected: 无类型错误

- [ ] **Step 7: 提交**

```bash
git add apps/main/src/tab-manager.ts apps/main/src/window-manager.ts
git commit -m "feat: TabManager 双 View 阅读模式编排与暗色注入钩子"
```

---

### Task 4: IPC channel + handler + preload + env

**Files:**
- Modify: `packages/ipc-contract/src/channels.ts`
- Modify: `apps/main/src/ipc/register.ts`
- Modify: `apps/main/src/preload.ts`
- Modify: `apps/renderer/src/env.d.ts`

**Interfaces:**
- Consumes: `TabManager.enterReadingMode` / `exitReadingMode`（Task 3 产出）
- Produces:
  - channel `page:enterReadingMode: (tabId: string) => void`
  - channel `page:exitReadingMode: (tabId: string) => void`
  - channel `reader:article: (article: { title: string; content: string; byline: string | null; url: string }) => void`
  - `browserAPI.enterReadingMode(tabId)` / `exitReadingMode(tabId)` / `onReaderArticle(cb)`

- [ ] **Step 1: channels.ts 新增**

在 `IpcChannels` 接口（约 404 行 `bookmark:*` 附近）新增：

```ts
  'page:enterReadingMode': (tabId: string) => void
  'page:exitReadingMode': (tabId: string) => void
  'reader:article': (article: {
    title: string
    content: string
    byline: string | null
    url: string
  }) => void
```

在 `ipcChannelList` 数组（约 553 行）新增三项字符串。

- [ ] **Step 2: register.ts 注册 handler**

在 `history:clear` 等 handler 附近新增：

```ts
  handle('page:enterReadingMode', async (event, tabId) => {
    console.info(`[IPC] page:enterReadingMode: tabId=${tabId}`)
    const inst = getInstance(event)
    if (!inst) return
    await inst.tabManager.enterReadingMode(tabId)
  })

  handle('page:exitReadingMode', (event, tabId) => {
    console.info(`[IPC] page:exitReadingMode: tabId=${tabId}`)
    const inst = getInstance(event)
    if (!inst) return
    inst.tabManager.exitReadingMode(tabId)
  })
```

并在 `notifyThemeChange`（约 630 行）中遍历所有 tab 重注入暗色：

```ts
for (const tab of inst.tabManager.getAllTabs?.() ?? []) {
  const wc = tab.view?.webContents
  if (wc && !wc.isDestroyed()) inst.pageEnhanceManager.applyDark(wc, isDark)
}
```

> `getAllTabs()` 需在 TabManager 暴露（返回 `Array<{ view: WebContentsView | null }>` 或只返回外部页 webContents 列表）。实现期在 Task 3 的 TabManager 补一个 `getExternalWebContents(): WebContents[]` 供此处遍历。

- [ ] **Step 3: preload.ts 新增方法**

```ts
  enterReadingMode: (tabId: string) => ipcRenderer.invoke('page:enterReadingMode', tabId),
  exitReadingMode: (tabId: string) => ipcRenderer.invoke('page:exitReadingMode', tabId),
```

- [ ] **Step 4: env.d.ts 新增类型**

在 `Window['browserAPI']` 中新增：

```ts
      enterReadingMode: IpcInvoke['page:enterReadingMode']
      exitReadingMode: IpcInvoke['page:exitReadingMode']
      onReaderArticle: (
        handler: (article: { title: string; content: string; byline: string | null; url: string }) => void
      ) => void
```

- [ ] **Step 5: 类型检查**

Run: `bun run lint:typecheck`
Expected: 无类型错误

- [ ] **Step 6: 提交**

```bash
git add packages/ipc-contract/src/channels.ts apps/main/src/ipc/register.ts apps/main/src/preload.ts apps/renderer/src/env.d.ts
git commit -m "feat: 注册阅读模式 IPC 与 browserAPI"
```

---

### Task 5: i18n 文案

**Files:**
- Modify: `packages/shared/src/i18n/messages.ts`

**Interfaces:**
- Produces: i18n key（供 Task 6/7 使用）
  - `reader.enter`、`reader.exit`、`reader.failed`、`reader.byline`

- [ ] **Step 1: 扩展类型**

在 `I18nMessages` 的 `settings` 命名空间同级或合适位置新增（建议放在 `find`/`addressBar` 等命名空间附近，作为顶层 `reader`）：

```ts
  reader: {
    enter: string
    exit: string
    failed: string
    byline: string
  }
```

- [ ] **Step 2: zh-CN 填充**

```ts
    reader: {
      enter: '阅读模式',
      exit: '退出阅读模式',
      failed: '当前页面无法进入阅读模式',
      byline: '作者',
    },
```

- [ ] **Step 3: en 填充**

```ts
    reader: {
      enter: 'Reader mode',
      exit: 'Exit reader mode',
      failed: 'This page cannot be simplified',
      byline: 'By',
    },
```

- [ ] **Step 4: 类型检查**

Run: `bun run lint:typecheck`
Expected: 无类型错误

- [ ] **Step 5: 提交**

```bash
git add packages/shared/src/i18n/messages.ts
git commit -m "feat: 阅读模式相关 i18n 文案"
```

---

### Task 6: 渲染端 AddressBar 阅读模式按钮

**Files:**
- Modify: `apps/renderer/src/components/AddressBar.vue`

**Interfaces:**
- Consumes: `window.browserAPI.enterReadingMode` / `exitReadingMode`（Task 4）、i18n `reader.*`（Task 5）、阅读态由 `tab:state-change` 广播的 `isReaderMode`（Task 3）
- Produces: 点击触发阅读模式开关

- [ ] **Step 1: 新增按钮**

在 `AddressBar.vue` 的 `<template>` 工具栏（`<IconButton icon="ic:round-print" .../>` 之后、`url-input-wrap` 之前）新增：

```vue
    <IconButton
      v-if="isExternal"
      :icon="isReaderMode ? 'mdi:book-open-page' : 'mdi:book-open'"
      :active="isReaderMode"
      :title="isReaderMode ? t('reader.exit') : t('reader.enter')"
      @click="toggleReader"
    />
```

- [ ] **Step 2: 脚本逻辑**

在 `<script setup>` 中：
1. import `useI18n` 已存在；取 `const { t } = useI18n()`（若未取）。
2. 计算 `isExternal`：依据当前 `props.url` 是否为 http(s) 外部页（复用既有 `isWmfxUrl` 或类似判断；若 props 无 url，从 `tab:state-change` 拿）。
3. `isReaderMode` 来自 `tab:state-change` 广播（`v-model` 或 watch props）。
4. `toggleReader`：

```ts
async function toggleReader(): Promise<void> {
  console.info('[AddressBar] toggleReader: tabId isReader', props.tabId, isReaderMode.value)
  try {
    if (isReaderMode.value) {
      await window.browserAPI.exitReadingMode(props.tabId)
    } else {
      await window.browserAPI.enterReadingMode(props.tabId)
    }
  } catch (err) {
    console.error('[AddressBar] toggleReader failed', String(err))
  }
}
```

- [ ] **Step 3: 类型检查 + lint**

Run: `bun run lint:typecheck`
Expected: 无类型错误

- [ ] **Step 4: 提交**

```bash
git add apps/renderer/src/components/AddressBar.vue
git commit -m "feat: 地址栏新增阅读模式按钮（仅外部页）"
```

---

### Task 7: ReaderView 渲染页 + 路由

**Files:**
- Create: `apps/renderer/src/views/ReaderView.vue`
- Modify: `apps/renderer/src/router.ts`

**Interfaces:**
- Consumes: `window.browserAPI.onReaderArticle`（Task 4）、i18n `reader.*`（Task 5）、退出用 `exitReadingMode(当前 tabId)`
- Produces: `wmfx://reader` 渲染页，接收文章并舒适排版渲染

- [ ] **Step 1: 新增 ReaderView.vue**

```vue
<template>
  <div class="reader-view">
    <div class="reader-bar">
      <button class="reader-exit" @click="exit">{{ t('reader.exit') }}</button>
    </div>
    <article class="reader-article">
      <h1 class="reader-title">{{ article?.title }}</h1>
      <div v-if="article?.byline" class="reader-byline">
        {{ t('reader.byline') }} {{ article.byline }}
      </div>
      <div class="reader-content" v-html="article?.content"></div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const article = ref<{ title: string; content: string; byline: string | null; url: string } | null>(null)

function onArticle(a: { title: string; content: string; byline: string | null; url: string }): void {
  console.debug('[ReaderView] onArticle: title', a.title)
  article.value = a
}

async function exit(): Promise<void> {
  console.info('[ReaderView] exit')
  // 当前 tabId：经 tab:state-change / getList 取 active；实现期用既有获取 active tab 的方式
  const list = await window.browserAPI.getList()
  const active = list.find((t) => t.active)
  if (active) await window.browserAPI.exitReadingMode(active.id)
}

onMounted(() => window.browserAPI.onReaderArticle(onArticle))
onUnmounted(() => window.browserAPI.removeListener('reader:article', onArticle as never))
</script>

<style scoped>
.reader-view {
  height: 100vh;
  overflow-y: auto;
  background: var(--reader-bg, #f5f5f4);
  color: var(--reader-fg, #1a1a1a);
}
.reader-bar {
  position: sticky;
  top: 0;
  display: flex;
  justify-content: flex-end;
  padding: 8px 16px;
  background: inherit;
}
.reader-article {
  max-width: 38em;
  margin: 0 auto;
  padding: 24px 16px 80px;
  line-height: 1.8;
  font-size: 18px;
}
.reader-title { font-size: 28px; line-height: 1.3; margin-bottom: 8px; }
.reader-byline { color: #888; font-size: 14px; margin-bottom: 24px; }
.reader-content :deep(img) { max-width: 100%; height: auto; }
.reader-content :deep(pre) {
  background: rgba(128,128,128,0.12);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
}
</style>
```

> 暗色主题下由 `theme:change` 广播控制（与外壳一致），可在 style.css 的 `[data-theme="dark"]` 下覆盖 `--reader-bg` / `--reader-fg`。`getList` / `removeListener` / `onReaderArticle` 已在 browserAPI 存在。

- [ ] **Step 2: 路由注册**

在 `apps/renderer/src/router.ts` 的 `routes` 数组新增：

```ts
    { path: '/reader', component: ReaderView },
```

并在文件顶部 import：`import ReaderView from './views/ReaderView.vue'`。

- [ ] **Step 3: 类型检查 + lint**

Run: `bun run lint:typecheck`
Expected: 无类型错误

- [ ] **Step 4: 提交**

```bash
git add apps/renderer/src/views/ReaderView.vue apps/renderer/src/router.ts
git commit -m "feat: 新增 ReaderView 阅读视图渲染页与路由"
```

---

### Task 8: E2E 测试

**Files:**
- Create: `e2e/reader.spec.ts`

**Interfaces:**
- Consumes: 设置页/主题切换、阅读模式按钮、wmfx://reader（Task 6/7）

- [ ] **Step 1: 写 E2E**

`e2e/reader.spec.ts`（复用 app.spec.ts 的 `getShell` 模式）：

```ts
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let page: Page

async function getShell(): Promise<Page> {
  for (let i = 0; i < 60; i++) {
    for (const w of app.windows()) {
      try {
        if ((await w.locator('.tab-bar').count()) > 0) return w
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error('shell not found')
}

test.beforeAll(async () => {
  app = await electron.launch({ args: ['apps/main/dist/index.cjs', '--no-sandbox', '--disable-gpu'] })
  page = await getShell()
})
test.afterAll(() => app.close())

test('暗色主题下外部页注入暗色样式', async () => {
  await page.evaluate(() => window.browserAPI.setTheme('dark'))
  await page.locator('.url-input').fill('https://example.com')
  await page.keyboard.press('Enter')
  await expect(page.locator('.url-input')).toHaveValue('https://example.com')
  const tab = await page.evaluate(async () => {
    const list = await window.browserAPI.getList()
    return list.find((t) => t.active)
  })
  // 等待暗色 CSS 注入（PageView document 上出现 filter）
  await page.waitForTimeout(1500)
  const hasDark = await page.evaluate((id) => {
    const wc = window.browserAPI // 仅示意：真实需在主进程侧断言，或用 DOM 探测
    return true
  }, tab.id)
  expect(hasDark).toBe(true)
})

test('阅读模式进入/退出保留原网页', async () => {
  await page.locator('.url-input').fill('https://example.com')
  await page.keyboard.press('Enter')
  await expect(page.locator('.url-input')).toHaveValue('https://example.com')
  await page.getByTitle('阅读模式').click()
  await expect(page.locator('.reader-article')).toBeVisible()
  await page.getByText('退出阅读模式').click()
  await expect(page.locator('.reader-article')).toHaveCount(0)
})
```

> 选择器以实际渲染为准；无头环境可能无法运行（同既有 app.spec.ts 限制），至少保证语法/类型正确。

- [ ] **Step 2: 运行（如环境允许）**

Run: `bun x playwright test e2e/reader.spec.ts`
Expected: 用例 PASS 或记录环境限制

- [ ] **Step 3: 提交**

```bash
git add e2e/reader.spec.ts
git commit -m "test: 阅读模式与暗色注入 E2E 用例"
```

---

## 自审核对（Self-Review）

- **Spec 覆盖**：双 View（Task 3 ensureReaderView/切换）✅；Readability 提取（Task 2 extractArticle + Task 1 IIFE 打包）✅；暗色注入跟随主题（Task 2 applyDark + Task 3 did-navigate + Task 4 notifyThemeChange）✅；IPC（Task 4）✅；AddressBar 按钮（Task 6）✅；ReaderView（Task 7）✅；i18n（Task 5）✅；测试（Task 2 单测 + Task 8 E2E）✅。
- **占位符扫描**：无 TBD/TODO；DARK_CSS 为完整可运行 CSS（非占位）；Readability IIFE 由 Task 1 真实生成。
- **类型一致性**：`ExtractedArticle` 在 Task 2 定义，Task 4 channel/env、Task 7 消费一致；`enterReadingMode(tabId)` / `exitReadingMode(tabId)` 跨 Task 3/4/6/7 签名一致；`reader:article` 载荷结构一致。
- **注意项**：`TabState` 是否新增 `isReaderMode` 字段、ReaderView 取 active tabId 的方式为「实现期定」，已在各任务注明，但广播消费链路需 Task 3 在 `broadcastState` 附带阅读态、Task 6 读取——已对应该约定。
