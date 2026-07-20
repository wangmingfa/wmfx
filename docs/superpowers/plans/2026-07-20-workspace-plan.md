# Workspace (Arc-style Spaces) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Arc-style Spaces — multiple isolated browsing contexts (tabs, bookmarks, session) within a single window, switchable via a popover panel.

**Architecture:** Each Workspace maps to an Electron session partition (`persist:space-{id}`), providing true Cookie/cache/localStorage isolation. WorkspaceManager handles CRUD + switching logic. WorkspacePanel renders via the existing Popover system. TabManager gains a `workspaceId` dimension without interface changes.

**Tech Stack:** SQLite (better-sqlite3), Electron session partitions, Vue 3 + Naive UI, Popover system (WebContentsView)

## Global Constraints

- Package manager: `bun` (not pnpm, not npm)
- Lint: `bun run lint` (biome TS + eslint Vue + typecheck)
- Format: `bun run format`
- Logging: `console.debug` for dev, `console.info` for key paths, template string interpolation (no `%s`)
- Vue components: `<style lang="less">`, CSS variables from `style.css`, Naive UI按需引入
- i18n: all user-facing strings must be added to both `zh-CN` and `en-US` locales
- No `%s` in log messages — use template literals
- Follow existing patterns in the codebase exactly

---

## Task 1: Database — workspace table + bookmark.workspace_id

**Files:**
- Modify: `packages/database/src/database.ts` (add table + migration)
- Create: `packages/database/src/repositories/workspace-repository.ts`
- Modify: `packages/database/src/index.ts` (export WorkspaceRepository)

**Interfaces:**
- Produces: `WorkspaceRepository` class with `list()`, `getById(id)`, `create(w)`, `update(id, patch)`, `delete(id)`, `reorder(ids)`, `getTabState(workspaceId)`, `setTabState(workspaceId, tabs, activeIndex)`

- [ ] **Step 1: Add workspace table to initTables()**

In `packages/database/src/database.ts`, inside `initTables()` method (after the subscriptions CREATE TABLE), add:

```ts
db.exec(`
  CREATE TABLE IF NOT EXISTS workspace (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#636e72',
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)
```

- [ ] **Step 2: Add migration for bookmark.workspace_id**

In `packages/database/src/database.ts`, in the migrations section (after existing try/catch ALTER TABLE blocks), add:

```ts
try {
  db.exec(`ALTER TABLE bookmarks ADD COLUMN workspace_id TEXT`)
} catch {
  // column already exists
}
```

- [ ] **Step 3: Create WorkspaceRepository**

Create `packages/database/src/repositories/workspace-repository.ts`:

```ts
import type { Database as BetterSqlite3Db } from 'better-sqlite3'

export interface WorkspaceRecord {
  id: string
  name: string
  color: string
  position: number
  created_at: number
  updated_at: number
}

export interface WorkspaceTabState {
  workspace_id: string
  tabs_json: string
  active_index: number
}

export class WorkspaceRepository {
  constructor(private db: BetterSqlite3Db) {}

  list(): WorkspaceRecord[] {
    return this.db
      .prepare('SELECT * FROM workspace ORDER BY position ASC')
      .all() as WorkspaceRecord[]
  }

  getById(id: string): WorkspaceRecord | undefined {
    return this.db.prepare('SELECT * FROM workspace WHERE id = ?').get(id) as
      | WorkspaceRecord
      | undefined
  }

