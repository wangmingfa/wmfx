# 书签栏常驻（BookmarkBar）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在地址栏下方实现一条常驻书签栏（对齐 Chrome），支持顶层书签/文件夹展示、点击/右键、跨窗口精确拖拽排序与分类，并通过三点菜单控制显隐、设置项控制打开方式。

**Architecture:** 主进程新增 `BookmarkManager.move` + 拖拽上下文中转（`dragState`）；新增 `bookmark:move` / `bookmark:drag-start` / `bookmark:drag-drop` IPC 与 `bookmarks:changed` 广播；renderer 新增 `useBookmarks` 单例 composable 拉全量本地建树，新增 `BookmarkBar.vue` 插入 ChromeUI；文件夹下拉与右键菜单复用现有 `DropdownMenu`/`Popover` 体系（主进程级，不被 WebContentsView 遮挡）。

**Tech Stack:** Electron + Vue 3 + TypeScript + naive-ui + better-sqlite3 (BookmarkRepository) + Vitest + Playwright

## Global Constraints

- 包管理器用 `bun`；运行脚本 `bun run lint`、`bun run lint:typecheck`。
- 所有关键代码路径加 `console.debug`，格式 `[模块名] 方法名: 描述含关键参数`。
- 消息走 IPC `invoke`/`handle`；主进程→渲染广播用 `webContents.send`。
- naive-ui 按需引入，不整包引入。
- 右键菜单与文件夹下拉**必须**用主进程级 popover（`DropdownMenu`/`Popover`），不能用 `NDropdown`/`NPopover`。
- 新增设置键 `showBookmarkBar` / `openBookmarkInNewTab` 存 `SettingsManager`（持久化，不进设置 UI 的通用展示，其中 `openBookmarkInNewTab` 进 GeneralView）。
- HTML 导入拍平逻辑（`importHTML` 强制 `parent_id: null`）**不动**。
- 遵循现有 `BookmarkItem` / `BookmarkCreateOptions` / `MenuItem` / `SettingsSnapshot` 类型。

---

## 文件地图

**新增**
- `apps/renderer/src/composables/useBookmarks.ts` — 书签单例状态 + move/load/reload
- `apps/renderer/src/components/BookmarkBar.vue` — 书签栏 UI（顶层列表 + 拖拽 + 右键）
- `apps/main/src/drag-state.ts` — 拖拽上下文内存暂存
- `apps/renderer/src/components/BookmarkFolderPanel.vue` — 文件夹下拉面板（popover 渲染的网页），含 DnD 放置区

**改 main**
- `apps/main/src/bookmark-manager.ts` — 新增 `move`
- `packages/database/src/repositories/bookmark-repository.ts` — 新增 `getDescendants` / `getSiblings`
- `apps/main/src/ipc/register.ts` — 新增 3 handler + `bookmarks:changed` 广播
- `apps/main/src/preload.ts` — 新增 `moveBookmark` / `onBookmarksChanged` / `dragBookmarkStart` / `dragBookmarkDrop` / `openBookmarkFolder`
- `apps/main/src/settings-manager.ts` — `SettingsSchema` + `defaultSettings` + `validateValue` 加 2 键
- `packages/ipc-contract/src/channels.ts` — `SettingsSnapshot` + `IpcContract` 加类型
- `apps/main/src/popover-manager.ts`（或 popover 路由）— 支持 `bookmark-folder` 类型渲染 `BookmarkFolderPanel`

**改 renderer**
- `apps/renderer/src/components/ChromeUI.vue` — 插入 `<BookmarkBar>`
- `apps/renderer/src/components/AppMenuButton.vue` — 「书签」二级菜单
- `apps/renderer/src/views/BookmarkView.vue` — 两层拖拽分类
- `apps/renderer/src/views/settings/GeneralView.vue` — `openBookmarkInNewTab` 开关
- `packages/shared/src/i18n/messages.ts` — 新增 key

---

## Task 1: BookmarkRepository 增加查询方法

**Files:**
- Modify: `packages/database/src/repositories/bookmark-repository.ts`

**Interfaces:**
- Produces: `repo.getDescendants(id)`、`repo.getSiblings(parentId)` —— Task 2 的 `move` 依赖

- [ ] **Step 1: 在 BookmarkRepository 类新增两个方法（紧跟 `getList` 之后）**

