# 阅读模式 / 页面级暗色注入 设计

- 日期：2026-07-17
- 关联 Roadmap：Phase 3.5 — 「阅读模式 / 页面级暗色注入」
- 范围：阅读模式（Readability 正文提取 + 双 WebContentsView 切换）+ 页面级暗色注入（CSS 滤镜反转、跟随全局主题、仅外部站点）

## 设计决策

| 问题 | 决策 |
|------|------|
| 阅读模式程度 | 正文提取重排（Safari 式阅读视图） |
| 提取方案 | `@mozilla/readability` 库，UMD 源码以字符串注入 PageView |
| 阅读视图呈现 | **双 WebContentsView**：每个 Tab 维护 PageView（外部网页）+ ReaderView（内部 `wmfx://reader`），通过 `setVisible` 切换，原网页不销毁 |
| 暗色技术 | CSS 滤镜反色（filter: invert + hue-rotate，图片再反回） |
| 暗色触发 | 跟随全局主题（dark 自动注入，light 不注入） |
| 暗色范围 | 仅外部 http(s) 站点；内部页 wmfx:// 与 about:blank 排除 |

## 为什么用双 View 而非原地改 DOM

直接 `document.body.innerHTML = articleHtml` 会破坏 SPA 状态、杀掉 JS、停掉视频、丢失滚动位置，React/Vue 应用可能崩溃，退出还原极麻烦。双 View 方案等价于 `display:none` / `display:block`——进入阅读模式只是 `pageView.setVisible(false)` + `readerView.setVisible(true)`，原网页完全保留，无任何副作用。这与 WMFX 现有架构契合（Tab 已用 `contentView.addChildView`/`setVisible`/`setBounds` 管理多视图，off-screen 用 `setBounds({y:-10000})` 已是既有模式）。

## 1. 主进程：PageEnhanceManager

新增 `apps/main/src/page-enhance-manager.ts`：

```ts
/**
 * 页面增强管理器 — 暗色注入 + 阅读模式编排（主进程侧）
 *
 * 职责：
 * - 按全局主题给外部 http(s) 页注入/移除暗色 CSS（CSS 滤镜反色方案）
 * - 阅读模式：在 PageView 的 webContents 内执行 Readability 提取脚本，
 *   把解析出的文章经 IPC 推给 ReaderView（内部 wmfx://reader）渲染；
 *   视图切换由 TabManager 控制（setVisible），原网页不销毁。
 *
 * 注意：外部页不挂 preload，故提取脚本必须是自包含纯 JS 字符串，
 * 不能依赖项目模块；Readability UMD 源码以字符串常量内联。
 */
import type { WebContents } from 'electron'

export interface ExtractedArticle {
  title: string
  content: string
  byline: string | null
  url: string
}

export class PageEnhanceManager {
  /** 暗色 CSS：对 html 反色 + 色相旋转，图片/视频再反回原色，叠加大底色避免纯白刺眼 */
  private static readonly DARK_CSS = `...`
  /** Readability 注入脚本（IIFE，运行时经 fs.readFile 从 resources 读取，见下文「Readability 来源」） */
  private readabilitySrc = ''
  /** 每个 wc.id 记录的已插入暗色 CSS key，便于移除 */
  private darkCssKeys = new Map<number, string>()

  /** 按当前主题给外部页注入/移除暗色；内部页/about:blank 跳过 */
  applyDark(wc: WebContents, isDark: boolean): void

  /**
   * 在 PageView 的 webContents 内运行 Readability，提取正文。
   * 返回 { title, content, byline, url }；无法提取（无正文）时返回 null。
   */
  async extractArticle(wc: WebContents): Promise<ExtractedArticle | null>
}
```

### applyDark 行为