  create(w: Omit<WorkspaceRecord, 'created_at' | 'updated_at'>): WorkspaceRecord {
    const now = Date.now()
    this.db
      .prepare(
        'INSERT INTO workspace (id, name, color, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(w.id, w.name, w.color, w.position, now, now)
    return this.getById(w.id)!
  }

  update(
    id: string,
    patch: { name?: string; color?: string; position?: number }
  ): WorkspaceRecord {
    const fields: string[] = []
    const values: unknown[] = []
    if (patch.name !== undefined) {
      fields.push('name = ?')
      values.push(patch.name)
    }
    if (patch.color !== undefined) {
      fields.push('color = ?')
      values.push(patch.color)
    }
    if (patch.position !== undefined) {
      fields.push('position = ?')
      values.push(patch.position)
    }
    if (fields.length === 0) return this.getById(id)!
    fields.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)
    this.db.prepare(`UPDATE workspace SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.getById(id)!
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM workspace WHERE id = ?').run(id)
    this.db.prepare('UPDATE bookmarks SET workspace_id = NULL WHERE workspace_id = ?').run(id)
  }

  reorder(ids: string[]): void {
    const stmt = this.db.prepare('UPDATE workspace SET position = ? WHERE id = ?')
    const tx = this.db.transaction(() => {
      ids.forEach((id, i) => stmt.run(i, id))
    })
    tx()
  }

  getMaxPosition(): number {
    const row = this.db
      .prepare('SELECT MAX(position) as max_pos FROM workspace')
      .get() as { max_pos: number | null }
    return row.max_pos ?? -1
  }

  // --- Tab state persistence ---

  getTabState(workspaceId: string): WorkspaceTabState | undefined {
    // Store tab state as a JSON blob in a dedicated table or reuse settings
    // For simplicity, use a separate table workspace_tabs
    return this.db
      .prepare('SELECT * FROM workspace_tabs WHERE workspace_id = ?')
      .get(workspaceId) as WorkspaceTabState | undefined
  }

  setTabState(workspaceId: string, tabsJson: string, activeIndex: number): void {
    this.db
      .prepare(
        `INSERT INTO workspace_tabs (workspace_id, tabs_json, active_index)
         VALUES (?, ?, ?)
         ON CONFLICT(workspace_id) DO UPDATE SET tabs_json = excluded.tabs_json, active_index = excluded.active_index`
      )
      .run(workspaceId, tabsJson, activeIndex)
  }
}
```

- [ ] **Step 4: Add workspace_tabs table to initTables()**

In `packages/database/src/database.ts`, inside `initTables()`, add after the workspace table:

```ts
db.exec(`
  CREATE TABLE IF NOT EXISTS workspace_tabs (
    workspace_id TEXT PRIMARY KEY,
    tabs_json TEXT NOT NULL DEFAULT '[]',
    active_index INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE CASCADE
  )
`)
```

- [ ] **Step 5: Export WorkspaceRepository from index.ts**

In `packages/database/src/index.ts`, add:

```ts
export { WorkspaceRepository } from './repositories/workspace-repository'
export type { WorkspaceRecord, WorkspaceTabState } from './repositories/workspace-repository'
```

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/
git commit -m "feat(db): add workspace and workspace_tabs tables, WorkspaceRepository"
```

---

## Task 2: IPC Contract — Workspace types + channels

**Files:**
- Modify: `packages/ipc-contract/src/channels.ts`

**Interfaces:**
- Produces: `Workspace` type, `workspace:*` IPC channels, `'workspace'` PopoverType

- [ ] **Step 1: Add Workspace type**

In `packages/ipc-contract/src/channels.ts`, after the `ShortcutInfo` interface (around line 269), add:

```ts
/** 工作区（Arc-style Space） */
export interface Workspace {
  id: string
  name: string
  color: string
  position: number
  /** 实时计算的标签数量，非持久化 */
  tabCount: number
  createdAt: number
  updatedAt: number
}
```

- [ ] **Step 2: Add 'workspace' to PopoverType**

In `packages/ipc-contract/src/channels.ts`, modify the `PopoverType` definition:

```ts
export type PopoverType =
  | 'menu'
  | 'addressbar'
  | 'find'
  | 'downloads'
  | 'bookmark-folder'
  | 'tab-thumbnail'
  | 'command-palette'
  | 'workspace'
```

- [ ] **Step 3: Add workspace IPC channels to IpcContract**

In `packages/ipc-contract/src/channels.ts`, inside the `IpcContract` interface (before the closing `}`), add:

```ts
// Workspace
'workspace:list': () => Workspace[]
'workspace:create': (name: string, color: string) => Workspace
'workspace:update': (id: string, patch: { name?: string; color?: string; position?: number }) => Workspace
'workspace:delete': (id: string) => void
'workspace:switchTo': (id: string) => void
'workspace:getActive': () => Workspace | null
'workspace:reorder': (ids: string[]) => void
```

- [ ] **Step 4: Add workspace channels to IPC_CHANNELS array**

In `packages/ipc-contract/src/channels.ts`, in the `IPC_CHANNELS` array, add:

```ts
// Workspace
'workspace:list',
'workspace:create',
'workspace:update',
'workspace:delete',
'workspace:switchTo',
'workspace:getActive',
'workspace:reorder',
```

- [ ] **Step 5: Commit**

```bash
git add packages/ipc-contract/src/channels.ts
git commit -m "feat(ipc): add Workspace type and workspace:* IPC channels"
```

---

## Task 3: Main Process — WorkspaceManager

**Files:**
- Create: `apps/main/src/workspace-manager.ts`
- Modify: `apps/main/src/tab-manager.ts` (add workspaceId field)
- Modify: `apps/main/src/window-manager.ts` (create WorkspaceManager, inject)

**Interfaces:**
- Consumes: `WorkspaceRepository`, `TabManager`, `SessionManager`
- Produces: `WorkspaceManager` class

- [ ] **Step 1: Create WorkspaceManager**

Create `apps/main/src/workspace-manager.ts`:

```ts
/**
 * 工作区管理器 — Arc-style Space 的核心模块
 *
 * 职责：
 * - workspace CRUD（创建/读取/更新/删除/排序）
 * - workspace 切换（保存当前标签 → 隐藏 → 恢复目标标签 → 显示）
 * - 标签状态持久化（通过 WorkspaceRepository 存入 SQLite）
 *
 * 设计原则：
 * - 每个窗口独立 WorkspaceManager 实例（由 WindowManager 创建）
 * - 切换操作是窗口级的，不影响其他窗口
 * - Session partition 映射：默认 workspace = persist:default，其他 = persist:space-{id}
 */
import type { Workspace } from '@browser/ipc-contract'
import { isWmfxUrl, NEW_TAB_URL, wmfxPath } from '@browser/shared'
import type { BrowserWindow } from 'electron'
import { session } from 'electron'
import type { SessionManager } from './session-manager'
import type { TabManager } from './tab-manager'
import type { WorkspaceRecord, WorkspaceRepository } from '@wmfx/database'

/** 默认 workspace 的标识（向后兼容） */
const DEFAULT_WORKSPACE_ID = 'default'

export class WorkspaceManager {
  private activeWorkspaceId: string = DEFAULT_WORKSPACE_ID
  private workspaceRepo: WorkspaceRepository
  private tabManager: TabManager
  private sessionManager: SessionManager
  private window: BrowserWindow

  constructor(
    workspaceRepo: WorkspaceRepository,
    tabManager: TabManager,
    sessionManager: SessionManager,
    window: BrowserWindow
  ) {
    this.workspaceRepo = workspaceRepo
    this.tabManager = tabManager
    this.sessionManager = sessionManager
    this.window = window
    this.ensureDefaultWorkspace()
  }

  /** 确保默认 workspace 存在（升级兼容） */
  private ensureDefaultWorkspace(): void {
    const existing = this.workspaceRepo.getById(DEFAULT_WORKSPACE_ID)
    if (!existing) {
      console.info('[WorkspaceManager] ensureDefaultWorkspace: creating default workspace')
      this.workspaceRepo.create({
        id: DEFAULT_WORKSPACE_ID,
        name: '默认',
        color: '#636e72',
        position: 0,
      })
    }
  }

  list(): Workspace[] {
    const records = this.workspaceRepo.list()
    return records.map((r) => this.toWorkspace(r))
  }

  getActive(): Workspace | null {
    const record = this.workspaceRepo.getById(this.activeWorkspaceId)
    return record ? this.toWorkspace(record) : null
  }

  getActiveId(): string {
    return this.activeWorkspaceId
  }

  create(name: string, color: string): Workspace {
    const maxPos = this.workspaceRepo.getMaxPosition()
    const id = crypto.randomUUID()
    const record = this.workspaceRepo.create({
      id,
      name,
      color,
      position: maxPos + 1,
    })
    console.info('[WorkspaceManager] create: id=%s name=%s', id, name)
    return this.toWorkspace(record)
  }

  update(id: string, patch: { name?: string; color?: string; position?: number }): Workspace {
    const record = this.workspaceRepo.update(id, patch)
    console.debug('[WorkspaceManager] update: id=%s', id)
    return this.toWorkspace(record)
  }

  delete(id: string): void {
    if (id === DEFAULT_WORKSPACE_ID) {
      console.warn('[WorkspaceManager] delete: cannot delete default workspace')
      return
    }
    console.info('[WorkspaceManager] delete: id=%s', id)

    // 如果删除的是当前活跃 workspace，先切换到默认
    if (this.activeWorkspaceId === id) {
      this.switchTo(DEFAULT_WORKSPACE_ID)
    }

    // 关闭该 workspace 的标签（如果有）
    // 清理 session partition
    const partition = `persist:space-${id}`
    const sess = session.fromPartition(partition)
    void sess.clearStorageData()
    void sess.clearCache()

    this.workspaceRepo.delete(id)
  }

  reorder(ids: string[]): void {
    this.workspaceRepo.reorder(ids)
  }

  /**
   * 切换到目标 workspace（核心方法）
   *
   * 流程：
   * 1. 保存当前 workspace 的标签状态
   * 2. 隐藏当前标签视图
   * 3. 清空 TabManager 中的当前标签
   * 4. 从 DB 恢复目标 workspace 的标签
   * 5. 广播切换事件
   */
  switchTo(id: string): void {
    if (id === this.activeWorkspaceId) return
    const target = this.workspaceRepo.getById(id)
    if (!target) return

    console.info('[WorkspaceManager] switchTo: from=%s to=%s', this.activeWorkspaceId, id)

    // 1. 保存当前标签状态
    this.saveCurrentTabs()

    // 2. 隐藏当前所有标签视图
    const currentTabs = this.tabManager.getList()
    for (const tab of currentTabs) {
      const wc = this.tabManager.getWebContents(tab.id)
      if (wc && !wc.isDestroyed()) {
        // 视图将在 clearAll 后被销毁，这里只是标记
      }
    }

    // 3. 关闭当前所有标签（释放视图）
    const currentIds = currentTabs.map((t) => t.id)
    this.tabManager.closeMany(currentIds)

    // 4. 更新活跃 workspace
    this.activeWorkspaceId = id

    // 5. 恢复目标标签
    this.restoreTabsForWorkspace(id)

    // 6. 广播切换事件
    this.window.webContents.send('workspace:switched', this.getActive())
  }

  /** 保存当前 workspace 的标签状态到 DB */
  saveCurrentTabs(): void {
    const tabs = this.tabManager.serializeTabs()
    const activeIndex = this.tabManager.getActiveTabIndex()
    const tabsJson = JSON.stringify(tabs)
    this.workspaceRepo.setTabState(this.activeWorkspaceId, tabsJson, activeIndex)
    console.debug(
      '[WorkspaceManager] saveCurrentTabs: workspaceId=%s tabCount=%d',
      this.activeWorkspaceId,
      tabs.length
    )
  }

  /** 从 DB 恢复指定 workspace 的标签 */
  restoreTabsForWorkspace(workspaceId: string): void {
    const state = this.workspaceRepo.getTabState(workspaceId)
    if (state) {
      const tabs = JSON.parse(state.tabs_json) as { url: string; title: string }[]
      if (tabs.length > 0) {
        this.tabManager.restoreTabs(tabs, state.active_index)
        return
      }
    }
    // 无保存状态：创建新标签页
    this.tabManager.createNewTab()
  }

  /** 获取 workspace 对应的 session partition 名 */
  getSessionPartition(workspaceId: string): string {
    if (workspaceId === DEFAULT_WORKSPACE_ID) return 'default'
    return `space-${workspaceId}`
  }

  /** 将 DB 记录转换为 IPC Workspace 类型 */
  private toWorkspace(record: WorkspaceRecord): Workspace {
    // tabCount 从 TabManager 实时获取（仅当前活跃 workspace 有标签）
    const tabCount =
      record.id === this.activeWorkspaceId ? this.tabManager.getList().length : this.getSavedTabCount(record.id)
    return {
      id: record.id,
      name: record.name,
      color: record.color,
      position: record.position,
      tabCount,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    }
  }

  /** 获取已保存的标签数量（非活跃 workspace 从 DB 读取） */
  private getSavedTabCount(workspaceId: string): number {
    const state = this.workspaceRepo.getTabState(workspaceId)
    if (!state) return 0
    try {
      const tabs = JSON.parse(state.tabs_json) as unknown[]
      return tabs.length
    } catch {
      return 0
    }
  }
}
```

- [ ] **Step 2: Add workspaceId to TabManager**

In `apps/main/src/tab-manager.ts`, modify the constructor to accept optional `workspaceId`:

```ts
constructor(
    private window: BrowserWindow,
    private getSession: (name: string) => Session,
    private defaultSessionName: string = 'default',
    private historyManager: HistoryManager,
    private settingsManager: SettingsManager | null = null,
    private popoverManager: PopoverManager,
    private certTrustStore: CertTrustStore,
    private pageEnhanceManager: PageEnhanceManager,
    private workspaceId: string = 'default'  // 新增
  ) {
```

Also add a setter method for workspaceId (needed when switching):

```ts
/** 切换 workspace 时更新关联的 workspaceId */
setWorkspaceId(id: string): void {
  this.workspaceId = id
}

getWorkspaceId(): string {
  return this.workspaceId
}
```

- [ ] **Step 3: Wire WorkspaceManager in WindowManager**

In `apps/main/src/window-manager.ts`, modify `BrowserWindowInstance` interface to add:

```ts
workspaceManager: WorkspaceManager
```

In `createWindow()`, after creating `tabManager` and before returning the instance, add:

```ts
import { WorkspaceManager } from './workspace-manager'
import { WorkspaceRepository } from '@wmfx/database'

// ... inside createWindow, after tabManager creation:
const workspaceRepo = new WorkspaceRepository(database.db)
const workspaceManager = new WorkspaceManager(workspaceRepo, tabManager, sessionManager, win)

// Set the tabManager's workspaceId to default
tabManager.setWorkspaceId('default')
```

Add `workspaceManager` to the instance object.

- [ ] **Step 4: Commit**

```bash
git add apps/main/src/workspace-manager.ts apps/main/src/tab-manager.ts apps/main/src/window-manager.ts
git commit -m "feat(main): add WorkspaceManager with CRUD and switchTo logic"
```

---

## Task 4: Main Process — IPC Handlers

**Files:**
- Modify: `apps/main/src/ipc/register.ts`

**Interfaces:**
- Consumes: `WorkspaceManager` from WindowManager instance

- [ ] **Step 1: Register workspace IPC handlers**

In `apps/main/src/ipc/register.ts`, inside `registerIpcHandlers()`, add workspace handlers following the existing pattern (e.g., after password handlers):

```ts
// --- Workspace ---
ipcMain.handle('workspace:list', (event) => {
  const instance = getInstance(event)
  return instance.workspaceManager.list()
})

ipcMain.handle('workspace:create', (event, name: string, color: string) => {
  const instance = getInstance(event)
  return instance.workspaceManager.create(name, color)
})

ipcMain.handle('workspace:update', (event, id: string, patch: { name?: string; color?: string; position?: number }) => {
  const instance = getInstance(event)
  return instance.workspaceManager.update(id, patch)
})

ipcMain.handle('workspace:delete', (event, id: string) => {
  const instance = getInstance(event)
  instance.workspaceManager.delete(id)
})

ipcMain.handle('workspace:switchTo', (event, id: string) => {
  const instance = getInstance(event)
  instance.workspaceManager.switchTo(id)
})

ipcMain.handle('workspace:getActive', (event) => {
  const instance = getInstance(event)
  return instance.workspaceManager.getActive()
})

ipcMain.handle('workspace:reorder', (event, ids: string[]) => {
  const instance = getInstance(event)
  instance.workspaceManager.reorder(ids)
})
```

- [ ] **Step 2: Commit**

```bash
git add apps/main/src/ipc/register.ts
git commit -m "feat(ipc): register workspace:* IPC handlers"
```

---

## Task 5: Preload — Expose workspace APIs

**Files:**
- Modify: `apps/main/src/preload.ts`

**Interfaces:**
- Produces: `browserAPI.workspace*` methods for renderer

- [ ] **Step 1: Add workspace type declarations**

In `apps/main/src/preload.ts`, in the type declaration block (around line 328, before the closing `}`), add:

```ts
// Workspace
listWorkspaces: () => Promise<Workspace[]>
createWorkspace: (name: string, color: string) => Promise<Workspace>
updateWorkspace: (id: string, patch: { name?: string; color?: string; position?: number }) => Promise<Workspace>
deleteWorkspace: (id: string) => Promise<void>
switchWorkspace: (id: string) => Promise<void>
getActiveWorkspace: () => Promise<Workspace | null>
reorderWorkspaces: (ids: string[]) => Promise<void>
onWorkspaceSwitched: (cb: (workspace: Workspace) => void) => () => void
```

- [ ] **Step 2: Add workspace method implementations**

In `apps/main/src/preload.ts`, in the api object implementation (before the closing `}`), add:

```ts
// Workspace
listWorkspaces: () => ipcRenderer.invoke('workspace:list'),
createWorkspace: (name, color) => ipcRenderer.invoke('workspace:create', name, color),
updateWorkspace: (id, patch) => ipcRenderer.invoke('workspace:update', id, patch),
deleteWorkspace: (id) => ipcRenderer.invoke('workspace:delete', id),
switchWorkspace: (id) => ipcRenderer.invoke('workspace:switchTo', id),
getActiveWorkspace: () => ipcRenderer.invoke('workspace:getActive'),
reorderWorkspaces: (ids) => ipcRenderer.invoke('workspace:reorder', ids),
onWorkspaceSwitched: (cb) => {
  const handler = (_event: Electron.IpcRendererEvent, workspace: Workspace) => cb(workspace)
  ipcRenderer.on('workspace:switched', handler)
  return () => ipcRenderer.removeListener('workspace:switched', handler)
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/main/src/preload.ts
git commit -m "feat(preload): expose workspace APIs to renderer"
```

---

## Task 6: Renderer — WorkspacePanel component

**Files:**
- Create: `apps/renderer/src/panel/WorkspacePanel.vue`
- Modify: `apps/renderer/src/panel/PanelRoot.vue` (add workspace branch)

**Interfaces:**
- Consumes: `browserAPI.workspace*` from preload
- Produces: `WorkspacePanel` Vue component

- [ ] **Step 1: Create WorkspacePanel.vue**

Create `apps/renderer/src/panel/WorkspacePanel.vue`:

```vue
<template>
  <div class="workspace-panel">
    <div class="workspace-list">
      <div
        v-for="ws in workspaces"
        :key="ws.id"
        class="workspace-item"
        :class="{ 'workspace-item--active': ws.id === activeId }"
        @click="switchTo(ws.id)"
      >
        <div
          class="workspace-dot"
          :style="{ background: ws.color }"
        />
        <div class="workspace-info">
          <template v-if="editingId === ws.id">
            <input
              ref="editInputRef"
              v-model="editName"
              class="workspace-name-input"
              @blur="saveEdit(ws.id)"
              @keydown.enter="saveEdit(ws.id)"
              @keydown.escape="cancelEdit"
              @click.stop
            >
          </template>
          <template v-else>
            <span
              class="workspace-name"
              @dblclick.stop="startEdit(ws)"
            >{{ ws.name }}</span>
          </template>
          <span class="workspace-count">{{ ws.tabCount }} 个标签</span>
        </div>
        <div
          v-if="ws.id === activeId"
          class="workspace-check"
        >✓</div>
        <Icon
          v-if="ws.id !== 'default'"
          icon="mdi:dots-vertical"
          class="workspace-more"
          @click.stop="openActionMenu($event, ws)"
        />
      </div>
    </div>
    <div class="workspace-divider" />
    <div
      class="workspace-add"
      @click="startCreate"
    >
      <template v-if="showCreateForm">
        <input
          ref="createInputRef"
          v-model="newName"
          class="workspace-name-input"
          placeholder="名称"
          @blur="createWorkspace"
          @keydown.enter="createWorkspace"
          @keydown.escape="showCreateForm = false"
        >
      </template>
      <template v-else>
        <Icon icon="mdi:plus" /> 新建 Space
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PopoverAnchor, Workspace } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { nextTick, onMounted, ref } from 'vue'
import { ContextMenu } from '../lib/context-menu'

const props = defineProps<{
  popoverId: string
  data?: { workspaces: Workspace[]; activeId: string }
}>()

const emit = defineEmits<{
  (e: 'event', name: string, data?: unknown): void
}>()

const workspaces = ref<Workspace[]>(props.data?.workspaces ?? [])
const activeId = ref(props.data?.activeId ?? '')
const editingId = ref<string | null>(null)
const editName = ref('')
const showCreateForm = ref(false)
const newName = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)
const createInputRef = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  const list = await window.browserAPI.listWorkspaces()
  workspaces.value = list
  const active = await window.browserAPI.getActiveWorkspace()
  if (active) activeId.value = active.id
})