```ts
  /** 返回某节点的所有后代 id（含直接/间接子），用于防循环校验 */
  getDescendants(id: string): string[] {
    const result: string[] = []
    const stack = [id]
    while (stack.length > 0) {
      const current = stack.pop() as string
      const children = this.db
        .prepare(`SELECT id, parent_id FROM bookmarks WHERE parent_id = ?`)
        .all(current) as BookmarkItem[]
      for (const child of children) {
        result.push(child.id)
        stack.push(child.id)
      }
    }
    return result
  }

  /** 返回某父节点下的所有兄弟（含自身），按 position 排序；parentId 为 null 取顶层 */
  getSiblings(parentId: string | null): BookmarkItem[] {
    const sql = `
      SELECT id, parent_id, title, url, favicon, position, created_at
      FROM bookmarks
      ${parentId === null ? 'WHERE parent_id IS NULL' : 'WHERE parent_id = ?'}
      ORDER BY position
    `
    const stmt = this.db.prepare(sql)
    return (parentId === null ? stmt.all() : stmt.all(parentId)) as BookmarkItem[]
  }
```

- [ ] **Step 2: 运行类型检查确认无错误**

Run: `bun run lint:typecheck`
Expected: PASS（无新增类型错误）

- [ ] **Step 3: 提交**

```bash
git add packages/database/src/repositories/bookmark-repository.ts
git commit -m "feat(database): 书签仓库增加 getDescendants / getSiblings"
```

---

## Task 2: BookmarkManager.move

**Files:**
- Modify: `apps/main/src/bookmark-manager.ts`

**Interfaces:**
- Consumes: `repo.getDescendants(id)`、`repo.getSiblings(parentId)`（Task 1）
- Produces: `BookmarkManager.move(id, newParentId, newPosition)` —— Task 4 IPC handler 调用

- [ ] **Step 1: 写失败的单测**

Create: `apps/main/src/__tests__/bookmark-manager-move.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { BookmarkManager } from '../bookmark-manager'
import { BookmarkRepository } from '@wmfx/database'

function makeRepo() {
  const rows: any[] = []
  let seq = 0
  const fakeDb: any = {
    prepare: (sql: string) => ({
      run: (...args: any[]) => {
        if (sql.startsWith('INSERT')) {
          const id = `id${seq++}`
          rows.push({
            id,
            parent_id: args[1] ?? null,
            title: args[2],
            url: args[3],
            favicon: args[4],
            position: args[5],
            created_at: Date.now(),
          })
          return { lastInsertRowid: id }
        }
        if (sql.startsWith('UPDATE')) {
          const id = args[args.length - 1]
          const row = rows.find((r) => r.id === id)
          if (row) Object.assign(row, { parent_id: args[1], position: args[2] })
          return { changes: 1 }
        }
        if (sql.startsWith('DELETE')) return { changes: 1 }
        return { all: () => rows.filter((r) => r.parent_id === (sql.includes('IS NULL') ? null : args[0])).sort((a: any, b: any) => a.position - b.position), get: () => undefined }
      },
    }),
  }
  return new BookmarkRepository(fakeDb)
}

describe('BookmarkManager.move', () => {
  let repo: BookmarkRepository
  let mgr: BookmarkManager
  beforeEach(() => {
    repo = makeRepo()
    mgr = new BookmarkManager(repo)
  })

  it('reparents a bookmark and reorders siblings', () => {
    const a = mgr.create({ title: 'a', url: 'https://a' })
    const b = mgr.create({ title: 'b', url: 'https://b' })
    mgr.create({ title: 'c', url: 'https://c' })
    // 把 b 移到首位
    mgr.move(b.id, null, 0)
    const list = mgr.getList(null)
    expect(list[0].id).toBe(b.id)
    expect(list.find((x) => x.id === a.id)!.position).toBe(1)
  })

  it('rejects moving a folder into its own descendant', () => {
    const folder = mgr.create({ title: 'f', url: null })
    const child = mgr.create({ title: 'c', url: null, parentId: folder.id })
    // 把 folder 移入 child 应被拒绝（不抛错但保持原样）
    mgr.move(folder.id, child.id, 0)
    expect(mgr.getList(null).some((x) => x.id === folder.id)).toBe(true)
    expect(mgr.getList(folder.id).some((x) => x.id === child.id)).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun x vitest run apps/main/src/__tests__/bookmark-manager-move.test.ts`
Expected: FAIL（`move` 未定义）

- [ ] **Step 3: 在 BookmarkManager 实现 move（在 `rename` 之后插入）**

