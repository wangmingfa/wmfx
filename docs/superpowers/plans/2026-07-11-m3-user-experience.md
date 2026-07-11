# M3 — 用户体验增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 补全日常浏览器体验中高频但缺失的功能：新标签页、页面内搜索、地址栏补全、书签快速操作、标签拖拽排序

**Architecture:** 5 个功能模块，共享新的 IPC 通道（autocomplete、bookmark:isBookmarked、tab:reorder、settings:newTab*、page:find*）。New Tab 和 Find Bar 为渲染进程组件，通过 ChromeUI 条件渲染。Autocomplete 集成到 AddressBar。书签星标按钮集成到 AddressBar。标签拖拽在 TabBar 中实现。

**Tech Stack:** Electron 43 + Vue 3.5 + TypeScript 5.9 + better-sqlite3 + electron-store + bun

## Global Constraints

- Electron sandbox: true, contextIsolation: true, nodeIntegration: false
- 渲染进程不持有任何主进程对象引用，全部通过 IPC 操作
- IPC 通道在 packages/ipc-contract 中类型安全定义
- 数据库使用 better-sqlite3（同步 API）
- KV 存储使用 electron-store
- 主题通过 `nativeTheme.themeSource` 控制
- 所有 lint/typecheck/build 必须通过

---

## 文件结构预览

```
apps/main/src/
├── bookmark-manager.ts     ← 修改（isBookmarked 方法）
├── history-manager.ts      ← 修改（getRecent 方法）
├── settings-manager.ts     ← 修改（quickLinks + tabOrder 字段）
├── tab-manager.ts          ← 修改（reorder 方法）
├── window-manager.ts       ← 修改（传递 SettingsManager 给 TabManager）
├── index.ts                ← 修改（新标签创建时默认加载 NewTab）
├── ipc/register.ts         ← 修改（添加 M3 handlers）
├── preload.ts              ← 修改（添加 M3 browserAPI 方法）

packages/ipc-contract/src/
├── channels.ts             ← 修改（添加 M3 通道类型）

apps/renderer/src/
├── components/
│   ├── AddressBar.vue      ← 修改（星标按钮 + Autocomplete）
│   ├── ChromeUI.vue        ← 修改（NewTab 条件渲染 + FindBar 挂载）
│   ├── TabBar.vue          ← 修改（拖拽排序）
│   ├── FindBar.vue         ← 新增
│   └── Autocomplete.vue    ← 新增
├── views/
│   └── NewTab.vue          ← 新增
└── env.d.ts                ← 修改（添加 M3 类型）
```

---

### Task 1: IPC 契约 — 添加 M3 通道

**Files:**
- Modify: `packages/ipc-contract/src/channels.ts`
- Modify: `packages/ipc-contract/src/index.ts`

**Interfaces:**
- Produces: M3 所有通道类型定义

- [x] **Step 1: 在 channels.ts 末尾添加新类型**

```typescript
/** 新标签页快捷网站 */
export interface QuickLink {
  id: string
  title: string
  url: string
}

/** 补全建议项 */
export interface AutocompleteSuggestion {
  type: 'history' | 'bookmark' | 'search'
  title: string
  url: string
}

/** 补全查询参数 */
export interface AutocompleteQuery {
  query: string
  limit?: number
}

/** 书签检查结果 */
export interface BookmarkCheckResult {
  isBookmarked: boolean
  id: string | null
}

/** 标签页查找结果 */
export interface FindInPageResult {
  matches: number
  activeMatch: number
  searchText: string
}

/** 页面内查找参数 */
export interface FindInPageOptions {
  tabId: string
  searchText: string
}

/** 标签页查找翻页参数 */
export interface FindInPageDirection {
  tabId: string
  forward: boolean
}

/** 新标签页快捷网站列表参数 */
export interface QuickLinksListOptions {
  tabId?: string
}
```

- [x] **Step 2: 在 IpcContract 接口中添加新通道**

```typescript
  // New Tab
  'settings:getQuickLinks': () => QuickLink[]
  'settings:setQuickLinks': (links: QuickLink[]) => void
  // Autocomplete
  'autocomplete:suggestions': (opts: AutocompleteQuery) => AutocompleteSuggestion[]
  // Bookmark
  'bookmark:isBookmarked': (url: string) => BookmarkCheckResult
  // Find in Page
  'page:startFind': (opts: FindInPageOptions) => void
  'page:endFind': (tabId: string) => void
  'page:findNext': (opts: FindInPageDirection) => void
  'page:findPrevious': (opts: FindInPageDirection) => void
  // Tab reorder
  'tab:reorder': (ids: string[]) => void
```

- [x] **Step 3: 在 index.ts 中添加新类型导出**

```typescript
export type {
  // ... existing
  QuickLink,
  AutocompleteSuggestion,
  AutocompleteQuery,
  BookmarkCheckResult,
  FindInPageResult,
  FindInPageOptions,
  FindInPageDirection,
} from './channels'
```

- [x] **Step 4: 构建验证**

```bash
bun run build:ipc && bun run typecheck
```

Expected: 所有包类型检查通过

- [x] **Step 5: 提交**