async function switchTo(id: string): Promise<void> {
  await window.browserAPI.switchWorkspace(id)
  activeId.value = id
  emit('event', 'switched', { id })
}

function startEdit(ws: Workspace): void {
  editingId.value = ws.id
  editName.value = ws.name
  nextTick(() => editInputRef.value?.focus())
}

async function saveEdit(id: string): Promise<void> {
  if (editName.value.trim()) {
    await window.browserAPI.updateWorkspace(id, { name: editName.value.trim() })
  }
  editingId.value = null
  const list = await window.browserAPI.listWorkspaces()
  workspaces.value = list
}

function cancelEdit(): void {
  editingId.value = null
}

function startCreate(): void {
  showCreateForm.value = true
  nextTick(() => createInputRef.value?.focus())
}

async function createWorkspace(): Promise<void> {
  if (newName.value.trim()) {
    const colors = [
      '#ff6b6b', '#ff9f43', '#feca57', '#48dbfb',
      '#4ecdc4', '#45b7d1', '#6c5ce7', '#a29bfe',
      '#fd79a8', '#00b894', '#636e72',
    ]
    const color = colors[workspaces.value.length % colors.length]
    await window.browserAPI.createWorkspace(newName.value.trim(), color)
    const list = await window.browserAPI.listWorkspaces()
    workspaces.value = list
  }
  showCreateForm.value = false
  newName.value = ''
}