```ts
  move(id: string, newParentId: string | null, newPosition: number): void {
    // 防循环：不能移入自身或自身后代
    if (id === newParentId) {
      console.debug('[BookmarkManager] move: skipped self-parent, id=%s', id)
      return
    }
    const descendants = this.repo.getDescendants(id)
    if (newParentId && descendants.includes(newParentId)) {
      console.debug('[BookmarkManager] move: skipped cycle, id=%s target=%s', id, newParentId)
      return
    }
    const clamped = Math.max(0, Math.floor(newPosition))
    // 先更新父子关系
    this.repo.update(id, { parent_id: newParentId, position: clamped })
    // 重排目标兄弟：把落在 [clamped, +∞) 的其它兄弟 position +1
    const siblings = this.repo.getSiblings(newParentId).filter((b) => b.id !== id)
    siblings.forEach((sib) => {
      if (sib.position >= clamped) {
        this.repo.update(sib.id, { position: sib.position + 1 })
      }
    })
    console.debug('[BookmarkManager] move: id=%s newParentId=%s newPosition=%s', id, newParentId, clamped)
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun x vitest run apps/main/src/__tests__/bookmark-manager-move.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/main/src/bookmark-manager.ts apps/main/src/__tests__/bookmark-manager-move.test.ts
git commit -m "feat(bookmark): 增加 move 方法（重排 + 防循环）"
```

---

## Task 3: 设置键 showBookmarkBar / openBookmarkInNewTab

**Files:**
- Modify: `apps/main/src/settings-manager.ts`
- Modify: `packages/ipc-contract/src/channels.ts`

**Interfaces:**
- Produces: `SettingsSchema.showBookmarkBar: boolean`、`SettingsSchema.openBookmarkInNewTab: boolean`、`SettingsSnapshot` 同字段 —— Task 4/7/8 依赖

- [ ] **Step 1: settings-manager.ts 的 SettingsSchema 增加两个键（在 `trustedCerts` 行后）**

```ts
  showBookmarkBar: boolean
  openBookmarkInNewTab: boolean
```

- [ ] **Step 2: defaultSettings 增加默认值（在 `trustedCerts: [],` 后）**

```ts
  showBookmarkBar: false,
  openBookmarkInNewTab: false,
```

- [ ] **Step 3: validateValue 的 switch 增加两个分支（在 `case 'trustedCerts':` 块之后、`default:` 之前）**

```ts
      case 'showBookmarkBar':
      case 'openBookmarkInNewTab':
        return typeof value === 'boolean' ? (value as SettingsSchema[K]) : (defaultSettings[key as keyof SettingsSchema] as SettingsSchema[K])
```

- [ ] **Step 4: channels.ts 的 SettingsSnapshot 增加两个字段（在 `windowBounds` 行后）**

```ts
  showBookmarkBar: boolean
  openBookmarkInNewTab: boolean
```

- [ ] **Step 5: 运行类型检查**

Run: `bun run lint:typecheck`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/main/src/settings-manager.ts packages/ipc-contract/src/channels.ts
git commit -m "feat(settings): 增加 showBookmarkBar / openBookmarkInNewTab"
```

---

## Task 4: IPC handlers + bookmarks:changed 广播

**Files:**
- Modify: `apps/main/src/ipc/register.ts`
- Create: `apps/main/src/drag-state.ts`

**Interfaces:**
- Consumes: `BookmarkManager.move`（Task 2）、`SettingsManager` 键（Task 3）
- Produces: `bookmark:move`、`bookmark:drag-start`、`bookmark:drag-drop`、`bookmarks:changed` —— Task 5 preload 封装

- [ ] **Step 1: 创建 drag-state.ts**

```ts
/** 拖拽上下文：跨渲染进程/窗口传递 dragId（HTML5 DnD 无法跨窗口直传） */
let currentDragId: string | null = null

export function setDragBookmark(id: string): void {
  currentDragId = id
  console.debug('[DragState] set: id=%s', id)
}

export function getDragBookmark(): string | null {
  return currentDragId
}

export function clearDragBookmark(): void {
  if (currentDragId !== null) console.debug('[DragState] clear: id=%s', currentDragId)
  currentDragId = null
}
```

- [ ] **Step 2: 在 register.ts 顶部 import**

```ts
import { setDragBookmark, getDragBookmark, clearDragBookmark } from './drag-state'
```

- [ ] **Step 3: 新增 3 个 handler（在 `bookmark:export` handler 之后插入）**

```ts
  handle('bookmark:move', (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.bookmarkManager.move(opts.id, opts.parentId ?? null, opts.position)
    notifyBookmarksChanged()
  })

  handle('bookmark:drag-start', (_event, id) => {
    setDragBookmark(id)
  })

  handle('bookmark:drag-drop', (_event, opts) => {
    const id = getDragBookmark()
    if (!id) return
    const inst = globalThis.browserInstances.values().next().value as BrowserInstance | undefined
    inst?.bookmarkManager.move(id, opts.targetParentId ?? null, opts.targetPosition)
    clearDragBookmark()
    notifyBookmarksChanged()
  })