```bash
git add packages/ipc-contract/
git commit -m "feat(ipc-contract): add M3 channels (autocomplete/bookmark/quicklinks/find/reorder)"
```

---

### Task 2: SettingsManager — 添加 quickLinks + tabOrder

**Files:**
- Modify: `apps/main/src/settings-manager.ts`

**Interfaces:**
- Produces: `SettingsManager` 扩展 quickLinks 和 tabOrder 字段

- [x] **Step 1: 修改 settings-manager.ts**

```typescript
import Store from 'electron-store'
import type { QuickLink } from '@browser/ipc-contract'

interface SettingsSchema {
  theme: 'light' | 'dark' | 'system'
  downloadPath: string
  defaultSearch: 'google' | 'baidu' | 'bing'
  newTabUrl: string
  zoomFactor: number
  quickLinks: QuickLink[]
  tabOrder: string[]
}

const defaultSettings: SettingsSchema = {
  theme: 'dark',
  downloadPath: '',
  defaultSearch: 'google',
  newTabUrl: 'https://www.google.com',
  zoomFactor: 1,
  quickLinks: [],
  tabOrder: [],
}

export class SettingsManager {
  private store: Store<SettingsSchema>

  constructor() {
    this.store = new Store<SettingsSchema>({
      name: 'wmfx-settings',
      defaults: defaultSettings,
    })
  }

  get<K extends keyof SettingsSchema>(key: K): SettingsSchema[K] {
    return this.store.get(key) as SettingsSchema[K]
  }

  set<K extends keyof SettingsSchema>(key: K, value: SettingsSchema[K]): void {
    this.store.set(key, value)
  }

  getAll(): SettingsSchema {
    return { ...defaultSettings, ...this.store.store }
  }
}
```

- [x] **Step 2: 构建验证**

```bash
bun run build:main && bun run typecheck
```

Expected: 构建成功

- [x] **Step 3: 提交**

```bash
git add apps/main/src/settings-manager.ts
git commit -m "feat(main): add quickLinks and tabOrder to SettingsManager"
```

---

### Task 3: HistoryManager — 添加 getRecent + BookmarkManager — 添加 isBookmarked

**Files:**
- Modify: `apps/main/src/history-manager.ts`
- Modify: `apps/main/src/bookmark-manager.ts`

**Interfaces:**
- Produces: `HistoryManager.getRecent()` 返回最近访问的历史记录
- Produces: `BookmarkManager.isBookmarked()` 检查 URL 是否已收藏

- [x] **Step 1: 修改 history-manager.ts**

在 `HistoryManager` 类中添加 `getRecent` 方法：

```typescript
  getRecent(limit = 5): HistoryItem[] {
    return this.repo.getList(limit, 0)
  }
```

- [x] **Step 2: 修改 bookmark-manager.ts**

在 `BookmarkManager` 类中添加 `isBookmarked` 方法：

```typescript
  isBookmarked(url: string): { isBookmarked: boolean; id: string | null } {
    const items = this.repo.search(url)
    if (items.length > 0) {
      return { isBookmarked: true, id: items[0].id }
    }
    return { isBookmarked: false, id: null }
  }
```

- [x] **Step 3: 构建验证**

```bash
bun run build:main && bun run typecheck
```

Expected: 构建成功

- [x] **Step 4: 提交**

```bash
git add apps/main/src/history-manager.ts apps/main/src/bookmark-manager.ts
git commit -m "feat(main): add getRecent to HistoryManager and isBookmarked to BookmarkManager"
```

---

### Task 4: TabManager — 添加 reorder 方法

**Files:**
- Modify: `apps/main/src/tab-manager.ts`
- Modify: `apps/main/src/window-manager.ts`（传递 SettingsManager）

**Interfaces:**
- Produces: `TabManager.reorder(ids: string[])` 重新排列标签顺序

- [x] **Step 1: 修改 tab-manager.ts**

在 `TabManager` 构造器中添加 SettingsManager 参数，在类中添加 `reorder` 方法：

```typescript
constructor(
  private window: BrowserWindow,
  private getSession: (name: string) => Session,
  private defaultSessionName: string = 'default',
  private historyManager: HistoryManager,
  private settingsManager: SettingsManager | null = null
) {
```

添加 `reorder` 方法：

```typescript
  reorder(ids: string[]): void {
    if (!this.settingsManager) return
    this.settingsManager.set('tabOrder', ids)

    for (const tab of this.tabs.values()) {
      tab.view.setBounds({ ...tab.state.bounds, y: -10000 })
    }

    const activeId = this.activeTabId
    let activeIdx = -1

    for (let i = 0; i < ids.length; i++) {
      const tab = this.tabs.get(ids[i])
      if (!tab) continue

      if (ids[i] === activeId) {
        activeIdx = i
      }

      const newY = i * 20 - 20
      tab.view.setBounds({
        x: tab.state.bounds.x,
        y: newY,
        width: tab.state.bounds.width,
        height: tab.state.bounds.height,
      })
    }

    if (activeIdx >= 0 && activeId) {
      const activeTab = this.tabs.get(activeId)
      if (activeTab) {
        this.activeTabId = null
        this.activate(activeId)
      }
    }
  }
```