function openActionMenu(e: MouseEvent, ws: Workspace): void {
  const items = [
    { id: 'rename', label: '重命名', icon: 'mdi:pencil' },
    { id: 'edit-color', label: '更改颜色', icon: 'mdi:palette' },
    { id: 'delete', label: '删除', icon: 'mdi:delete', danger: true },
  ]
  new ContextMenu({
    anchor: { type: 'point', x: e.clientX, y: e.clientY },
    descriptor: { id: `ws-action-${ws.id}`, items },
    onAction: async ({ menu, context }) => {
      context.close()
      if (menu === 'rename') {
        startEdit(ws)
      } else if (menu === 'delete') {
        await window.browserAPI.deleteWorkspace(ws.id)
        const list = await window.browserAPI.listWorkspaces()
        workspaces.value = list
        const active = await window.browserAPI.getActiveWorkspace()
        if (active) activeId.value = active.id
      } else if (menu === 'edit-color') {
        // TODO: color picker
      }
    },
  })
}
</script>

<style lang="less" scoped>
.workspace-panel {
  width: 240px;
  padding: 8px 0;
}

.workspace-list {
  max-height: 300px;
  overflow-y: auto;
}

.workspace-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  color: var(--text-primary);

  &:hover {
    background: var(--bg-hover);
  }

  &--active {
    background: var(--bg-tertiary);
  }
}