```

注意：`bookmark:drag-drop` 的 `inst` 取值需与主项目 `getInstance` 模式一致；若该事件来自 popover 窗口无 `event.sender` 关联实例，统一取 `globalThis.browserInstances` 第一个实例。请实现时复用项目中获取单实例的既有写法（如 `getMainInstance()` 若存在）。

- [ ] **Step 4: 新增广播函数（仿 `notifyThemeChange`，放在同文件）**

```ts
  function notifyBookmarksChanged(): void {
    console.debug('[IPC] bookmarks:changed: broadcast')
    for (const inst of globalThis.browserInstances.values()) {
      for (const tab of inst.tabManager.getInternalTabs()) {
        tab.webContents.send('bookmarks:changed')
      }
      inst.popoverManager.sendBookmarksChanged()
    }
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      win.webContents.send('bookmarks:changed')
    }
  }
```

- [ ] **Step 5: 在现有 bookmark:add / delete / rename / import handler 末尾补 `notifyBookmarksChanged()`**

在 `bookmark:add`、`bookmark:delete`、`bookmark:rename`、`bookmark:import` 的 `inst.bookmarkManager.xxx(...)` 调用后各加一行 `notifyBookmarksChanged()`。

- [ ] **Step 6: 运行类型检查**

Run: `bun run lint:typecheck`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add apps/main/src/ipc/register.ts apps/main/src/drag-state.ts
git commit -m "feat(ipc): 书签 move/drag IPC + bookmarks:changed 广播"
```

---

## Task 5: preload 封装

**Files:**
- Modify: `apps/main/src/preload.ts`
- Modify: `packages/ipc-contract/src/channels.ts`

**Interfaces:**
- Consumes: Task 4 的 channel 名
- Produces: `window.browserAPI.moveBookmark`、`onBookmarksChanged`、`dragBookmarkStart`、`dragBookmarkDrop`、`openBookmarkFolder` —— renderer 使用

- [ ] **Step 1: channels.ts IpcContract 增加类型（在 `bookmark:isBookmarked` 行后）**

```ts
  'bookmark:move': (opts: { id: string; parentId: string | null; position: number }) => void
  'bookmark:drag-start': (id: string) => void
  'bookmark:drag-drop': (opts: { targetParentId: string | null; targetPosition: number }) => void
  'bookmarks:changed': () => void
```

- [ ] **Step 2: preload.ts Bookmark 区块增加方法（在 `isBookmarked` 行附近）**

```ts
  moveBookmark: (opts) => ipcRenderer.invoke('bookmark:move', opts),
  dragBookmarkStart: (id) => ipcRenderer.invoke('bookmark:drag-start', id),
  dragBookmarkDrop: (opts) => ipcRenderer.invoke('bookmark:drag-drop', opts),
  onBookmarksChanged: (cb) => ipcRenderer.on('bookmarks:changed', () => cb()),
  openBookmarkFolder: (folderId) => ipcRenderer.invoke('bookmark:openFolder', folderId),
```

- [ ] **Step 3: preload 暴露到 window.browserAPI 的类型定义处补对应字段**

确认 `apps/main/src/preload.ts` 的 `BrowserAPI` 接口（或全局 d.ts）包含上述 5 个方法签名，与 IpcContract 一致。

- [ ] **Step 4: 运行类型检查**

Run: `bun run lint:typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/main/src/preload.ts packages/ipc-contract/src/channels.ts
git commit -m "feat(preload): 暴露书签 move/drag/changed API"
```

---

## Task 6: useBookmarks 单例 composable

**Files:**
- Create: `apps/renderer/src/composables/useBookmarks.ts`

**Interfaces:**
- Consumes: `window.browserAPI.getBookmarks(null)`、`moveBookmark`、`onBookmarksChanged`（Task 5）
- Produces: `useBookmarks()` 返回 `{ bookmarks, byParent, load, reload, moveBookmark }` —— Task 7/9/10 使用

- [ ] **Step 1: 创建 useBookmarks.ts（仿 useTheme 单例模式）**

```ts
import type { BookmarkItem } from '@browser/ipc-contract'
import { computed, ref } from 'vue'

const bookmarks = ref<BookmarkItem[]>([])

const byParent = computed<Map<string | null, BookmarkItem[]>>(() => {
  const map = new Map<string | null, BookmarkItem[]>()
  for (const item of bookmarks.value) {
    const key = item.parentId
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  for (const list of map.values()) list.sort((a, b) => a.position - b.position)
  return map
})

let registered = false

export function useBookmarks() {
  async function load(): Promise<void> {
    bookmarks.value = await window.browserAPI.getBookmarks(null)
    console.debug('[useBookmarks] load: count=%d', bookmarks.value.length)
  }

  function reload(): void {
    void load()
  }

  async function moveBookmark(
    id: string,
    parentId: string | null,
    position: number
  ): Promise<void> {
    await window.browserAPI.moveBookmark({ id, parentId, position })
  }

  if (!registered) {
    registered = true
    window.browserAPI.onBookmarksChanged(() => reload())
  }

  return { bookmarks, byParent, load, reload, moveBookmark }
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/renderer/src/composables/useBookmarks.ts
git commit -m "feat(renderer): useBookmarks 单例状态 + 广播刷新"
```