- 仅当 `!isWmfxUrl(url) && (url.startsWith('http://') || url.startsWith('https://'))` 时执行。
- `isDark === true`：`const key = await wc.insertCSS(DARK_CSS)`，`darkCssKeys.set(wc.id, key)`。
- `isDark === false`：若 `darkCssKeys.has(wc.id)`，调 `wc.removeInsertedCSS(key)` 并删除记录。
- `removeInsertedCSS` 若不存在于该 Electron 版本类型，则用 `as never` 断言或 try/catch 兜底。
- wc 销毁时清理 Map 对应项（由 TabManager 在 close 时调用或惰性判断 `isDestroyed()`）。

### 暗色 CSS（DARK_CSS）

```css
html { background: #0d0d0d !important; }
html, body, *:not(img):not(video):not(canvas) {
  filter: invert(1) hue-rotate(180deg) !important;
  background-color: #0d0d0d !important;
}
img, video, canvas { filter: invert(1) hue-rotate(180deg) !important; }
```

> 注：上述为基调，实际会微调饱和度/对比，并避免代码块等区域过暗。最终值在实现期确定（YAGNI：先可用版本，不追求完美配色）。

### 阅读模式（extractArticle + 双 View 切换）

`extractArticle` 在 PageView 的 webContents 内执行：
```js
executeJavaScript(this.readabilitySrc + `
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
  })();
`)
```
返回字符串经 `JSON.parse` 得到 `ExtractedArticle | null`。

#### Readability 来源（重要）

`@mozilla/readability@0.6.0` 是 **CommonJS** 包（`Readability.js` 末尾 `module.exports = Readability`），**不是 UMD**、没有 `window.Readability` 全局、也无法直接 `toString()` 注入（内部依赖 `JSDOMParser` 等模块，单独序列化会丢失依赖）。

因此采用 **build 期 esbuild 打包成 IIFE** 的方案：

1. 新增一个 esbuild 脚本（如 `scripts/build-readability.ts` 或并入现有 build 编排），把 `@mozilla/readability` 打成自包含 IIFE，输出全局 `window.Readability`，生成 `resources/readability.js`（随包发布，electron-builder `extraResources` 拷贝）。
   ```ts
   // esbuild 配置要点
   import { build } from 'esbuild'
   build({
     entryPoints: ['node_modules/@mozilla/readability/Readability.js'],
     bundle: true,            // 把 JSDOMParser 等依赖一起打进来
     format: 'iife',
     globalName: 'Readability',
     outfile: 'resources/readability.js',
   })
   ```
2. 运行时 `PageEnhanceManager` 构造函数用 `fs.readFile(resolveFromRoot('resources/readability.js'), 'utf-8')` 读入字符串赋给 `this.readabilitySrc`；随后 `executeJavaScript(this.readabilitySrc + ...)` 注入 PageView。
3. 外部页无 preload，但读取的是本地文件字符串，离线可用、无网络依赖。

- **视图切换由 TabManager 负责**（见第 2 节）：进入阅读模式 = `pageView.setVisible(false)` + `readerView.setVisible(true)` + 把 `ExtractedArticle` 经 `readerView.webContents.send('reader:article', article)` 推给渲染端 `wmfx://reader` 页渲染。退出 = 反向 `setVisible`。原网页 webContents 全程存活，无 DOM 覆盖、无 reload、无状态丢失。

## 2. 集成点：TabManager 双 View + 主题联动

### Tab 结构变更

`Tab` 对象新增 `readerView: WebContentsView | null`（与现有 `tab.view` 即 PageView 并列）。每个**外部 http(s)** Tab 在创建/需要时懒初始化 ReaderView（`wmfx://reader` 内部页，挂 preload），与 PageView 同时 `addChildView` 到 `contentView`，默认 `readerView.setVisible(false)`。

- PageView 正常显示时：`pageView.setVisible(true)`、`readerView.setVisible(false)`。
- 进入阅读模式：`pageView.setVisible(false)`、`readerView.setVisible(true)`（等价 off-screen 隐藏，复用既有 `setBounds({y:-10000})` 模式或 `setVisible` 均可，实现期定）。
- 退出：`readerView.setVisible(false)`、`pageView.setVisible(true)`。
- 关闭 Tab 时两个 view 都 `close()`。