.workspace-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.workspace-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.workspace-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-name-input {
  font-size: 13px;
  font-weight: 500;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--text-primary);
  outline: none;
  width: 100%;
  font-family: var(--font-sans);
}

.workspace-count {
  font-size: 11px;
  color: var(--text-secondary);
}

.workspace-check {
  color: var(--accent-color);
  font-weight: 600;
}

.workspace-more {
  opacity: 0;
  transition: opacity 0.15s;
  cursor: pointer;
  flex-shrink: 0;

  .workspace-item:hover & {
    opacity: 1;
  }
}

.workspace-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--bg-tertiary);
}

.workspace-add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}
</style>
```

- [ ] **Step 2: Add WorkspacePanel to PanelRoot.vue**

In `apps/renderer/src/panel/PanelRoot.vue`, add import:

```ts
import WorkspacePanel from './WorkspacePanel.vue'
```

Add template branch inside the popover-box div (after the CommandPalettePanel branch):

```vue
<WorkspacePanel
  v-else-if="currentType === 'workspace'"
  :popover-id="currentPopoverId"
  :data="workspaceData"
  @event="onAddressBarEvent"
/>
```

Add computed for workspaceData:

```ts
const workspaceData = computed(() => {
  if (currentType.value === 'workspace' && currentData.value) {
    return currentData.value as { workspaces: Workspace[]; activeId: string }
  }
  return { workspaces: [], activeId: '' }
})
```

Add `Workspace` to the imports from `@browser/ipc-contract`.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/panel/WorkspacePanel.vue apps/renderer/src/panel/PanelRoot.vue
git commit -m "feat(renderer): add WorkspacePanel popover component"
```