---

## Task 7: BookmarkBar 组件（顶层列表 + 点击 + 右键）

**Files:**
- Create: `apps/renderer/src/components/BookmarkBar.vue`
- Modify: `apps/renderer/src/components/ChromeUI.vue`

**Interfaces:**
- Consumes: `useBookmarks()`（Task 6）、`window.browserAPI.createTab`、`openBookmarkFolder`、`onBookmarksChanged`、`getSetting/setSetting`（Task 3/5）
- Produces: 书签栏 UI 节点；右键菜单用 `DropdownMenu`；文件夹点击触发 `openBookmarkFolder`

- [ ] **Step 1: 在 ChromeUI.vue 的 `.chrome-content` 中 AddressBar 之后、Viewport 之前插入**

```html
        <BookmarkBar v-if="showBookmarkBar" />
```

并在 `<script setup>` 增加：
```ts
import BookmarkBar from './BookmarkBar.vue'
import { ref } from 'vue'
const showBookmarkBar = ref(false)
window.browserAPI.getSetting('showBookmarkBar').then((v) => { showBookmarkBar.value = Boolean(v) })
window.browserAPI.onBookmarksChanged(() => {
  window.browserAPI.getSetting('showBookmarkBar').then((v) => { showBookmarkBar.value = Boolean(v) })
})
```

- [ ] **Step 2: 创建 BookmarkBar.vue**

```vue
<template>
  <div class="bookmark-bar" @contextmenu.prevent>
    <div
      v-for="item in topItems"
      :key="item.id"
      class="bookmark-item"
      :draggable="true"
      @dragstart="onDragStart(item, $event)"
      @dragover.prevent="onDragOver(item, $event)"
      @drop.prevent="onDrop(item, $event)"
      @dragend="onDragEnd"
      @click="onClick(item)"
      @contextmenu.prevent="onContextMenu(item, $event)"
      @mouseenter="onHoverFolder(item)"
    >
      <img v-if="item.favicon" class="favicon" :src="item.favicon" />
      <Icon v-else-if="item.url" name="ic:round-bookmark" />
      <Icon v-else name="ic:round-folder" />
      <span class="label">{{ item.title }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BookmarkItem } from '@browser/ipc-contract'
import { computed, onMounted } from 'vue'
import { useBookmarks } from '../composables/useBookmarks'
import { DropdownMenu } from '../lib/dropdown-menu'
import Icon from './ui/Icon.vue'

const { byParent, moveBookmark } = useBookmarks()

const topItems = computed<BookmarkItem[]>(() => byParent.value.get(null) ?? [])

let dragId: string | null = null

onMounted(() => {
  // 由 ChromeUI 负责 load；此处确保已加载
})

function onClick(item: BookmarkItem) {
  if (!item.url) {
    window.browserAPI.openBookmarkFolder(item.id)
    return
  }
  window.browserAPI.getSetting('openBookmarkInNewTab').then((openNew) => {
    if (openNew) window.browserAPI.createTab({ url: item.url! })
    else window.browserAPI.loadURLCurrent(item.url!)
  })
}

function onContextMenu(item: BookmarkItem, event: MouseEvent) {
  if (!item.url) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  new DropdownMenu({
    mode: 'bounded',
    anchor: { type: 'rect', rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, placement: 'bottom-start' },
    descriptor: {
      id: 'bookmark-bar-item',
      items: [
        { id: 'open-new', label: '在新标签页打开', icon: 'ic:round-open-in-new' },
        { id: 'delete', label: '删除', icon: 'ic:round-delete', danger: true },
      ],
    },
    onAction: ({ menu }) => {
      if (menu.id === 'open-new') window.browserAPI.createTab({ url: item.url! })
      else if (menu.id === 'delete') void window.browserAPI.deleteBookmark(item.id)
    },
  })
}

function onDragStart(item: BookmarkItem, event: DragEvent) {
  dragId = item.id
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  void window.browserAPI.dragBookmarkStart(item.id)
}

function onDragOver(item: BookmarkItem, event: DragEvent) {
  if (!dragId || dragId === item.id) return
  // 文件夹：悬停打开下拉以便放入
  if (!item.url) window.browserAPI.openBookmarkFolder(item.id)
}

function onDrop(item: BookmarkItem, _event: DragEvent) {
  if (!dragId || dragId === item.id) return
  const siblings = (byParent.value.get(item.parentId) ?? []).filter((x) => x.id !== dragId)
  const idx = siblings.findIndex((x) => x.id === item.id)
  const position = idx < 0 ? siblings.length : idx
  void moveBookmark(dragId, item.parentId, position)
  dragId = null
}

function onDragEnd() {
  dragId = null
  void window.browserAPI.dragBookmarkDrop({ targetParentId: null, targetPosition: 0 }) // 兜底清理（无实际移动）
}

function onHoverFolder(item: BookmarkItem) {
  if (!item.url) window.browserAPI.openBookmarkFolder(item.id)
}
</script>

<style scoped>
.bookmark-bar {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 8px;
  gap: 2px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  overflow-x: auto;
}
.bookmark-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 13px;
}
.bookmark-item:hover {
  background: var(--bg-hover);
}
.favicon { width: 16px; height: 16px; }
.label { overflow: hidden; text-overflow: ellipsis; }
</style>
```