- [x] **Step 2: 修改 window-manager.ts**

将 `SettingsManager` 传递给 `TabManager` 构造器：

```typescript
const tabManager = new TabManager(win, (name) => sessionManager.getSession(name), 'default', historyManager, settingsManager)
```

- [x] **Step 3: 构建验证**

```bash
bun run build:main && bun run typecheck
```

Expected: 构建成功

- [x] **Step 4: 提交**

```bash
git add apps/main/src/tab-manager.ts apps/main/src/window-manager.ts
git commit -m "feat(main): add reorder to TabManager with SettingsManager injection"
```

---

### Task 5: IPC handlers — 注册 M3 通道

**Files:**
- Modify: `apps/main/src/ipc/register.ts`

**Interfaces:**
- Consumes: M3 Manager 方法 + SettingsManager 字段

- [x] **Step 1: 在 register.ts 末尾添加新 handlers**

```typescript
  // QuickLinks
  handle('settings:getQuickLinks', () => {
    const inst = getInstance()
    if (!inst) return []
    return inst.settingsManager.get('quickLinks')
  })

  handle('settings:setQuickLinks', (links) => {
    const inst = getInstance()
    if (!inst) return
    inst.settingsManager.set('quickLinks', links)
  })

  // Autocomplete
  handle('autocomplete:suggestions', (opts) => {
    const inst = getInstance()
    if (!inst) return []
    const { query = '', limit = 6 } = opts
    const historyResults = inst.historyManager.search(query, limit, 0).map((item) => ({
      type: 'history' as const,
      title: item.title ?? item.url,
      url: item.url,
    }))
    const bookmarkResults = inst.bookmarkManager.search(query).map((item) => ({
      type: 'bookmark' as const,
      title: item.title,
      url: item.url ?? '',
    }))
    const results = [...historyResults, ...bookmarkResults]
    const unique = new Map<string, AutocompleteSuggestion>()
    for (const r of results) {
      if (!unique.has(r.url)) {
        unique.set(r.url, r)
      }
    }
    const suggestions = Array.from(unique.values())
      .slice(0, limit)
      .filter((s) => s.url)
    return suggestions
  })

  // Bookmark
  handle('bookmark:isBookmarked', (url) => {
    const inst = getInstance()
    if (!inst) return { isBookmarked: false, id: null }
    return inst.bookmarkManager.isBookmarked(url)
  })

  // Find in Page — use on (not handle) because found-in-page is an async event
  // The main process listens on webContents 'found-in-page' and broadcasts to renderer
  ipcMain.on('page:startFind', (event, opts) => {
    const inst = getInstance()
    if (!inst) return
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (!wc) return

    const foundHandler = (_: Electron.Event, result: Electron.FoundInPageEvent) => {
      event.sender.send('page:foundInPage', {
        matches: result.matches,
        activeMatch: result.activeMatch,
        tabId: opts.tabId,
      })
    }
    wc.removeListener('found-in-page', foundHandler)
    wc.on('found-in-page', foundHandler)
    wc.findInPage(opts.searchText)
  })

  handle('page:endFind', (tabId) => {
    const inst = getInstance()
    if (!inst) return
    const wc = inst.tabManager.getWebContents(tabId)
    if (wc) {
      wc.removeListener('found-in-page', () => {})
      wc.stopFindInPage('clearSelection')
    }
  })

  handle('page:findNext', (opts) => {
    const inst = getInstance()
    if (!inst) return
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (wc) wc.findInPage('', { forward: opts.forward, findNext: true })
  })

  handle('page:findPrevious', (opts) => {
    const inst = getInstance()
    if (!inst) return
    const wc = inst.tabManager.getWebContents(opts.tabId)
    if (wc) wc.findInPage('', { forward: !opts.forward, findNext: true })
  })
```

添加 import：

```typescript
import type { IpcContract, ThemeMode, FoundInPageEvent } from '@browser/ipc-contract'
```

在 IpcContract 中添加事件通道：

```typescript
  // Find in Page event
  'page:foundInPage': (data: { matches: number; activeMatch: number; tabId: string }) => void
```

- [x] **Step 2: 构建验证**

```bash
bun run build:main && bun run typecheck
```

Expected: 构建成功

- [x] **Step 3: 提交**

```bash
git add apps/main/src/ipc/register.ts
git commit -m "feat(main): register M3 IPC handlers (quicklinks/autocomplete/bookmark/find/reorder)"
```

---

### Task 6: preload — 添加 M3 browserAPI 方法

**Files:**
- Modify: `apps/main/src/preload.ts`

**Interfaces:**
- Produces: 渲染进程可用的 M3 API

- [x] **Step 1: 修改 preload.ts**

添加 import：

```typescript
import type {
  // ... existing
  QuickLink,
  AutocompleteSuggestion,
  AutocompleteQuery,
  BookmarkCheckResult,
  FindInPageOptions,
  FindInPageDirection,
} from '@browser/ipc-contract'
```

在 `api` 对象中添加方法：