---

## Task 7: TabBar — Workspace button

**Files:**
- Modify: `apps/renderer/src/components/TabBar.vue`
- Modify: `apps/renderer/src/components/VerticalTabBar.vue`

**Interfaces:**
- Consumes: `browserAPI.workspace*` from preload, `Popover` class

- [ ] **Step 1: Add workspace button to TabBar.vue**

In `apps/renderer/src/components/TabBar.vue`, add workspace button before the tab list in the template:

```vue
<div
  v-if="currentWorkspace"
  class="tab-bar-workspace-btn"
  :style="{ background: currentWorkspace.color }"
  :title="currentWorkspace.name"
  @click="openWorkspacePanel"
>
  {{ currentWorkspace.name.charAt(0) }}
</div>
```

In the script setup section, add:

```ts
import { ref, onMounted, onUnmounted } from 'vue'
import { Popover } from '../lib/popover'

const currentWorkspace = ref<{ id: string; name: string; color: string } | null>(null)
let workspacePopover: Popover | null = null

onMounted(async () => {
  const ws = await window.browserAPI.getActiveWorkspace()
  if (ws) currentWorkspace.value = ws

  window.browserAPI.onWorkspaceSwitched((ws) => {
    currentWorkspace.value = ws
  })
})

async function openWorkspacePanel(e: MouseEvent): Promise<void> {
  const rect = (e.target as HTMLElement).getBoundingClientRect()
  workspacePopover?.close()
  const workspaces = await window.browserAPI.listWorkspaces()
  const active = await window.browserAPI.getActiveWorkspace()
  workspacePopover = new Popover({
    type: 'workspace',
    anchor: { type: 'rect', rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } },
    data: { workspaces, activeId: active?.id ?? '' },
    onEvent: () => {},
    onDismiss: () => { workspacePopover = null },
  })
}
```