### TabManager 职责

- `TabManager` 构造函数新增 `pageEnhanceManager: PageEnhanceManager` 参数（由 `createMainWindow` 创建并传入）。
- `setupTabListeners` 中 `did-navigate` 与 `did-navigate-in-page` 末尾，对外部 http(s) 页分支调用：
  ```ts
  this.pageEnhanceManager.applyDark(wc, this.isDarkNow())
  ```
  SPA 内页导航后重新注入暗色。
- `TabManager` 新增：
  - `ensureReaderView(tab)`：懒创建 ReaderView 并 `addChildView`，`setVisible(false)`。
  - `enterReadingMode(tabId)`：取 PageView 的 wc → `pageEnhanceManager.extractArticle(wc)`；若返回 null，经 IPC 通知渲染端「进入失败」（`tab:reader-failed` 或直接 `tab:state-change` 带 `readerError`）；否则 `ensureReaderView(tab)` + `readerView.webContents.send('reader:article', article)` + 切换可见性 + 广播 `isReaderMode=true`。
  - `exitReadingMode(tabId)`：切换可见性回 PageView，广播 `isReaderMode=false`。
- `isDarkNow()`：`theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)`（复用既有逻辑）。
- **主题切换联动**：`register.ts` 的 `notifyThemeChange` 中，遍历所有 tab 的 PageView webContents，对外部页重新 `applyDark(wc, isDark)`。
- **导航即退出阅读模式**：`did-navigate` 后若处于阅读态，切回 PageView 可见（ReaderView 内容随新文章失效，下次进入重新提取）。
- **暗色不注入 ReaderView**：ReaderView 是内部页（wmfx://），applyDark 已排除，且其阅读样式自带暗色适配（由 `theme:change` 广播控制，与外壳一致）。

## 3. IPC 与渲染端

### IPC（channels.ts + register.ts + preload.ts + env.d.ts）

```ts
'page:enterReadingMode': (tabId: string) => void
'page:exitReadingMode': (tabId: string) => void
'reader:article': (article: { title: string; content: string; byline: string | null; url: string }) => void  // 主进程 → ReaderView 渲染
```

- `page:enterReadingMode` / `page:exitReadingMode`：register.ts handler 调 `inst.tabManager.enterReadingMode(tabId)` / `exitReadingMode(tabId)`。
- `reader:article`：主进程 `readerView.webContents.send('reader:article', article)` 推给 `wmfx://reader` 渲染页。
- 暗色无需新 IPC（主进程自动，跟随主题）。
- preload + env.d.ts `browserAPI` 新增：
  ```ts
  enterReadingMode: (tabId: string) => Promise<void>
  exitReadingMode: (tabId: string) => Promise<void>
  onReaderArticle: (cb: (article: { title: string; content: string; byline: string | null; url: string }) => void) => void
  ```

### 渲染端

**AddressBar.vue（阅读模式开关）**
- toolbar 新增一个 `IconButton`（图标 `mdi:book-open`），仅对**外部 http(s) 页**显示（`v-if="isExternal"`）。
- 点击 toggle：当前非阅读态 → `enterReadingMode(props.tabId)`；已是阅读态 → `exitReadingMode(props.tabId)`。
- 阅读态由主进程经 `tab:state-change` 广播 `isReaderMode` 驱动按钮高亮；进入失败经 `reader:failed`/错误态提示。

**新增 ReaderView 渲染页 `apps/renderer/src/views/ReaderView.vue` + 路由 `/reader`**
- 监听 `browserAPI.onReaderArticle` 接收文章，渲染：标题、byline、舒适排版的内容区（居中、行宽 ~38em、大字号、行高宽松）。
- 顶部「退出阅读模式」按钮 → `exitReadingMode(当前 tabId)`（需知道当前 tabId：由 `tab:state-change` 或路由参数提供，实现期定；也可用 `browserAPI.getActiveTabId()` 之类的既有能力）。
- 跟随全局主题（`theme:change` 广播，与外壳一致），暗色下用舒适暗色背景。
- `router.ts` 新增 `{ path: '/reader', component: ReaderView }`；`settingsMenu` 无需新增（阅读模式不是设置项）。