```typescript
  // QuickLinks
  getQuickLinks: () => Promise<QuickLink[]>,
  setQuickLinks: (links: QuickLink[]) => Promise<void>,
  // Autocomplete
  getAutocompleteSuggestions: (opts: AutocompleteQuery) => Promise<AutocompleteSuggestion[]>,
  // Bookmark
  isBookmarked: (url: string) => Promise<BookmarkCheckResult>,
  // Find in Page
  startFind: (opts: FindInPageOptions) => void,
  endFind: (tabId: string) => Promise<void>,
  findNext: (opts: FindInPageDirection) => Promise<void>,
  findPrevious: (opts: FindInPageDirection) => Promise<void>,
  // Tab reorder
  reorderTabs: (ids: string[]) => Promise<void>,
```

在 `exposeTo` 中添加实现：

```typescript
    getQuickLinks: () => ipcRenderer.invoke('settings:getQuickLinks'),
    setQuickLinks: (links) => ipcRenderer.invoke('settings:setQuickLinks', links),
    getAutocompleteSuggestions: (opts) => ipcRenderer.invoke('autocomplete:suggestions', opts),
    isBookmarked: (url) => ipcRenderer.invoke('bookmark:isBookmarked', url),
    startFind: (opts) => ipcRenderer.send('page:startFind', opts),
    endFind: (tabId) => ipcRenderer.invoke('page:endFind', tabId),
    findNext: (opts) => ipcRenderer.invoke('page:findNext', opts),
    findPrevious: (opts) => ipcRenderer.invoke('page:findPrevious', opts),
    reorderTabs: (ids) => ipcRenderer.invoke('tab:reorder', ids),
```

添加 `page:foundInPage` 事件监听：

```typescript
  ipcRenderer.on('page:foundInPage', (_, data) => {
    window.browserAPI.onFoundInPage(data)
  })
```

- [x] **Step 2: 构建验证**

```bash
bun run build:main && bun run typecheck
```

Expected: 构建成功

- [x] **Step 3: 提交**

```bash
git add apps/main/src/preload.ts
git commit -m "feat(main): add M3 browserAPI methods to preload"
```

---

### Task 7: env.d.ts — 添加 M3 类型

**Files:**
- Modify: `apps/renderer/src/env.d.ts`

**Interfaces:**
- Produces: 渲染进程 TypeScript 类型

- [x] **Step 1: 修改 env.d.ts**

添加 import：

```typescript
import type {
  CreateTabOptions,
  IpcInvoke,
  TabState,
  QuickLink,
  AutocompleteSuggestion,
  AutocompleteQuery,
  BookmarkCheckResult,
  FindInPageOptions,
  FindInPageDirection,
} from '@browser/ipc-contract'
```

在 `browserAPI` 接口中添加：

```typescript
      // QuickLinks
      getQuickLinks: IpcInvoke['settings:getQuickLinks']
      setQuickLinks: IpcInvoke['settings:setQuickLinks']
      // Autocomplete
      getAutocompleteSuggestions: IpcInvoke['autocomplete:suggestions']
      // Bookmark
      isBookmarked: IpcInvoke['bookmark:isBookmarked']
      // Find in Page
      startFind: (opts: FindInPageOptions) => void
      endFind: IpcInvoke['page:endFind']
      findNext: IpcInvoke['page:findNext']
      findPrevious: IpcInvoke['page:findPrevious']
      onFoundInPage: (handler: (data: { matches: number; activeMatch: number; tabId: string }) => void) => void
      // Tab reorder
      reorderTabs: IpcInvoke['tab:reorder']
```

- [x] **Step 2: 提交**

```bash
git add apps/renderer/src/env.d.ts
git commit -m "feat(renderer): add M3 browserAPI types to env.d.ts"
```

---

### Task 8: NewTab Page

**Files:**
- Create: `apps/renderer/src/views/NewTab.vue`
- Modify: `ChromeUI.vue`（新标签时渲染 NewTab 而非 Viewport）
- Modify: `index.ts`（新标签创建时默认加载 NewTab）

**Interfaces:**
- Consumes: `browserAPI.getQuickLinks`, `browserAPI.setQuickLinks`, `browserAPI.getHistoryList`, `browserAPI.loadURL`
- Produces: 新标签页 UI

- [x] **Step 1: 创建 NewTab.vue**

核心元素：
- 顶部：大搜索框（居中），聚焦时显示搜索引擎选择（Google/Baidu/Bing）
- 中部：快捷网站网格（最多 16 个），点击在新标签页打开
- 底部：最近访问历史（Top 5）