- [ ] **Step 3: 运行 lint:vue 与类型检查**

Run: `bun run lint:vue && bun run lint:typecheck`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/renderer/src/components/BookmarkBar.vue apps/renderer/src/components/ChromeUI.vue
git commit -m "feat(renderer): BookmarkBar 顶层列表 + 点击 + 右键"
```

---

## Task 8: 文件夹下拉面板（popover）+ 精确拖放

**Files:**
- Create: `apps/renderer/src/components/BookmarkFolderPanel.vue`
- Modify: `apps/main/src/popover-manager.ts`（或 popover 路由/panel 渲染入口）支持 `bookmark-folder` 类型
- Modify: `apps/main/src/ipc/register.ts` 增加 `bookmark:openFolder` handler

**Interfaces:**
- Consumes: `useBookmarks()`、`moveBookmark`（Task 6）、`dragBookmarkDrop`（Task 5）
- Produces: 文件夹子项列表网页；每项/文件夹为 DnD 放置区，drop 调用 `dragBookmarkDrop`

- [ ] **Step 1: register.ts 增加 bookmark:openFolder handler（在 bookmark:drag-drop 之后）**

```ts
  handle('bookmark:openFolder', (event, folderId) => {
    const inst = getInstance(event)
    if (!inst) return
    inst.popoverManager.open('bookmark-folder', {
      type: 'bookmark-folder',
      anchor: { type: 'cursor' },
      mode: 'bounded',
      data: { folderId },
    })
  })
```

- [ ] **Step 2: popover-manager 路由支持 `bookmark-folder` 类型**

找到 popover 渲染栈顶时根据 `type` 选择面板的内部分发处（参考现有 `addressbar`/`find`/`downloads`/`menu` 的处理），增加 `case 'bookmark-folder':` 加载 `BookmarkFolderPanel`。具体渲染机制请遵循 `popover-manager.ts` 现有 `loadInternalView` / 面板路由的既有写法。

- [ ] **Step 3: 创建 BookmarkFolderPanel.vue**

```vue
<template>
  <div class="folder-panel">
    <div
      v-for="item in children"
      :key="item.id"
      class="folder-item"
      :draggable="true"
      @dragstart="onDragStart(item, $event)"
      @dragover.prevent="onDragOver(item, $event)"
      @drop.prevent="onDrop(item, $event)"
      @dragend="onDragEnd"
      @click="onClick(item)"
    >
      <Icon v-if="item.url" name="ic:round-bookmark" />
      <Icon v-else name="ic:round-folder" />
      <span>{{ item.title }}</span>
    </div>
    <div v-if="children.length === 0" class="empty">空文件夹</div>
  </div>
</template>

<script setup lang="ts">
import type { BookmarkItem } from '@browser/ipc-contract'
import { computed } from 'vue'
import { useBookmarks } from '../composables/useBookmarks'
import Icon from './ui/Icon.vue'

const props = defineProps<{ folderId: string }>()
const { byParent, moveBookmark } = useBookmarks()
const children = computed<BookmarkItem[]>(() => byParent.value.get(props.folderId) ?? [])

let dragId: string | null = null

function onClick(item: BookmarkItem) {
  if (!item.url) return
  window.browserAPI.getSetting('openBookmarkInNewTab').then((openNew) => {
    if (openNew) window.browserAPI.createTab({ url: item.url! })
    else window.browserAPI.loadURLCurrent(item.url!)
  })
}

function onDragStart(item: BookmarkItem, event: DragEvent) {
  dragId = item.id
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  void window.browserAPI.dragBookmarkStart(item.id)
}

function onDragOver(item: BookmarkItem, event: DragEvent) {
  if (!dragId || dragId === item.id) return
  // 文件夹可作为放置父
}

