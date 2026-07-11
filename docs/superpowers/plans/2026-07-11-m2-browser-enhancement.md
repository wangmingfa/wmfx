# M2 — 浏览增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现下载管理、历史记录、书签管理、隐身模式、打印/PDF/缩放、设置界面和浅/深色主题适配

**Architecture:** 主进程增加 5 个 Manager（DownloadManager, HistoryManager, BookmarkManager, SettingsManager + nativeTheme），扩展 IPC 契约，渲染进程增加 4 个视图组件（DownloadsView, HistoryView, BookmarkView, SettingsView）和 Sidebar 导航

**Tech Stack:** Electron 43 + Vue 3.5 + TypeScript 5.9 + better-sqlite3 + electron-store + bun

## Global Constraints

- Electron sandbox: true, contextIsolation: true, nodeIntegration: false
- 渲染进程不持有任何主进程对象引用，全部通过 IPC 操作
- IPC 通道在 packages/ipc-contract 中类型安全定义
- 数据库使用 better-sqlite3（同步 API）
- KV 存储使用 electron-store
- 主题通过 `nativeTheme.themeSource` 控制
- 侧边栏固定宽度 280px，从右侧滑出
- 所有 lint/typecheck/build 必须通过

---

## 文件结构预览

```
apps/main/src/
├── download-manager.ts     ← 新增
├── history-manager.ts      ← 新增
├── bookmark-manager.ts     ← 新增
├── settings-manager.ts     ← 新增
├── tab-manager.ts          ← 修改（自动记录历史）
├── window-manager.ts       ← 修改（注入 SettingsManager + nativeTheme）
├── index.ts                ← 修改（初始化新 Manager）
├── ipc/register.ts         ← 修改（扩展 handlers）
├── preload.ts              ← 修改（扩展 browserAPI）
└── session-manager.ts      ← 已有

packages/ipc-contract/src/
├── channels.ts             ← 修改（扩展所有新通道）
└── index.ts                ← 修改（导出新类型）

apps/renderer/src/
├── components/
│   ├── TabBar.vue          ← 修改（incognito 支持 + 右键菜单）
│   ├── AddressBar.vue      ← 修改（打印/缩放按钮）
│   ├── Sidebar.vue         ← 新增
│   └── ChromeUI.vue        ← 修改（增加侧边栏）
├── views/
│   ├── DownloadsView.vue   ← 新增
│   ├── HistoryView.vue     ← 新增
│   ├── BookmarkView.vue    ← 新增
│   └── SettingsView.vue    ← 新增
└── env.d.ts                ← 修改（扩展 browserAPI 类型）
```

---

### Task 1: 数据库层 — Database + better-sqlite3

**Files:**
- Create: `packages/database/src/database.ts`
- Create: `packages/database/src/repositories/history-repository.ts`
- Create: `packages/database/src/repositories/download-repository.ts`
- Create: `packages/database/src/repositories/bookmark-repository.ts`
- Create: `packages/database/src/index.ts`
- Create: `packages/database/tsconfig.json`
- Create: `packages/database/tsup.config.ts`
- Create: `packages/database/package.json`

**Interfaces:**
- Produces: `Database` singleton + 三个 Repository（HistoryRepository, DownloadRepository, BookmarkRepository）

- [ ] **Step 1: 创建数据库包**

在 `packages/database/` 下创建：

**`package.json`:**
```json
{
  "name": "@wmfx/database",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "require": "./dist/index.js"
    }
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "better-sqlite3": "^11.8.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "tsup": "^8.5.1",
    "typescript": "^5.9.3"
  }
}
```

**`tsconfig.json`:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

**`tsup.config.ts`:**
```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  noExternal: ['better-sqlite3'],
})
```

- [ ] **Step 2: 实现 Database singleton**

**`packages/database/src/database.ts`:**
```typescript
import Database from 'better-sqlite3'
import path from 'node:path'
import { app } from 'electron'

class DatabaseManager {
  private static instance: DatabaseManager | null = null
  private db: Database.Database

  private constructor() {
    const dbPath = path.join(app.getPath('userData'), 'wmfx.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.initTables()
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  get db(): Database.Database {
    return this.db
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT,
        favicon TEXT,
        visit_time INTEGER NOT NULL,
        visit_count INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending',
        received_bytes INTEGER DEFAULT 0,
        total_bytes INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        error_msg TEXT
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        title TEXT NOT NULL,
        url TEXT,
        favicon TEXT,
        position INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES bookmarks(id)
      );
    `)
  }

  destroy(): void {
    this.db.close()
    DatabaseManager.instance = null
  }
}

export default DatabaseManager
```

- [ ] **Step 3: 实现 HistoryRepository**

**`packages/database/src/repositories/history-repository.ts`:**
```typescript
import type { Database as BetterSqlite3Db } from 'better-sqlite3'
import crypto from 'node:crypto'

export interface HistoryItem {
  id: string
  url: string
  title: string | null
  favicon: string | null
  visit_time: number
  visit_count: number
}

export class HistoryRepository {
  constructor(private db: BetterSqlite3Db) {}