```vue
<template>
  <div class="new-tab">
    <div class="search-box">
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="Search or enter URL"
        @keydown.enter="onSearch"
        @focus="showEngine = true"
        @blur="hideEngine"
      >
      <div
        v-if="showEngine"
        class="engine-select"
      >
        <button
          v-for="engine in engines"
          :key="engine.key"
          class="engine-btn"
          :class="{ active: currentEngine === engine.key }"
          @click="currentEngine = engine.key"
        >
          <Icon :icon="engine.icon" width="16" height="16" />
          {{ engine.label }}
        </button>
      </div>
    </div>
    <div class="quick-links">
      <div
        v-for="link in quickLinks"
        :key="link.id"
        class="quick-link"
        @click="openLink(link.url)"
      >
        <Icon
          v-if="!link.favicon"
          class="quick-link-icon"
          icon="carbon:earth-filled"
          width="20"
          height="20"
        />
        <img
          v-else
          :src="link.favicon"
          class="quick-link-favicon"
        >
        <span class="quick-link-title">{{ link.title }}</span>
      </div>
    </div>
    <div class="recent-history">
      <h3>最近访问</h3>
      <div
        v-for="item in recentHistory"
        :key="item.id"
        class="recent-item"
        @click="openLink(item.url)"
      >
        <Icon
          v-if="!item.favicon"
          class="recent-icon"
          icon="carbon:time"
          width="14"
          height="14"
        />
        <img
          v-else
          :src="item.favicon"
          class="recent-favicon"
        >
        <span class="recent-title">{{ item.title || item.url }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { onMounted, ref } from 'vue'

const searchQuery = ref('')
const showEngine = ref(false)
const currentEngine = ref('google')

const engines = [
  { key: 'google', label: 'Google', icon: 'logos:google-icon' },
  { key: 'baidu', label: 'Baidu', icon: 'logos:baidu-icon' },
  { key: 'bing', label: 'Bing', icon: 'logos:bing' },
]

const quickLinks = ref<{ id: string; title: string; url: string }[]>([])
const recentHistory = ref<{ id: string; url: string; title: string | null; favicon: string | null }[]>([])

function hideEngine(): void {
  setTimeout(() => {
    showEngine.value = false
  }, 200)
}

function onSearch(): void {
  const query = searchQuery.value.trim()
  if (!query) return
  let url = query
  if (!query.startsWith('http://') && !query.startsWith('https://')) {
    const engineUrl = {
      google: 'https://www.google.com/search?q=',
      baidu: 'https://www.baidu.com/s?wd=',
      bing: 'https://www.bing.com/search?q=',
    }[currentEngine.value]
    url = `${engineUrl}${encodeURIComponent(query)}`
  }
  window.browserAPI.loadURL('new-tab', url)
}

function openLink(url: string): void {
  window.browserAPI.loadURL('new-tab', url)
}

async function loadQuickLinks(): Promise<void> {
  quickLinks.value = await window.browserAPI.getQuickLinks()
}

async function loadRecentHistory(): Promise<void> {
  recentHistory.value = await window.browserAPI.getHistoryList({ limit: 5 })
}

onMounted(() => {
  loadQuickLinks()
  loadRecentHistory()
})
</script>

<style scoped>
.new-tab {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 40px;
  padding: 40px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.search-box {
  width: 100%;
  max-width: 600px;
  position: relative;
}

.search-input {
  width: 100%;
  height: 48px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  padding: 0 24px;
  color: var(--text-primary);
  font-size: 16px;
  outline: none;
}

.search-input:focus {
  border-color: var(--accent-color);
}

.search-input::placeholder {
  color: var(--text-muted, #999);
}

.engine-select {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  display: flex;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 8px;
  gap: 4px;
}

.engine-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 8px;
}

.engine-btn:hover,
.engine-btn.active {
  background: var(--bg-tertiary);
}

.quick-links {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 16px;
  max-width: 720px;
  width: 100%;
}

.quick-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.quick-link:hover {
  background: var(--bg-secondary);
}

.quick-link-icon,
.quick-link-favicon {
  width: 24px;
  height: 24px;
}

.quick-link-title {
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  text-align: center;
}

.recent-history {
  max-width: 600px;
  width: 100%;
}

.recent-history h3 {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 12px 0;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.recent-item:hover {
  background: var(--bg-secondary);
}

.recent-icon,
.recent-favicon {
  width: 16px;
  height: 16px;
}

.recent-title {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
```

- [x] **Step 2: 修改 ChromeUI.vue**

在 `ChromeUI` 中，当没有激活标签时渲染 NewTab：

```vue
<template>
  <div class="chrome-ui">
    <TabBar />
    <div
      class="chrome-main"
      :class="{ 'sidebar-open': isSidebarOpen }"
    >
      <div class="chrome-content">
        <AddressBar
          v-if="activeTab"
          :tab-id="activeTab.id"
          :url="activeTab.url"
          :can-go-back="activeTab.canGoBack"
          :can-go-forward="activeTab.canGoForward"
          :is-loading="activeTab.isLoading"
        />
        <NewTab
          v-if="!activeTab"
        />
        <Viewport
          v-if="activeTab"
          :tab-id="activeTab.id"
        />
      </div>
      <div
        class="sidebar-button"
        @click="toggleSidebar"
      >
        <Icon
          :icon="isSidebarOpen ? 'carbon:panel-right-close' : 'carbon:panel-right-open'"
          width="20"
          height="20"
        />
      </div>
    </div>
    <Sidebar
      :is-open="isSidebarOpen"
      @close="isSidebarOpen = false"
    />
  </div>
</template>
```

添加 import：

```typescript
import NewTab from './views/NewTab.vue'
```

- [x] **Step 3: 修改 index.ts**

将新标签创建的默认 URL 改为 `'about:blank'`，由渲染进程加载 NewTab：

```typescript
mainWindow.tabManager.create({ url: 'about:blank' })
```

- [x] **Step 4: 构建验证**