Add CSS for the workspace button:

```less
.tab-bar-workspace-btn {
  width: 32px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
  margin-right: 4px;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.85;
  }
}
```

- [ ] **Step 2: Add workspace button to VerticalTabBar.vue**

In `apps/renderer/src/components/VerticalTabBar.vue`, add workspace button at the top of `.vertical-tab-bar` (before `.vtab-list`):

```vue
<div
  v-if="currentWorkspace"
  class="vtab-workspace-btn"
  :style="{ background: currentWorkspace.color }"
  :title="currentWorkspace.name"
  @click="openWorkspacePanel"
>
  {{ currentWorkspace.name.charAt(0) }}
</div>
```

Add the same script logic and CSS (adjusted for vertical layout):

```less
.vtab-workspace-btn {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    opacity: 0.85;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/components/TabBar.vue apps/renderer/src/components/VerticalTabBar.vue
git commit -m "feat(ui): add workspace button to TabBar and VerticalTabBar"
```

---

## Task 8: Bookmark filtering by workspace

**Files:**
- Modify: `apps/renderer/src/composables/useBookmarks.ts`
- Modify: `apps/renderer/src/components/BookmarkBar.vue`
- Modify: `packages/database/src/repositories/bookmark-repository.ts`

**Interfaces:**
- Consumes: `browserAPI.getActiveWorkspace()` / `onWorkspaceSwitched`

- [ ] **Step 1: Add workspace filtering to BookmarkRepository**

In `packages/database/src/repositories/bookmark-repository.ts`, add method:

```ts
getListByWorkspace(parentId?: string | null, workspaceId?: string | null): BookmarkItem[] {
  if (!workspaceId) {
    return this.getList(parentId)
  }
  const sql = `
    SELECT * FROM bookmarks
    WHERE (${parentId === null ? 'parent_id IS NULL' : 'parent_id = ?'})
      AND (workspace_id = ? OR workspace_id IS NULL)
    ORDER BY position ASC
  `
  return parentId === null
    ? this.db.prepare(sql).all(workspaceId) as BookmarkItem[]
    : this.db.prepare(sql).all(parentId, workspaceId) as BookmarkItem[]
}
```

- [ ] **Step 2: Add IPC channel for workspace-filtered bookmarks**

In `packages/ipc-contract/src/channels.ts`, add to IpcContract:

```ts
'bookmark:getListByWorkspace': (parentId?: string | null) => BookmarkItem[]
```

Register handler in `apps/main/src/ipc/register.ts`:

```ts
ipcMain.handle('bookmark:getListByWorkspace', async (event, parentId?: string | null) => {
  const instance = getInstance(event)
  const wsId = instance.workspaceManager.getActiveId()
  return instance.bookmarkManager.listByWorkspace(parentId, wsId)
})
```

Expose in preload:

```ts
getBookmarksByWorkspace: (parentId) => ipcRenderer.invoke('bookmark:getListByWorkspace', parentId),
```

- [ ] **Step 3: Update BookmarkBar to filter by workspace**