  add(item: Omit<HistoryItem, 'id'>): string {
    const id = crypto.randomUUID()
    const stmt = this.db.prepare(`
      INSERT INTO history (id, url, title, favicon, visit_time, visit_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, item.url, item.title, item.favicon, item.visit_time, item.visit_count)
    return id
  }

  find(url: string): HistoryItem | undefined {
    const stmt = this.db.prepare(`
      SELECT id, url, title, favicon, visit_time, visit_count
      FROM history WHERE url = ?
    `)
    return stmt.get(url) as HistoryItem | undefined
  }

  incrementVisitCount(url: string): void {
    const stmt = this.db.prepare(`
      UPDATE history SET visit_count = visit_count + 1 WHERE url = ?
    `)
    stmt.run(url)
  }

  search(query: string, limit = 50, offset = 0): HistoryItem[] {
    const stmt = this.db.prepare(`
      SELECT id, url, title, favicon, visit_time, visit_count
      FROM history
      WHERE url LIKE ? OR title LIKE ?
      ORDER BY visit_time DESC
      LIMIT ? OFFSET ?
    `)
    return stmt.all(`%${query}%`, `%${query}%`, limit, offset) as HistoryItem[]
  }

  getList(limit = 50, offset = 0): HistoryItem[] {
    const stmt = this.db.prepare(`
      SELECT id, url, title, favicon, visit_time, visit_count
      FROM history
      ORDER BY visit_time DESC
      LIMIT ? OFFSET ?
    `)
    return stmt.all(limit, offset) as HistoryItem[]
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM history WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  clear(): void {
    this.db.prepare('DELETE FROM history').run()
  }
}
```

- [ ] **Step 4: 实现 DownloadRepository**

**`packages/database/src/repositories/download-repository.ts`:**
```typescript
import type { Database as BetterSqlite3Db } from 'better-sqlite3'
import crypto from 'node:crypto'

export type DownloadState = 'pending' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'error'

export interface DownloadItem {
  id: string
  url: string
  filename: string
  path: string
  state: DownloadState
  received_bytes: number
  total_bytes: number
  created_at: number
  error_msg: string | null
}

export class DownloadRepository {
  constructor(private db: BetterSqlite3Db) {}

  create(item: Omit<DownloadItem, 'id' | 'created_at'>): string {
    const id = crypto.randomUUID()
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO downloads (id, url, filename, path, state, received_bytes, total_bytes, created_at, error_msg)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, item.url, item.filename, item.path, item.state, item.received_bytes, item.total_bytes, now, item.error_msg)
    return id
  }

  getById(id: string): DownloadItem | undefined {
    const stmt = this.db.prepare(`
      SELECT id, url, filename, path, state, received_bytes, total_bytes, created_at, error_msg
      FROM downloads WHERE id = ?
    `)
    return stmt.get(id) as DownloadItem | undefined
  }

  update(id: string, updates: Partial<Pick<DownloadItem, 'state' | 'received_bytes' | 'total_bytes' | 'error_msg'>>): void {
    const fields: string[] = []
    const params: unknown[] = []
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`)
      params.push(value)
    }
    if (fields.length === 0) return
    params.push(id)
    const stmt = this.db.prepare(`UPDATE downloads SET ${fields.join(', ')} WHERE id = ?`)
    stmt.run(...params)
  }

  getList(opts?: { state?: DownloadState; limit?: number; offset?: number }): DownloadItem[] {
    const { state, limit = 50, offset = 0 } = opts || {}
    let sql = `
      SELECT id, url, filename, path, state, received_bytes, total_bytes, created_at, error_msg
      FROM downloads
    `
    const params: unknown[] = []
    if (state) {
      sql += ' WHERE state = ?'
      params.push(state)
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    const stmt = this.db.prepare(sql)
    return stmt.all(...params) as DownloadItem[]
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM downloads WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }
}
```

- [ ] **Step 5: 实现 BookmarkRepository**

**`packages/database/src/repositories/bookmark-repository.ts`:**
```typescript
import type { Database as BetterSqlite3Db } from 'better-sqlite3'
import crypto from 'node:crypto'

export interface BookmarkItem {
  id: string
  parent_id: string | null
  title: string
  url: string | null
  favicon: string | null
  position: number
  created_at: number
}

export class BookmarkRepository {
  constructor(private db: BetterSqlite3Db) {}

  create(item: Omit<BookmarkItem, 'id' | 'created_at'>): string {
    const id = crypto.randomUUID()
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO bookmarks (id, parent_id, title, url, favicon, position, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, item.parent_id, item.title, item.url, item.favicon, item.position, now)
    return id
  }

  getById(id: string): BookmarkItem | undefined {
    const stmt = this.db.prepare(`
      SELECT id, parent_id, title, url, favicon, position, created_at
      FROM bookmarks WHERE id = ?
    `)
    return stmt.get(id) as BookmarkItem | undefined
  }

  getList(parentId?: string | null): BookmarkItem[] {
    let sql = `
      SELECT id, parent_id, title, url, favicon, position, created_at
      FROM bookmarks
    `
    const params: unknown[] = []
    if (parentId !== undefined) {
      sql += parentId === null ? ' WHERE parent_id IS NULL' : ' WHERE parent_id = ?'
      if (parentId !== null) params.push(parentId)
    }
    sql += ' ORDER BY position'
    const stmt = this.db.prepare(sql)
    return stmt.all(...params) as BookmarkItem[]
  }

  search(query: string): BookmarkItem[] {
    const stmt = this.db.prepare(`
      SELECT id, parent_id, title, url, favicon, position, created_at
      FROM bookmarks
      WHERE title LIKE ? OR url LIKE ?
      ORDER BY title
    `)
    return stmt.all(`%${query}%`, `%${query}%`) as BookmarkItem[]
  }