```bash
bun run build && bun run lint
```

Expected: 构建成功，lint 通过

- [x] **Step 5: 提交**

```bash
git add apps/renderer/src/views/NewTab.vue apps/renderer/src/components/ChromeUI.vue apps/main/src/index.ts
git commit -m "feat: add NewTab page with quick links and recent history"
```

---

### Task 9: Find in Page UI

**Files:**
- Create: `apps/renderer/src/components/FindBar.vue`
- Modify: `ChromeUI.vue`（挂载 FindBar）

**Interfaces:**
- Consumes: `browserAPI.startFind`, `browserAPI.endFind`, `browserAPI.findNext`, `browserAPI.findPrevious`
- Produces: 页面内搜索 UI

- [x] **Step 1: 创建 FindBar.vue**

```vue
<template>
  <div
    class="find-bar"
    :class="{ visible: isVisible }"
  >
    <input
      ref="inputRef"
      v-model="searchText"
      class="find-input"
      placeholder="Find in page"
      @keydown.enter="findNext"
      @keydown.esc="close"
      @input="onInput"
    >
    <span class="find-counter">{{ matches > 0 ? `${activeMatch + 1}/${matches}` : '0/0' }}</span>
    <button
      class="find-btn"
      :disabled="matches === 0"
      @click="findPrevious"
    >
      <Icon icon="ic:round-keyboard-arrow-up" width="18" height="18" />
    </button>
    <button
      class="find-btn"
      :disabled="matches === 0"
      @click="findNext"
    >
      <Icon icon="ic:round-keyboard-arrow-down" width="18" height="18" />
    </button>
    <button
      class="find-btn close-btn"
      @click="close"
    >
      <Icon icon="ic:sharp-close" width="20" height="20" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{
  tabId: string
}>()

const isVisible = ref(false)
const searchText = ref('')
const matches = ref(0)
const activeMatch = ref(-1)
const inputRef = ref<HTMLInputElement>()

function onInput(): void {
  const text = searchText.value
  if (text) {
    window.browserAPI.startFind({ tabId: props.tabId, searchText: text })
  } else {
    window.browserAPI.endFind(props.tabId)
  }
}

function findNext(): void {
  window.browserAPI.findNext({ tabId: props.tabId, forward: true })
}

function findPrevious(): void {
  window.browserAPI.findNext({ tabId: props.tabId, forward: false })
}

function close(): void {
  window.browserAPI.endFind(props.tabId)
  isVisible.value = false
  searchText.value = ''
  matches.value = 0
  activeMatch.value = -1
}

function open(): void {
  isVisible.value = true
  nextTick(() => {
    inputRef.value?.focus()
  })
}

function onFoundInPage(data: { matches: number; activeMatch: number; tabId: string }): void {
  if (data.tabId === props.tabId) {
    matches.value = data.matches
    activeMatch.value = data.activeMatch
  }
}

onMounted(() => {
  window.browserAPI.onFoundInPage(onFoundInPage)

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault()
      open()
    } else if (e.key === 'Escape' && isVisible.value) {
      e.preventDefault()
      close()
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('keydown', () => {})
})
</script>

<style scoped>
.find-bar {
  position: absolute;
  top: 78px;
  right: 8px;
  width: 320px;
  height: 40px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 0.2s, transform 0.2s;
  pointer-events: none;
}

.find-bar.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.find-input {
  flex: 1;
  height: 28px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0 10px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.find-input:focus {
  border-color: var(--accent-color);
}

.find-input::placeholder {
  color: var(--text-muted, #999);
}

.find-counter {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 40px;
  text-align: center;
}

.find-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 50%;
}

.find-btn:disabled {
  color: var(--text-muted, #999);
  cursor: default;
}

.find-btn:not(:disabled):hover {
  background: var(--bg-tertiary);
}

.close-btn {
  color: var(--text-secondary);
}

.close-btn:hover {
  color: var(--danger-color);
}
</style>
```

- [x] **Step 2: 修改 ChromeUI.vue**

在 template 中添加 FindBar：

```vue
<FindBar
  v-if="activeTab"
  :tab-id="activeTab.id"
  ref="findBarRef"
/>
```

在 script 中添加：

```typescript
const findBarRef = ref()

// Ctrl+F 快捷键已在 FindBar 内部监听
```

在 style 中添加：

```css
.chrome-main {
  position: relative;
}
```

- [x] **Step 3: 构建验证**

```bash
bun run build && bun run lint
```

Expected: 构建成功，lint 通过

- [x] **Step 4: 提交**

```bash
git add apps/renderer/src/components/FindBar.vue apps/renderer/src/components/ChromeUI.vue
git commit -m "feat: add Find in Page bar sliding out from AddressBar bottom-right"
```

---

### Task 10: 地址栏智能补全

**Files:**
- Create: `apps/renderer/src/components/Autocomplete.vue`
- Modify: `AddressBar.vue`（集成 Autocomplete）

**Interfaces:**
- Consumes: `browserAPI.getAutocompleteSuggestions`
- Produces: 地址栏下拉建议 UI

- [x] **Step 1: 创建 Autocomplete.vue**