### i18n

`packages/shared/src/i18n/messages.ts` 新增（zh-CN + en）：
```ts
reader: {
  enter: string    // 阅读模式
  exit: string     // 退出阅读模式
  failed: string   // 当前页面无法进入阅读模式
  byline: string   // 作者（byline 前缀，可选）
}
```

## 4. 测试

### 单元测试（Vitest，apps/main/src）

`page-enhance-manager.test.ts`：mock `WebContents`（`insertCSS`/`removeInsertedCSS`/`executeJavaScript` spy，`getURL` 返回不同 url）：
- `applyDark(true)` 对 http 外部页调用 `insertCSS` 并存 key。
- `applyDark(false)` 对已有 key 的 wc 调用 `removeInsertedCSS`。
- `applyDark` 对 `wmfx://` 与 `about:blank` 不调用 `insertCSS`。
- `extractArticle` 调用 `executeJavaScript` 且能解析返回的 JSON 字符串为 `ExtractedArticle`；提取失败时（脚本返回 null）返回 null。

`tab-manager` 相关（可并入既有或在 plan 阶段补）：验证 `enterReadingMode` 调 `extractArticle` 后切换 `setVisible` 并向 ReaderView `send('reader:article')`；`exitReadingMode` 切回 PageView 可见。

### E2E（Playwright，e2e/reader.spec.ts）

- 设主题为 dark → 打开外部站点 → 断言 PageView document 上注入了暗色样式。
- 点阅读模式按钮 → 断言 ReaderView 可见且含文章标题/正文（`.wmfx-reader` 或标题文本）；PageView 仍存活（切回后内容/滚动保留）。
- 退出阅读模式 → PageView 重新可见，原网页完整。
- 内部页（wmfx://）不出现阅读模式按钮。

## 5. 文件改动清单

| 文件 | 改动 |
|------|------|
| `apps/main/src/page-enhance-manager.ts` | 新增（applyDark + extractArticle，fs.readFile 读取 readability 脚本） |
| `apps/main/src/page-enhance-manager.test.ts` | 新增 |
| `scripts/build-readability.ts`（或并入现有 build 编排） | 新增 esbuild 打包脚本：把 @mozilla/readability 打成 IIFE 输出 `resources/readability.js` |
| `resources/readability.js` | 打包产物（随包发布，electron-builder extraResources） |
| `apps/main/src/tab-manager.ts` | 持有 PageEnhanceManager；Tab 新增 readerView；双 View 切换；ensureReaderView / enterReadingMode / exitReadingMode；did-navigate 调 applyDark + 导航退出阅读态 |
| `apps/main/src/window-manager.ts` | createMainWindow 创建并注入 PageEnhanceManager |
| `apps/main/src/ipc/register.ts` | 注册 page:enterReadingMode / page:exitReadingMode；notifyThemeChange 遍历重注入暗色 |
| `packages/ipc-contract/src/channels.ts` | 新增 page:* 2 个 + reader:article |
| `apps/main/src/preload.ts` | 新增 enterReadingMode / exitReadingMode / onReaderArticle |
| `apps/renderer/src/env.d.ts` | browserAPI 类型新增 |
| `apps/renderer/src/components/AddressBar.vue` | 新增阅读模式按钮（仅外部页） |
| `apps/renderer/src/views/ReaderView.vue` | 新增（阅读视图渲染页） |
| `apps/renderer/src/router.ts` | 新增 `/reader` 路由 |
| `packages/shared/src/i18n/messages.ts` | 新增 reader.* i18n key |
| `e2e/reader.spec.ts` | 新增测试 |