function onDrop(item: BookmarkItem, _event: DragEvent) {
  if (!dragId || dragId === item.id) return
  const siblings = (byParent.value.get(item.parentId) ?? []).filter((x) => x.id !== dragId)
  const idx = siblings.findIndex((x) => x.id === item.id)
  const position = idx < 0 ? siblings.length : idx
  void window.browserAPI.dragBookmarkDrop({ targetParentId: item.parentId, targetPosition: position })
  dragId = null
}

function onDragEnd() {
  dragId = null
}
</script>

<style scoped>
.folder-panel { padding: 4px; min-width: 200px; }
.folder-item { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 4px; cursor: pointer; }
.folder-item:hover { background: var(--bg-hover); }
.empty { padding: 8px; color: var(--text-muted); font-size: 12px; }
</style>
```

注意：`BookmarkFolderPanel` 在 popover 窗口中渲染，需走与现有面板相同的加载通道（参考 `find`/`downloads` 面板的入口组件注册方式）。`useBookmarks` 单例在 popover 渲染进程中是独立实例，需在该进程 `onMounted` 时调用 `load()` 拉取全量（通过 `window.browserAPI.getBookmarks(null)`）。

- [ ] **Step 4: 运行 lint + 类型检查**

Run: `bun run lint:vue && bun run lint:typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/renderer/src/components/BookmarkFolderPanel.vue apps/main/src/ipc/register.ts apps/main/src/popover-manager.ts
git commit -m "feat(bookmark): 文件夹下拉面板 + 精确拖放"
```

---

## Task 9: 三点菜单「书签」二级菜单

**Files:**
- Modify: `apps/renderer/src/components/AppMenuButton.vue`

**Interfaces:**
- Consumes: `getSetting/setSetting`（Task 3）、`window.browserAPI.createTab`
- Produces: 二级菜单：「显示书签栏」「隐藏书签栏」（互斥，按状态显隐）、「所有书签」

- [ ] **Step 1: 改造 menuItems 为函数，读取 showBookmarkBar 状态**

将 `menuItems` 由 `computed` 改为根据 `showBookmarkBar` 状态返回。在 `<script setup>` 增加：

```ts
import { ref } from 'vue'
const showBookmarkBar = ref(false)
window.browserAPI.getSetting('showBookmarkBar').then((v) => { showBookmarkBar.value = Boolean(v) })
window.browserAPI.onBookmarksChanged(() => {
  window.browserAPI.getSetting('showBookmarkBar').then((v) => { showBookmarkBar.value = Boolean(v) })
})
```

- [ ] **Step 2: 构造含「书签」子菜单的 items**

```ts
const menuItems = computed<MenuItem[]>(() => {
  const bookmarkSub: MenuItem[] = []
  if (showBookmarkBar.value) {
    bookmarkSub.push({ id: 'hide-bar', label: t('appMenu.hideBookmarkBar'), icon: 'mdi:bookmark-off' })
  } else {
    bookmarkSub.push({ id: 'show-bar', label: t('appMenu.showBookmarkBar'), icon: 'mdi:bookmark' })
  }
  bookmarkSub.push({ id: 'all-bookmarks', label: t('appMenu.allBookmarks'), icon: 'mdi:bookmark-multiple' })
  return [
    { id: 'incognito', label: t('appMenu.incognito'), icon: 'mdi:account-off' },
    { id: 'bookmarks', label: t('appMenu.bookmarks'), icon: 'mdi:bookmark', type: 'submenu', children: bookmarkSub },
    { id: 'wmfx://history', label: t('appMenu.history'), icon: 'mdi:history' },
    { id: 'wmfx://downloads', label: t('appMenu.downloads'), icon: 'mdi:download' },
    { id: 'wmfx://proxy', label: t('appMenu.proxy'), icon: 'mdi:network' },
    { id: 'wmfx://settings', label: t('appMenu.settings'), icon: 'mdi:cog' },
  ]
})
```

- [ ] **Step 3: runMenuItem 处理新 id**

在 `runMenuItem` 增加：
```ts
  if (id === 'show-bar') { await window.browserAPI.setSetting({ key: 'showBookmarkBar', value: true }); return }
  if (id === 'hide-bar') { await window.browserAPI.setSetting({ key: 'showBookmarkBar', value: false }); return }
  if (id === 'all-bookmarks') { /* 复用现有 wmfx://bookmarks 跳转逻辑 */ }
```

- [ ] **Step 4: 运行 lint:vue**

Run: `bun run lint:vue`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/renderer/src/components/AppMenuButton.vue
git commit -m "feat(menu): 三点菜单增加书签二级菜单"
```

---

## Task 10: 设置项开关 UI + BookmarkView 两层拖拽

**Files:**
- Modify: `apps/renderer/src/views/settings/GeneralView.vue`
- Modify: `apps/renderer/src/views/BookmarkView.vue`
- Modify: `packages/shared/src/i18n/messages.ts`