```vue
<template>
  <div
    v-if="suggestions.length > 0 && isOpen"
    class="autocomplete"
  >
    <div
      v-for="(item, index) in suggestions"
      :key="item.url"
      class="autocomplete-item"
      :class="{ active: index === activeIndex }"
      @click="select(item.url)"
      @mouseenter="activeIndex = index"
    >
      <Icon
        v-if="item.type === 'history'"
        icon="carbon:time"
        width="14"
        height="14"
      />
      <Icon
        v-else-if="item.type === 'bookmark'"
        icon="carbon:bookmark-filled"
        width="14"
        height="14"
      />
      <Icon
        v-else
        icon="ic:round-search"
        width="14"
        height="14"
      />
      <span class="item-title">{{ item.title }}</span>
      <span class="item-url">{{ item.url }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { ref, watch } from 'vue'

const props = defineProps<{
  query: string
}>()

const emit = defineEmits<{
  select: [url: string]
  close: []
}>()

const suggestions = ref<{ type: 'history' | 'bookmark' | 'search'; title: string; url: string }[]>([])
const isOpen = ref(false)
const activeIndex = ref(-1)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(() => props.query, async (newQuery) => {
  activeIndex.value = -1
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!newQuery.trim()) {
    suggestions.value = []
    isOpen.value = false
    return
  }
  debounceTimer = setTimeout(async () => {
    suggestions.value = await window.browserAPI.getAutocompleteSuggestions({
      query: newQuery,
      limit: 6,
    })
    isOpen.value = suggestions.value.length > 0
  }, 200)
})

function select(url: string): void {
  emit('select', url)
  isOpen.value = false
  suggestions.value = []
}
</script>

<style scoped>
.autocomplete {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 999;
  max-height: 240px;
  overflow-y: auto;
}

.autocomplete-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
}

.autocomplete-item:hover,
.autocomplete-item.active {
  background: var(--bg-tertiary);
}

.item-title {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-url {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
</style>
```

- [x] **Step 2: 修改 AddressBar.vue**

在 template 中的 `<input>` 后添加 Autocomplete：

```vue
<Autocomplete
  :query="urlInput"
  @select="onAutocompleteSelect"
  @close="onAutocompleteClose"
/>
```

在 script 中添加：

```typescript
import Autocomplete from './Autocomplete.vue'

function onAutocompleteSelect(url: string): void {
  window.browserAPI.loadURL(props.tabId, url)
  emit('navigate', url)
}

function onAutocompleteClose(): void {
  // do nothing
}
```

在 style 中添加 `.address-bar` 的定位上下文：

```css
.address-bar {
  position: relative;
}
```

- [x] **Step 3: 构建验证**

```bash
bun run build && bun run lint
```

Expected: 构建成功，lint 通过

- [x] **Step 4: 提交**

```bash
git add apps/renderer/src/components/Autocomplete.vue apps/renderer/src/components/AddressBar.vue
git commit -m "feat: add autocomplete dropdown to AddressBar with history/bookmark suggestions"
```

---

### Task 11: 书签操作 — 地址栏星标按钮

**Files:**
- Modify: `AddressBar.vue`（添加星标按钮）

**Interfaces:**
- Consumes: `browserAPI.isBookmarked`, `browserAPI.addBookmark`, `browserAPI.deleteBookmark`
- Produces: 地址栏书签星标按钮

- [x] **Step 1: 修改 AddressBar.vue**

在 URL 输入框后、缩放按钮前添加星标按钮：

```vue
<button
  class="bookmark-btn"
  :class="{ bookmarked: isBookmarked }"
  @click="toggleBookmark"
>
  <Icon
    :icon="isBookmarked ? 'ic:round-star' : 'ic:round-star-outline'"
    :width="iconSize"
    :height="iconSize"
  />
</button>
```

在 script 中添加：

```typescript
const isBookmarked = ref(false)

async function syncBookmarkStatus(): Promise<void> {
  const url = props.url
  if (url && url.startsWith('http')) {
    const result = await window.browserAPI.isBookmarked(url)
    isBookmarked.value = result.isBookmarked
  }
}

async function toggleBookmark(): Promise<void> {
  const url = props.url
  if (!url || !url.startsWith('http')) return

  if (isBookmarked.value) {
    const result = await window.browserAPI.isBookmarked(url)
    if (result.id) {
      await window.browserAPI.deleteBookmark(result.id)
    }
    isBookmarked.value = false
  } else {
    await window.browserAPI.addBookmark({
      title: url,
      url,
    })
    isBookmarked.value = true
  }
}

watch(
  () => props.url,
  () => {
    syncBookmarkStatus()
  },
)
```

在 style 中添加：

```css
.bookmark-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 50%;
}

.bookmark-btn:not(:disabled):hover {
  background: var(--bg-tertiary);
}

.bookmark-btn.bookmarked {
  color: #f5b041;
}
```

- [x] **Step 2: 构建验证**

```bash
bun run build && bun run lint
```

Expected: 构建成功，lint 通过

- [x] **Step 3: 提交**

```bash
git add apps/renderer/src/components/AddressBar.vue
git commit -m "feat: add bookmark star button to AddressBar"
```

---

### Task 12: 标签拖拽排序