In `apps/renderer/src/components/BookmarkBar.vue`, modify the `topItems` computed to use workspace-filtered bookmarks:

```ts
import { ref, onMounted, onUnmounted } from 'vue'

const currentWorkspaceId = ref<string | null>(null)

onMounted(() => {
  window.browserAPI.getActiveWorkspace().then((ws) => {
    if (ws) currentWorkspaceId.value = ws.id
  })
  window.browserAPI.onWorkspaceSwitched((ws) => {
    currentWorkspaceId.value = ws?.id ?? null
  })
})

// Modify topItems to use workspace-filtered data
const topItems = computed(async () => {
  if (currentWorkspaceId.value) {
    return await window.browserAPI.getBookmarksByWorkspace(null)
  }
  return byParent.value.get(null) ?? []
})
```

Note: BookmarkBar uses synchronous `byParent` from `useBookmarks()`. The workspace filtering will need the composable to be workspace-aware. Update `useBookmarks()` to accept an optional workspace filter.

- [ ] **Step 4: Update useBookmarks composable**

In `apps/renderer/src/composables/useBookmarks.ts`, add workspace awareness:

```ts
// Add a reactive workspaceId ref
const workspaceId = ref<string | null>(null)

// Update load to accept workspace filter
async function load(): Promise<void> {
  const ws = await window.browserAPI.getActiveWorkspace()
  workspaceId.value = ws?.id ?? null
  bookmarks.value = await window.browserAPI.getBookmarksByWorkspace(null)
}

// Watch workspace changes
window.browserAPI.onWorkspaceSwitched(() => {
  load()
})
```

- [ ] **Step 5: Commit**

```bash
git add apps/renderer/src/composables/useBookmarks.ts apps/renderer/src/components/BookmarkBar.vue packages/database/src/repositories/bookmark-repository.ts apps/renderer/src/ipc/register.ts apps/main/src/preload.ts
git commit -m "feat(bookmark): filter bookmarks by active workspace"
```

---

## Task 9: Command Palette integration

**Files:**
- Modify: `apps/renderer/src/panel/CommandPalettePanel.vue`

**Interfaces:**
- Consumes: `browserAPI.listWorkspaces()`, `browserAPI.switchWorkspace()`

- [ ] **Step 1: Add workspace commands to CommandPalettePanel**

In `apps/renderer/src/panel/CommandPalettePanel.vue`, in the command registration section, add workspace commands:

```ts
// Workspace switch commands
const workspaces = await window.browserAPI.listWorkspaces()
for (const ws of workspaces) {
  commands.push({
    id: `workspace-switch-${ws.id}`,
    label: `切换到 ${ws.name}`,
    icon: ws.color ? undefined : 'mdi:view-dashboard',
    category: 'workspace',
    action: () => window.browserAPI.switchWorkspace(ws.id),
  })
}
commands.push({
  id: 'workspace-create',
  label: '新建工作区',
  icon: 'mdi:plus',
  category: 'workspace',
  action: () => { /* open create dialog */ },
})
```

- [ ] **Step 2: Commit**

```bash
git add apps/renderer/src/panel/CommandPalettePanel.vue
git commit -m "feat(commands): add workspace switch/create commands to palette"
```

---

## Task 10: i18n — Add workspace strings

**Files:**
- Modify: `apps/renderer/src/i18n/zh-CN.json`
- Modify: `apps/renderer/src/i18n/en-US.json`

**Interfaces:**
- Consumes: N/A

- [ ] **Step 1: Add Chinese translations**

In `apps/renderer/src/i18n/zh-CN.json`, add:

```json
"workspace": {
  "new": "新建 Space",
  "rename": "重命名",
  "delete": "删除工作区",
  "deleteConfirm": "确定删除工作区「{name}」？该工作区的标签页将被关闭。",
  "switch": "切换到 {name}",
  "tabs": "{count} 个标签",
  "namePlaceholder": "工作区名称",
  "changeColor": "更改颜色"
}
```

- [ ] **Step 2: Add English translations**

In `apps/renderer/src/i18n/en-US.json`, add:

```json
"workspace": {
  "new": "New Space",
  "rename": "Rename",
  "delete": "Delete workspace",
  "deleteConfirm": "Delete workspace \"{name}\"? Tabs in this workspace will be closed.",
  "switch": "Switch to {name}",
  "tabs": "{count} tabs",
  "namePlaceholder": "Workspace name",
  "changeColor": "Change color"
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/i18n/
git commit -m "feat(i18n): add workspace strings for zh-CN and en-US"
```

---

## Task 11: Lint, typecheck, and verify

**Files:**
- All modified files

**Interfaces:**
- N/A

- [ ] **Step 1: Run full lint**

```bash
bun run lint
```

Fix any issues reported.

- [ ] **Step 2: Run typecheck only**

```bash
bun run lint:typecheck
```

Fix any type errors.

- [ ] **Step 3: Run format**

```bash
bun run format
```

- [ ] **Step 4: Commit all fixes**

```bash
git add -A
git commit -m "chore: lint, typecheck, format fixes for workspace feature"
```