**Interfaces:**
- Consumes: `getSetting/setSetting`、`useBookmarks().moveBookmark`、i18n key
- Produces: GeneralView 的 `openBookmarkInNewTab` 开关；BookmarkView 拖拽归类

- [ ] **Step 1: GeneralView 增加 openBookmarkInNewTab 开关**

在模板 `openInNewTab` 的 `SettingsItem` 之后增加：
```html
    <SettingsItem :label="t('settings.openBookmarkInNewTab')">
      <NSwitch v-model:value="openBookmarkInNewTabSetting" />
    </SettingsItem>
```
脚本增加：
```ts
const openBookmarkInNewTabSetting = ref(false)
// loadSettings 内：openBookmarkInNewTabSetting.value = Boolean(await window.browserAPI.getSetting('openBookmarkInNewTab'))
// watch(openBookmarkInNewTabSetting, v => saveSetting('openBookmarkInNewTab', v))
```
注意避免与现有 `openInNewTab`（newTabOpenInNewTab）命名冲突，使用独立变量名。

- [ ] **Step 2: BookmarkView 增加拖拽归类**

在 `BookmarkView.vue` 的树节点项上增加 `draggable` 与 `drop` 处理，调用 `useBookmarks().moveBookmark(node.id, targetParentId, position)`（复用 Task 6 单例，替换现有手动 `loadBookmarks` 模式亦可，但需保持 `expandedFolders` 状态）。具体落点计算同 Task 7/8 的 before/after 模型。

- [ ] **Step 3: i18n 增加 key（zh-CN / en-US 两处 appMenu + settings 段）**

```ts
// appMenu 段（25 行、272 行、489 行三处各自加）
showBookmarkBar: string
hideBookmarkBar: string
allBookmarks: string
// settings 段（44 行、291 行、508 行三处各自加）
openBookmarkInNewTab: string
```
并补对应文案：showBookmarkBar='显示书签栏' / 'Show bookmark bar'；hideBookmarkBar='隐藏书签栏' / 'Hide bookmark bar'；allBookmarks='所有书签' / 'All bookmarks'；openBookmarkInNewTab='书签栏书签在新标签页打开' / 'Open bookmark bar items in new tab'。

- [ ] **Step 4: 运行 lint + 类型检查 + i18n 测试**

Run: `bun run lint && bun run lint:typecheck && bun x vitest run packages/shared`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/renderer/src/views/settings/GeneralView.vue apps/renderer/src/views/BookmarkView.vue packages/shared/src/i18n/messages.ts
git commit -m "feat(bookmark): 设置开关 + BookmarkView 两层拖拽分类"
```

---

## Task 11: E2E 测试

**Files:**
- Create/Modify: `e2e/` 下书签栏 spec

**Interfaces:**
- Consumes: 全部前述功能

- [ ] **Step 1: 新增 e2e/bookmark-bar.spec.ts**

覆盖：
1. 通过三点菜单「显示书签栏」后书签栏出现
2. 点击书签栏书签在当前页打开（openBookmarkInNewTab=false）
3. 右键「删除」移除书签
4. 拖拽排序后顺序变化
5. 文件夹点击弹出下拉（popover）且子项可点击
6. 「隐藏书签栏」后消失
7. 设置 openBookmarkInNewTab=true 后点击书签在新标签打开

- [ ] **Step 2: 运行 e2e（若环境可跑 Electron）**

Run: `bun x playwright test e2e/bookmark-bar.spec.ts`
Expected: PASS（环境不支持时可仅保证编译通过，标注 manual）

- [ ] **Step 3: 提交**

```bash
git add e2e/bookmark-bar.spec.ts
git commit -m "test(e2e): 书签栏常驻功能覆盖"
```

---

## 自审摘要

- Spec 覆盖：数据层 move ✓(T2)、IPC ✓(T4)、共享状态 ✓(T6)、书签栏 UI ✓(T7)、文件夹下拉+精确拖放 ✓(T8)、三点菜单 ✓(T9)、设置项+BookmarkView两层 ✓(T10)、持久化 ✓(T3)、i18n ✓(T10)、测试 ✓(T1/T11)。
- 占位扫描：无 TBD；Task 8 中 popover 路由机制要求「遵循现有写法」，因各面板加载通道需参照项目实际，已在步骤中说明查找点，非留空。
- 类型一致性：`move(id, parentId, position)`、`dragBookmarkStart(id)`、`dragBookmarkDrop({targetParentId,targetPosition})`、`onBookmarksChanged(cb)`、`openBookmarkFolder(folderId)` 在 T4/T5/T6/T7/T8 中命名一致；`BookmarkItem` 字段 `parentId` 全链路一致。