**Files:**
- Modify: `TabBar.vue`（添加 HTML5 Drag and Drop）

**Interfaces:**
- Consumes: `browserAPI.reorderTabs`
- Produces: TabBar 拖拽排序

- [x] **Step 1: 修改 TabBar.vue**

在 script 中添加拖拽状态：

```typescript
const draggingIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

let dragSrcIndex: number | null = null
let isDragging = false
```

在 tab-item 的 template 中添加 drag 属性：

```vue
<div
  v-for="(tab, index) in tabs"
  :key="tab.id"
  class="tab-item"
  :class="{ active: tab.active, incognito: tab.sessionId === 'incognito', dragging: draggingIndex === index, dragOver: dragOverIndex === index }"
  :style="`width:${tabWidth}px;min-width:${tabWidth}px;max-width:${tabWidth}px`"
  :draggable="true"
  @click="activateTab(tab.id)"
  @contextmenu="onTabContextMenu($event, tab)"
  @dragstart="onDragStart($event, index)"
  @dragover="onDragOver($event, index)"
  @dragleave="onDragLeave"
  @drop="onDrop($event, index)"
  @dragend="onDragEnd"
>
```

在 script 中添加拖拽事件处理：

```typescript
function onDragStart(event: DragEvent, index: number): void {
  if (!event.dataTransfer) return
  dragSrcIndex = index
  draggingIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(index))
  isDragging = true
}

function onDragOver(event: DragEvent, index: number): void {
  event.preventDefault()
  if (!isDragging || dragSrcIndex === null || dragSrcIndex === index) return
  dragOverIndex.value = index
}

function onDragLeave(): void {
  dragOverIndex.value = null
}

function onDrop(_event: DragEvent, targetIndex: number): void {
  if (dragSrcIndex === null || dragSrcIndex === targetIndex) {
    dragOverIndex.value = null
    return
  }

  const newOrder = [...tabs.value]
  const [removed] = newOrder.splice(dragSrcIndex, 1)
  newOrder.splice(targetIndex, 0, removed)
  const newIds = newOrder.map((t) => t.id)

  tabs.value = newOrder
  window.browserAPI.reorderTabs(newIds)

  dragOverIndex.value = null
}

function onDragEnd(): void {
  draggingIndex.value = null
  dragOverIndex.value = null
  dragSrcIndex = null
  isDragging = false
}
```

在 style 中添加拖拽样式：

```css
.tab-item.dragging {
  opacity: 0.5;
}

.tab-item.drag-over {
  border-left: 2px solid var(--accent-color);
}
```

- [x] **Step 2: 构建验证**

```bash
bun run build && bun run lint
```

Expected: 构建成功，lint 通过

- [x] **Step 3: 提交**

```bash
git add apps/renderer/src/components/TabBar.vue
git commit -m "feat: add HTML5 drag & drop tab reordering"
```

---

### Task 13: 完整构建 + lint 验证

- [x] **Step 1: 完整构建**

```bash
bun run build
```

- [x] **Step 2: 完整 lint**

```bash
bun run lint
```

- [x] **Step 3: 修复所有 lint 错误**

- [x] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: fix all lint issues for M3"
```

---

### Task 14: E2E 测试更新

**Files:**
- Modify: `e2e/app.spec.ts`

**Interfaces:**
- Produces: M3 功能测试

- [x] **Step 1: 添加 M3 功能测试**

在现有测试基础上增加：
- New Tab Page 可见性测试
- Find Bar 显示/隐藏测试
- Autocomplete 下拉显示测试
- 书签星标按钮测试
- 标签拖拽测试

```typescript
test('new tab page renders', async () => {
  await expect(page.locator('.new-tab')).toBeVisible()
})

test('find bar opens on Ctrl+F', async () => {
  await page.keyboard.press('Control+F')
  await expect(page.locator('.find-bar')).toBeVisible()
})

test('autocomplete dropdown appears on input focus', async () => {
  await page.locator('.url-input').click()
  await page.keyboard.type('test')
  await page.waitForTimeout(250)
  const dropdown = page.locator('.autocomplete')
  await expect(dropdown).toBeVisible()
})

test('bookmark star button exists', async () => {
  await expect(page.locator('.bookmark-btn')).toBeVisible()
})

test('tab reorder via drag', async () => {
  await page.locator('.tab-new').click()
  await expect(page.locator('.tab-item')).toHaveCount(2)
  await page.locator('.tab-item').first().dragTo(page.locator('.tab-item').last())
})
```

- [x] **Step 2: 提交**

```bash
git add e2e/app.spec.ts
git commit -m "test(e2e): add M3 feature tests (newtab/findbar/autocomplete/bookmark/reorder)"
```

---

## 验收标准

- [x] New Tab Page：打开新标签页显示搜索框 + 快捷链接 + 最近访问
- [x] Find in Page：Ctrl+F 打开搜索栏（地址栏下方右对齐），支持翻页
- [x] 地址栏补全：输入时显示历史/书签建议下拉
- [x] 书签星标：地址栏有星标按钮，点击切换收藏
- [x] 标签拖拽：HTML5 DnD 重新排列标签顺序
- [x] 所有 lint/typecheck/build 通过