  update(id: string, updates: Partial<Pick<BookmarkItem, 'title' | 'url' | 'favicon' | 'position'>>): void {
    const fields: string[] = []
    const params: unknown[] = []
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`)
      params.push(value)
    }
    if (fields.length === 0) return
    params.push(id)
    const stmt = this.db.prepare(`UPDATE bookmarks SET ${fields.join(', ')} WHERE id = ?`)
    stmt.run(...params)
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM bookmarks WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }
}
```

- [ ] **Step 6: 导出模块**

**`packages/database/src/index.ts`:**
```typescript
export { default as DatabaseManager } from './database'
export { HistoryRepository } from './repositories/history-repository'
export { DownloadRepository } from './repositories/download-repository'
export { BookmarkRepository } from './repositories/bookmark-repository'
export type { HistoryItem } from './repositories/history-repository'
export type { DownloadItem, DownloadState } from './repositories/download-repository'
export type { BookmarkItem } from './repositories/bookmark-repository'
```

- [ ] **Step 7: 安装依赖并构建**

```bash
cd packages/database && bun install && bun run build && bun run typecheck
```

Expected: 构建成功，typecheck 通过

- [ ] **Step 8: 提交**

```bash
git add packages/database/
git commit -m "feat(database): add SQLite database layer with history/download/bookmark repositories"
```

---

### Task 2: IPC 契约扩展

**Files:**
- Modify: `packages/ipc-contract/src/channels.ts`
- Modify: `packages/ipc-contract/src/index.ts`

**Interfaces:**
- Produces: 所有新通道类型定义

- [ ] **Step 1: 扩展 channels.ts**

在 `packages/ipc-contract/src/channels.ts` 末尾添加新类型和通道：

```typescript
/** 下载状态 */
export type DownloadState = 'pending' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'error'

/** 下载项 */
export interface DownloadItem {
  id: string
  url: string
  filename: string
  path: string
  state: DownloadState
  receivedBytes: number
  totalBytes: number
  createdAt: number
  errorMsg: string | null
}

/** 历史记录项 */
export interface HistoryItem {
  id: string
  url: string
  title: string | null
  favicon: string | null
  visitTime: number
  visitCount: number
}

/** 书签项 */
export interface BookmarkItem {
  id: string
  parentId: string | null
  title: string
  url: string | null
  favicon: string | null
  position: number
  createdAt: number
}

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system'

/** 下载创建参数 */
export interface DownloadCreateOptions {
  url: string
  filename?: string
  path?: string
}

/** 搜索参数 */
export interface SearchOptions {
  query: string
  limit?: number
  offset?: number
}

/** 列表查询参数 */
export interface ListOptions {
  limit?: number
  offset?: number
}

/** 下载列表参数 */
export interface DownloadListOptions {
  state?: DownloadState
  limit?: number
  offset?: number
}

/** 书签创建参数 */
export interface BookmarkCreateOptions {
  title: string
  url: string | null
  favicon?: string | null
  parentId?: string | null
}

/** 页面打印选项 */
export interface PrintOptions {
  deviceName?: string
  printBackground?: boolean
  margins?: {
    top: number
    bottom: number
    left: number
    right: number
  }
}

/** 页面导出 PDF 选项 */
export interface PrintToPdfOptions {
  filename?: string
  pageSize?: 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid'
  marginsType?: number
}

export interface TabPrintOptions {
  tabId: string
  options?: PrintOptions
}

export interface TabPrintToPdfOptions {
  tabId: string
  options?: PrintToPdfOptions
}

export interface TabZoomOptions {
  tabId: string
  factor: number
}
```

在 `IpcContract` 接口中添加新通道（在 `'session:getPartitions'` 之后）：

```typescript
  // Download
  'download:create': (opts: DownloadCreateOptions) => { id: string }
  'download:pause': (id: string) => void
  'download:resume': (id: string) => void
  'download:cancel': (id: string) => void
  'download:get': (id: string) => DownloadItem | null
  'download:getList': (opts?: DownloadListOptions) => DownloadItem[]
  'download:setPath': (path: string) => void
  // History
  'history:add': (item: { url: string; title?: string | null; favicon?: string | null }) => void
  'history:delete': (id: string) => void
  'history:search': (opts: SearchOptions) => HistoryItem[]
  'history:getList': (opts?: ListOptions) => HistoryItem[]
  'history:clear': () => void
  // Bookmark
  'bookmark:add': (item: BookmarkCreateOptions) => { id: string }
  'bookmark:delete': (id: string) => void
  'bookmark:rename': ({ id, title }: { id: string; title: string }) => void
  'bookmark:getList': (parentId?: string | null) => BookmarkItem[]
  'bookmark:search': ({ query }: { query: string }) => BookmarkItem[]
  'bookmark:import': (html: string) => void
  'bookmark:export': () => { html: string }
  // Page
  'page:print': (opts: TabPrintOptions) => void
  'page:printToPDF': (opts: TabPrintToPdfOptions) => { path: string }
  'page:setZoom': (opts: TabZoomOptions) => void
  'page:getZoom': (tabId: string) => { factor: number }
  // Settings
  'settings:get': (key: string) => unknown
  'settings:set': ({ key, value }: { key: string; value: unknown }) => void
  'settings:getAll': () => Record<string, unknown>
  // Theme
  'theme:get': () => ThemeMode
  'theme:set': (theme: ThemeMode) => void
```

- [ ] **Step 2: 更新 index.ts**

在 `packages/ipc-contract/src/index.ts` 中添加新类型导出：

```typescript
export type {
  IpcContract,
  IpcChannel,
  IpcInvoke,
  TabState,
  BrowserViewBounds,
  CreateTabOptions,
  DownloadState,
  DownloadItem,
  DownloadCreateOptions,
  DownloadListOptions,
  HistoryItem,
  BookmarkItem,
  BookmarkCreateOptions,
  SearchOptions,
  ListOptions,
  ThemeMode,
  PrintOptions,
  PrintToPdfOptions,
  TabPrintOptions,
  TabPrintToPdfOptions,
  TabZoomOptions,
} from './channels'
```

- [ ] **Step 3: 构建验证**

```bash
bun run build:ipc && bun run typecheck
```

Expected: 所有包类型检查通过

- [ ] **Step 4: 提交**

```bash
git add packages/ipc-contract/
git commit -m "feat(ipc-contract): extend with download/history/bookmark/settings/theme/page channels"
```

---

### Task 3: SettingsManager

**Files:**
- Create: `apps/main/src/settings-manager.ts`

**Interfaces:**
- Produces: `SettingsManager`（electron-store KV 操作）

- [ ] **Step 1: 安装 electron-store**

```bash
bun add electron-store
```

- [ ] **Step 2: 实现 SettingsManager**

创建 `apps/main/src/settings-manager.ts`：

```typescript
import Store from 'electron-store'

interface SettingsSchema {
  theme: 'light' | 'dark' | 'system'
  downloadPath: string
  defaultSearch: 'google' | 'baidu' | 'bing'
  newTabUrl: string
  zoomFactor: number
}

const defaultSettings: SettingsSchema = {
  theme: 'dark',
  downloadPath: '',
  defaultSearch: 'google',
  newTabUrl: 'https://www.google.com',
  zoomFactor: 1,
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

- [ ] **Step 3: 提交**

```bash
git add apps/main/src/settings-manager.ts bun.lock package.json
git commit -m "feat(main): add SettingsManager with electron-store KV"
```

---

### Task 4: DownloadManager

**Files:**
- Create: `apps/main/src/download-manager.ts`

**Interfaces:**
- Consumes: `DownloadRepository` from `@wmfx/database`, `SettingsManager`
- Produces: `DownloadManager`（下载操作 + 进度广播）

- [ ] **Step 1: 实现 DownloadManager**

创建 `apps/main/src/download-manager.ts`：

```typescript
import { BrowserWindow, DownloadItem as ElectronDownloadItem, session } from 'electron'
import path from 'node:path'
import { DownloadRepository } from '@wmfx/database'
import type { SettingsManager } from './settings-manager'

export class DownloadManager {
  private activeDownloads = new Map<string, { download: ElectronDownloadItem; receiver: () => void }>()

  constructor(
    private window: BrowserWindow,
    private repo: DownloadRepository,
    private settingsManager: SettingsManager
  ) {
    this.setupDownloadHandler()
  }

  private setupDownloadHandler(): void {
    session.defaultSession.on('will-download', (_e, downloadItem) => {
      const url = downloadItem.getURL()
      const filename = downloadItem.getFilename()
      const defaultPath = this.getDefaultPath()

      // 创建下载记录
      const id = this.repo.create({
        url,
        filename,
        path: path.join(defaultPath, filename),
        state: 'downloading',
        received_bytes: 0,
        total_bytes: downloadItem.getTotalBytes(),
        error_msg: null,
      })

      // 设置保存路径
      const savePath = path.join(defaultPath, filename)
      downloadItem.setSavePath(savePath)

      // 监听进度
      downloadItem.on('updated', (_e, state) => {
        if (state === 'interrupted') {
          this.update(id, { state: 'paused' })
        }
      })

      downloadItem.on('progress', (item) => {
        const progress = item.getReceivedBytes()
        const total = item.getTotalBytes()
        this.update(id, { received_bytes: progress, total_bytes: total })
        this.broadcastProgress({
          id,
          state: 'downloading',
          receivedBytes: progress,
          totalBytes: total,
        })
      })

      downloadItem.on('done', (_e, state) => {
        if (state === 'completed') {
          this.update(id, { state: 'completed' })
          this.broadcastProgress({ id, state: 'completed', receivedBytes: downloadItem.getTotalBytes(), totalBytes: downloadItem.getTotalBytes() })
        } else {
          this.update(id, { state: 'error', error_msg: state === 'cancelled' ? 'User cancelled' : 'Download failed' })
          this.broadcastProgress({ id, state: 'error', receivedBytes: 0, totalBytes: downloadItem.getTotalBytes() })
        }
        this.activeDownloads.delete(id)
      })

      this.activeDownloads.set(id, { download: downloadItem, receiver: () => {} })
    })
  }

  create(_opts: { url: string; filename?: string; path?: string }): { id: string } {
    // 通过 Electron downloadItem 创建下载（实际下载由 will-download 处理）
    // 这里返回一个占位 ID，实际创建由 will-download 事件触发
    const defaultPath = this.getDefaultPath()
    const id = crypto.randomUUID()
    return { id }
  }

  pause(id: string): void {
    const active = this.activeDownloads.get(id)
    if (active) {
      active.download.pause()
      this.update(id, { state: 'paused' })
    }
  }

  resume(id: string): void {
    const active = this.activeDownloads.get(id)
    if (active) {
      active.download.resume()
      this.update(id, { state: 'downloading' })
    }
  }

  cancel(id: string): void {
    const active = this.activeDownloads.get(id)
    if (active) {
      active.download.cancel()
      this.update(id, { state: 'cancelled', error_msg: 'User cancelled' })
    }
  }

  get(id: string): ReturnType<DownloadRepository['getById']> {
    return this.repo.getById(id)
  }

  getList(opts?: { state?: string; limit?: number; offset?: number }) {
    return this.repo.getList(opts)
  }

  setPath(_path: string): void {
    // 路径设置保存在 SettingsManager 中
  }

  private update(id: string, updates: { state?: string; received_bytes?: number; total_bytes?: number; error_msg?: string | null }): void {
    this.repo.update(id, updates)
  }

  private getDefaultPath(): string {
    return this.settingsManager.get('downloadPath') || require('electron').app.getPath('downloads')
  }

  private broadcastProgress(data: { id: string; state: string; receivedBytes: number; totalBytes: number }): void {
    this.window.webContents.send('download:progress', data)
  }
}
```

**注意**：上面的 `crypto` 需要导入，实际实现中应该从 `node:crypto` 导入。

- [ ] **Step 2: 提交**

```bash
git add apps/main/src/download-manager.ts
git commit -m "feat(main): add DownloadManager with download tracking and progress broadcast"
```

---

### Task 5: HistoryManager

**Files:**
- Create: `apps/main/src/history-manager.ts`
- Modify: `apps/main/src/tab-manager.ts`（在 `did-navigate` 中自动添加历史记录）

**Interfaces:**
- Consumes: `HistoryRepository` from `@wmfx/database`
- Produces: `HistoryManager`

- [ ] **Step 1: 实现 HistoryManager**

创建 `apps/main/src/history-manager.ts`：

```typescript
import { HistoryRepository } from '@wmfx/database'

export interface HistoryAddOptions {
  url: string
  title?: string | null
  favicon?: string | null
}

export class HistoryManager {
  constructor(private repo: HistoryRepository) {}

  add(opts: HistoryAddOptions): void {
    const existing = this.repo.find(opts.url)
    if (existing) {
      this.repo.incrementVisitCount(opts.url)
      return
    }
    this.repo.add({
      url: opts.url,
      title: opts.title ?? null,
      favicon: opts.favicon ?? null,
      visit_time: Date.now(),
      visit_count: 1,
    })
  }

  search(query: string, limit = 50, offset = 0) {
    return this.repo.search(query, limit, offset)
  }

  getList(limit = 50, offset = 0) {
    return this.repo.getList(limit, offset)
  }

  delete(id: string): boolean {
    return this.repo.delete(id)
  }

  clear(): void {
    this.repo.clear()
  }
}
```

- [ ] **Step 2: 修改 TabManager 自动记录历史**

在 `apps/main/src/tab-manager.ts` 中，`setupTabListeners` 方法的 `did-navigate` 事件处理中，添加历史记录的调用。

需要在 TabManager 构造器中注入 `HistoryManager`：

```typescript
// 在 constructor 中添加参数
constructor(
  private window: BrowserWindow,
  private getSession: (name: string) => Session,
  private defaultSessionName: string = 'default',
  private historyManager: HistoryManager
) {
```

在 `did-navigate` 监听中添加：
```typescript
webContentsObj.on('did-navigate', (_e, url) => {
  const tab = this.tabs.get(tabId)
  if (tab) {
    tab.state.url = url || ''
    tab.state.canGoBack = webContentsObj.canGoBack()
    tab.state.canGoForward = webContentsObj.canGoForward()
    this.broadcastState(tab)

    // 自动记录历史
    if (url && !url.startsWith('about:') && !url.startsWith('chrome:')) {
      this.historyManager.add({
        url,
        title: tab.state.title || null,
        favicon: tab.state.favicon,
      })
    }
  }
})
```

- [ ] **Step 3: 提交**

```bash
git add apps/main/src/history-manager.ts apps/main/src/tab-manager.ts
git commit -m "feat(main): add HistoryManager with auto-logging via TabManager"
```

---

### Task 6: BookmarkManager

**Files:**
- Create: `apps/main/src/bookmark-manager.ts`

**Interfaces:**
- Consumes: `BookmarkRepository` from `@wmfx/database`
- Produces: `BookmarkManager`（含 HTML 导入导出）

- [ ] **Step 1: 实现 BookmarkManager**

创建 `apps/main/src/bookmark-manager.ts`：

```typescript
import { BookmarkRepository } from '@wmfx/database'

export interface BookmarkCreateOptions {
  title: string
  url: string | null
  favicon?: string | null
  parentId?: string | null
}

export interface BookmarkItemDto {
  id: string
  parentId: string | null
  title: string
  url: string | null
  favicon: string | null
  position: number
  createdAt: number
}

export class BookmarkManager {
  constructor(private repo: BookmarkRepository) {}

  create(opts: BookmarkCreateOptions): { id: string } {
    const parentId = opts.parentId ?? null
    const siblings = this.repo.getList(parentId)
    const maxPos = siblings.reduce((max, b) => Math.max(max, b.position), -1)
    const id = this.repo.create({
      title: opts.title,
      url: opts.url,
      favicon: opts.favicon ?? null,
      parentId,
      position: maxPos + 1,
    })
    return { id }
  }

  delete(id: string): boolean {
    return this.repo.delete(id)
  }

  rename(id: string, title: string): void {
    this.repo.update(id, { title })
  }

  getList(parentId?: string | null): BookmarkItemDto[] {
    return this.repo.getList(parentId)
  }

  search(query: string): BookmarkItemDto[] {
    return this.repo.search(query)
  }

  importHTML(html: string): void {
    // 解析 HTML 书签格式
    // 使用 DOMParser（在 Node.js 中可以用 cheerio 或原生解析）
    // 这里用简单的字符串解析
    const links = this.parseBookmarksHTML(html)
    for (const link of links) {
      this.repo.create({
        title: link.title,
        url: link.url ?? null,
        favicon: null,
        parentId: null,
        position: 0,
      })
    }
  }

  exportHTML(): { html: string } {
    const items = this.repo.getList(null)
    const html = this.buildBookmarksHTML(items)
    return { html }
  }

  private parseBookmarksHTML(html: string): Array<{ title: string; url: string | null }> {
    const links: Array<{ title: string; url: string | null }> = []
    const urlRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi
    let match
    while ((match = urlRegex.exec(html)) !== null) {
      const url = match[1]
      const title = match[2].trim()
      if (title && url.startsWith('http')) {
        links.push({ title, url })
      }
    }
    return links
  }

  private buildBookmarksHTML(items: BookmarkItemDto[]): string {
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>Bookmarks</title>
<h1>Bookmarks</h1>
<dl><p>\n`
    for (const item of items) {
      html += `<dt><a href="${item.url}">${item.title}</a></dt>\n`
    }
    html += `</dl><p>\n`
    return html
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/main/src/bookmark-manager.ts
git commit -m "feat(main): add BookmarkManager with folder hierarchy and HTML import/export"
```

---

### Task 7: 所有 Manager 注入到 window-manager + index.ts

**Files:**
- Modify: `apps/main/src/window-manager.ts`
- Modify: `apps/main/src/index.ts`

**Interfaces:**
- Consumes: 所有新 Manager
- Produces: 扩展的 `BrowserWindowInstance`

- [ ] **Step 1: 修改 window-manager.ts**

```typescript
import { BrowserWindow } from 'electron'
import { getPreloadPath, getRendererDevServerUrl, getRendererIndexHtml } from './paths'
import { SessionManager } from './session-manager'
import { TabManager } from './tab-manager'
import { NavigationManager } from './navigation-manager'
import { SettingsManager } from './settings-manager'
import { DownloadManager } from './download-manager'
import { HistoryManager } from './history-manager'
import { BookmarkManager } from './bookmark-manager'
import { DatabaseManager, HistoryRepository, DownloadRepository, BookmarkRepository } from '@wmfx/database'

export interface BrowserWindowInstance {
  window: BrowserWindow
  tabManager: TabManager
  navigationManager: NavigationManager
  settingsManager: SettingsManager
  downloadManager: DownloadManager
  historyManager: HistoryManager
  bookmarkManager: BookmarkManager
}

export function createMainWindow(): BrowserWindowInstance {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const sessionManager = new SessionManager()
  const settingsManager = new SettingsManager()
  const database = DatabaseManager.getInstance()
  const historyRepo = new HistoryRepository(database.db)
  const downloadRepo = new DownloadRepository(database.db)
  const bookmarkRepo = new BookmarkRepository(database.db)

  const historyManager = new HistoryManager(historyRepo)
  const tabManager = new TabManager(win, (name) => sessionManager.getSession(name), 'default', historyManager)
  const navigationManager = new NavigationManager(tabManager)
  const downloadManager = new DownloadManager(win, downloadRepo, settingsManager)
  const bookmarkManager = new BookmarkManager(bookmarkRepo)

  win.once('ready-to-show', () => win.show())

  const devUrl = getRendererDevServerUrl()
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(getRendererIndexHtml())
  }

  return {
    window: win,
    tabManager,
    navigationManager,
    settingsManager,
    downloadManager,
    historyManager,
    bookmarkManager,
  }
}
```

- [ ] **Step 2: 修改 index.ts — 主题初始化**

```typescript
import { app, BrowserWindow, nativeTheme } from 'electron'
import { registerIpcHandlers } from './ipc/register'
import { registerAppShortcut, toggleDevTools } from './shortcut'
import type { BrowserWindowInstance } from './window-manager'
import { createMainWindow } from './window-manager'

declare global {
  var browserInstances: Map<string, BrowserWindowInstance>
}
globalThis.browserInstances = new Map()

app.whenReady().then(() => {
  registerIpcHandlers()

  const mainWindow = createMainWindow()
  globalThis.browserInstances.set(String(mainWindow.window.id), mainWindow)

  // 初始化主题
  const theme = mainWindow.settingsManager.get('theme')
  if (theme === 'dark') {
    nativeTheme.themeSource = 'dark'
  } else if (theme === 'light') {
    nativeTheme.themeSource = 'light'
  }

  mainWindow.tabManager.create({ url: 'https://www.google.com' })
  // ... 其余保持不变
})
```

- [ ] **Step 3: 提交**

```bash
git add apps/main/src/window-manager.ts apps/main/src/index.ts
git commit -m "feat(main): wire all M2 managers into window-manager and init theme"
```

---

### Task 8: IPC 注册

**Files:**
- Modify: `apps/main/src/ipc/register.ts`

**Interfaces:**
- Consumes: `BrowserWindowInstance` 中所有 Manager

- [ ] **Step 1: 扩展 register.ts**

在现有 handlers 之后添加所有新通道的 handler。模式与 Task 5（M1 IPC 注册）一致，通过 `getInstance()` 获取当前窗口的 Manager 实例。

需要为以下通道添加 handler：
- `download:*`（create, pause, resume, cancel, get, getList, setPath）
- `history:*`（add, delete, search, getList, clear）
- `bookmark:*`（add, delete, rename, getList, search, import, export）
- `page:*`（print, printToPDF, setZoom, getZoom）
- `settings:*`（get, set, getAll）
- `theme:*`（get, set）

每个 handler 模式：
```typescript
handle('history:search', (opts) => {
  const inst = getInstance()
  if (!inst) return []
  const { query = '', limit = 50, offset = 0 } = opts
  return inst.historyManager.search(query, limit, offset)
})
```

- [ ] **Step 2: 构建验证**

```bash
bun run build:main && bun run typecheck
```

- [ ] **Step 3: 提交**

```bash
git add apps/main/src/ipc/register.ts
git commit -m "feat(main): register all M2 IPC handlers (download/history/bookmark/settings/theme/page)"
```

---

### Task 9: preload 扩展

**Files:**
- Modify: `apps/main/src/preload.ts`

- [ ] **Step 1: 扩展 preload.ts**

添加所有新 API 方法：

```typescript
import type {
  DownloadCreateOptions,
  DownloadListOptions,
  HistoryItem,
  BookmarkCreateOptions,
  ThemeMode,
  TabPrintOptions,
  TabPrintToPdfOptions,
  TabZoomOptions,
  PrintOptions,
  PrintToPdfOptions,
} from '@browser/ipc-contract'
// ... 其余 import

// 添加以下方法到 api 对象：
// Download
createDownload: (opts: DownloadCreateOptions) => Promise<{ id: string }>
pauseDownload: (id: string) => Promise<void>
resumeDownload: (id: string) => Promise<void>
cancelDownload: (id: string) => Promise<void>
getDownload: (id: string) => Promise<DownloadItem | null>
getDownloads: (opts?: DownloadListOptions) => Promise<DownloadItem[]>
setDownloadPath: (path: string) => Promise<void>
// History
addHistory: (item: { url: string; title?: string | null; favicon?: string | null }) => Promise<void>
deleteHistory: (id: string) => Promise<void>
searchHistory: (opts: { query: string; limit?: number; offset?: number }) => Promise<HistoryItem[]>
getHistoryList: (opts?: { limit?: number; offset?: number }) => Promise<HistoryItem[]>
clearHistory: () => Promise<void>
// Bookmark
addBookmark: (item: BookmarkCreateOptions) => Promise<{ id: string }>
deleteBookmark: (id: string) => Promise<void>
renameBookmark: ({ id, title }: { id: string; title: string }) => Promise<void>
getBookmarks: (parentId?: string | null) => Promise<BookmarkItem[]>
searchBookmarks: ({ query }: { query: string }) => Promise<BookmarkItem[]>
importBookmarks: (html: string) => Promise<void>
exportBookmarks: () => Promise<{ html: string }>
// Page
printPage: (opts: TabPrintOptions) => Promise<void>
printToPDF: (opts: TabPrintToPdfOptions) => Promise<{ path: string }>
setZoom: (opts: TabZoomOptions) => Promise<void>
getZoom: (tabId: string) => Promise<{ factor: number }>
// Settings
getSetting: (key: string) => Promise<unknown>
setSetting: ({ key, value }: { key: string; value: unknown }) => Promise<void>
getAllSettings: () => Promise<Record<string, unknown>>
// Theme
getTheme: () => Promise<ThemeMode>
setTheme: (theme: ThemeMode) => Promise<void>
// 广播事件
onDownloadProgress: (cb: (data: { id: string; state: string; receivedBytes: number; totalBytes: number }) => void) => void
```

- [ ] **Step 2: 提交**

```bash
git add apps/main/src/preload.ts
git commit -m "feat(main): extend preload with M2 browserAPI methods"
```

---

### Task 10: env.d.ts 扩展

**Files:**
- Modify: `apps/renderer/src/env.d.ts`

- [ ] **Step 1: 扩展 browserAPI 类型**

在 `browserAPI` 接口中添加所有新方法的类型定义，与 preload 中一致。

- [ ] **Step 2: 提交**

```bash
git add apps/renderer/src/env.d.ts
git commit -m "feat(renderer): extend browserAPI types for M2 features"
```

---

### Task 11: Sidebar + ChromeUI 改造

**Files:**
- Create: `apps/renderer/src/components/Sidebar.vue`
- Modify: `apps/renderer/src/components/ChromeUI.vue`
- Modify: `apps/renderer/src/components/TabBar.vue`（incognito 支持）

- [ ] **Step 1: 创建 Sidebar.vue**

侧边栏组件，包含：历史、书签、下载、设置四个标签页导航，固定宽度 280px，从右侧滑出。

- [ ] **Step 2: 修改 ChromeUI.vue**

在 TabBar 和 Viewport 之间加入 Sidebar，通过按钮切换显示/隐藏。

- [ ] **Step 3: 修改 TabBar.vue**

添加右键菜单支持"新建隐身标签页"，使用 `sessionId: 'incognito'`。

- [ ] **Step 4: 提交**

```bash
git add apps/renderer/src/components/Sidebar.vue apps/renderer/src/components/ChromeUI.vue apps/renderer/src/components/TabBar.vue
git commit -m "feat(renderer): add Sidebar navigation and incognito tab support"
```

---

### Task 12: DownloadsView

**Files:**
- Create: `apps/renderer/src/views/DownloadsView.vue`

**Interfaces:**
- Consumes: `browserAPI`（getDownloads, pauseDownload, resumeDownload, cancelDownload, onDownloadProgress）
- Produces: 下载列表 UI + 进度条 + 操作按钮

- [ ] **Step 1: 实现 DownloadsView.vue**

下载列表视图，显示所有下载任务，支持暂停/恢复/取消操作，实时进度条。

- [ ] **Step 2: 提交**

```bash
git add apps/renderer/src/views/DownloadsView.vue
git commit -m "feat(renderer): add DownloadsView with progress tracking"
```

---

### Task 13: HistoryView

**Files:**
- Create: `apps/renderer/src/views/HistoryView.vue`

**Interfaces:**
- Consumes: `browserAPI`（getHistoryList, searchHistory, deleteHistory, clearHistory）
- Produces: 历史列表 + 搜索框 + 右键菜单（打开新标签/删除）

- [ ] **Step 1: 实现 HistoryView.vue**

历史记录列表，支持关键词搜索，右键菜单删除单条记录。

- [ ] **Step 2: 提交**

```bash
git add apps/renderer/src/views/HistoryView.vue
git commit -m "feat(renderer): add HistoryView with search and delete"
```

---

### Task 14: BookmarkView

**Files:**
- Create: `apps/renderer/src/views/BookmarkView.vue`

**Interfaces:**
- Consumes: `browserAPI`（getBookmarks, addBookmark, deleteBookmark, renameBookmark, searchBookmarks, importBookmarks, exportBookmarks）
- Produces: 书签树形列表 + 搜索 + 右键菜单 + 导入导出

- [ ] **Step 1: 实现 BookmarkView.vue**

书签管理视图，支持文件夹层级展示、搜索、右键菜单（添加/删除/重命名）、导入导出 HTML。

- [ ] **Step 2: 提交**

```bash
git add apps/renderer/src/views/BookmarkView.vue
git commit -m "feat(renderer): add BookmarkView with folder hierarchy and import/export"
```

---

### Task 15: SettingsView + 主题切换

**Files:**
- Create: `apps/renderer/src/views/SettingsView.vue`
- Modify: `apps/renderer/src/components/ChromeUI.vue`（主题 CSS variables）

**Interfaces:**
- Consumes: `browserAPI`（getAllSettings, setSetting, getTheme, setTheme）
- Produces: 设置表单 + 主题切换

- [ ] **Step 1: 实现 SettingsView.vue**

设置页面，包含：
- 主题选择（light/dark/system 单选）
- 下载路径输入框
- 默认搜索引擎选择（google/baidu/bing）
- 新标签页 URL 输入框
- 默认缩放级别滑块

主题切换时调用 `setTheme`，主进程通过 `nativeTheme.themeSource` 切换。

- [ ] **Step 2: 修改 ChromeUI 样式为 CSS variables**

将 ChromeUI.vue 和内联样式改为使用 CSS variables，支持浅/深色切换：

```vue
<style>
:root {
  --bg-primary: #1e1e1e;
  --bg-secondary: #2d2d2d;
  --bg-tertiary: #3d3d3d;
  --text-primary: #e0e0e0;
  --text-secondary: #888;
  --border-color: #1a1a1a;
  --accent-color: #4fc3f7;
  --danger-color: #ff5555;
}

[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-tertiary: #e8e8e8;
  --text-primary: #1a1a1a;
  --text-secondary: #666;
  --border-color: #e0e0e0;
  --accent-color: #1976d2;
  --danger-color: #d32f2f;
}
</style>
```

- [ ] **Step 3: 提交**

```bash
git add apps/renderer/src/views/SettingsView.vue apps/renderer/src/components/ChromeUI.vue
git commit -m "feat(renderer): add SettingsView and CSS variables for light/dark theme"
```

---

### Task 16: AddressBar 增强（打印/缩放）

**Files:**
- Modify: `apps/renderer/src/components/AddressBar.vue`

- [ ] **Step 1: 添加打印和缩放按钮**

在地址栏右侧添加：
- 打印按钮（点击调用 `printPage`）
- 缩放显示/设置按钮（显示当前缩放百分比，点击可切换 50%/75%/100%/125%/150%）

- [ ] **Step 2: 提交**

```bash
git add apps/renderer/src/components/AddressBar.vue
git commit -m "feat(renderer): add print and zoom controls to AddressBar"
```

---

### Task 17: 构建验证 + lint

- [ ] **Step 1: 完整构建**

```bash
bun run build
```

- [ ] **Step 2: 完整 lint**

```bash
bun run lint
```

- [ ] **Step 3: 修复所有 lint 错误**

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: fix all lint issues for M2"
```

---

### Task 18: E2E 测试更新

**Files:**
- Modify: `e2e/app.spec.ts`

- [ ] **Step 1: 添加 M2 功能测试**

在现有测试基础上增加：
- 下载列表可见性测试
- 历史记录搜索测试
- 书签添加测试
- 主题切换测试
- 侧边栏导航测试

- [ ] **Step 2: 提交**

```bash
git add e2e/app.spec.ts
git commit -m "test(e2e): add M2 feature tests"
```

---

## 验收标准

- [ ] 下载管理：能创建下载、暂停、恢复、取消，进度实时更新
- [ ] 历史记录：自动记录、搜索、删除、清空
- [ ] 书签：添加、删除、重命名、文件夹、搜索、导入导出 HTML
- [ ] 隐身模式：TabBar 右键新建隐身标签页，正确使用 incognito partition
- [ ] 打印/PDF：能打印页面、导出 PDF
- [ ] 缩放：能设置缩放级别，设置存储到 SettingsManager
- [ ] 设置界面：能修改主题、下载路径、默认搜索、新标签页 URL
- [ ] 主题：浅色/深色/system 三模式正常切换，nativeTheme.themeSource 控制标签页主题
- [ ] 侧边栏：能切换历史记录/书签/下载/设置视图
- [ ] 所有 lint/typecheck/build 通过
