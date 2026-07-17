# NativeMenu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap Electron's native `Menu` API to provide a type-safe, Iconify-powered context menu system for the renderer process.

**Architecture:** Renderer defines menu descriptors (with checkbox/radio/submenu/icon support) → IPC to main process → `NativeIconManager` converts Iconify names to `NativeImage` (cached) → `Menu.buildFromTemplate()` → `Menu.popup()` → click/dismiss events routed back via `menuId`.

**Tech Stack:** Electron Menu API, `@iconify/utils` + `@iconify-json/*`, TypeScript, IPC contract types.

## Global Constraints

- Package manager: `bun` (not pnpm, not npm)
- All public types/classes use `Native` prefix
- Icon names are `NativeIconName` union type (build-time generated from icon packs)
- IPC channels follow existing `handle` pattern in `register.ts`
- Logging: `console.debug` for dev details, `console.info` for key lifecycle
- Code style: Biome formatter, no comments unless architecture-critical

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/ipc-contract/src/menu.ts` | Create | `NativeMenuItemDescriptor`, `NativeMenuItemType` types |
| `packages/ipc-contract/src/icon-names.d.ts` | Create (generated) | `NativeIconName` union type |
| `packages/ipc-contract/src/channels.ts` | Modify | Add `native-menu:*` IPC channels |
| `packages/ipc-contract/src/index.ts` | Modify | Export new types |
| `apps/main/src/native-icon-manager.ts` | Create | Iconify → NativeImage conversion + cache |
| `apps/main/src/native-menu-manager.ts` | Create | `Menu.buildFromTemplate` + IPC routing |
| `apps/main/src/ipc/register.ts` | Modify | Register `native-menu:open/close` handlers |
| `apps/main/src/preload.ts` | Modify | Expose `nativeMenuOpen/Close` + `onNativeMenuAction/Closed` |
| `apps/renderer/src/lib/native-menu.ts` | Create | `NativeMenu` class + global IPC listeners |
| `apps/renderer/src/components/TabBar.vue` | Modify | Replace `DropdownMenu` with `NativeMenu` |
| `scripts/generate-icon-types.ts` | Create | Extract icon names → `NativeIconName` |
| `scripts/dev.ts` | Modify | Run icon type generation at startup |
| `apps/main/package.json` | Modify | Add `@iconify/utils` dependency |

---

### Task 1: Install iconify/utils dependency

**Files:**
- Modify: `apps/main/package.json`

**Interfaces:**
- Consumes: none
- Produces: `@iconify/utils` available for `NativeIconManager`

- [ ] **Step 1: Add @iconify/utils to main process**

```bash
bun add @iconify/utils --filter @browser/main
```

- [ ] **Step 2: Verify installation**

```bash
ls apps/main/node_modules/@iconify/utils/package.json
```

Expected: file exists

- [ ] **Step 3: Commit**

```bash
git add apps/main/package.json apps/main/bun.lock
git commit -m "chore: add @iconify/utils to main process"
```

---

### Task 2: Generate icon types

**Files:**
- Create: `scripts/generate-icon-types.ts`
- Create (generated): `packages/ipc-contract/src/icon-names.d.ts`

**Interfaces:**
- Consumes: `@iconify-json/mdi`, `@iconify-json/ic`, `@iconify-json/carbon` (already in root devDeps)
- Produces: `NativeIconName` union type used by `NativeMenuItemDescriptor.icon`

- [ ] **Step 1: Create the icon type generator script**

```ts
// scripts/generate-icon-types.ts
import { readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

interface IconSet {
  prefix: string
  icons: Record<string, unknown>
}

const PACKAGES: { prefix: string; pkg: string }[] = [
  { prefix: 'mdi', pkg: '@iconify-json/mdi' },
  { prefix: 'ic', pkg: '@iconify-json/ic' },
  { prefix: 'carbon', pkg: '@iconify-json/carbon' },
]

function extractIconNames(prefix: string, pkgName: string): string[] {
  try {
    const iconSet: IconSet = require(pkgName)
    return Object.keys(iconSet.icons || {}).map((name) => `${prefix}:${name}`)
  } catch {
    console.warn(`[generate-icon-types] skipped ${pkgName}: not installed`)
    return []
  }
}

function main(): void {
  const allIcons: string[] = []

  for (const { prefix, pkg } of PACKAGES) {
    const icons = extractIconNames(prefix, pkg)
    allIcons.push(...icons)
    console.log(`[generate-icon-types] ${pkg}: ${icons.length} icons`)
  }

  allIcons.sort()

  const lines = allIcons.map((name) => `  | '${name}'`)
  const content = `// 自动生成，请勿手动编辑
// 运行: bunx tsx scripts/generate-icon-types.ts
export type NativeIconName =
${lines.join('\n')}
`

  const outPath = path.join(ROOT, 'packages/ipc-contract/src/icon-names.d.ts')
  writeFileSync(outPath, content, 'utf-8')
  console.log(`[generate-icon-types] wrote ${allIcons.length} icons to ${path.relative(ROOT, outPath)}`)
}

main()
```

- [ ] **Step 2: Run the script to generate icon-names.d.ts**

```bash
bunx tsx scripts/generate-icon-types.ts
```

Expected output: `[generate-icon-types] @iconify-json/mdi: N icons ... wrote N icons to packages/ipc-contract/src/icon-names.d.ts`

- [ ] **Step 3: Verify generated file exists and has correct format**

```bash
head -5 packages/ipc-contract/src/icon-names.d.ts
```

Expected: starts with `// 自动生成，请勿手动编辑` and contains `export type NativeIconName =`

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-icon-types.ts packages/ipc-contract/src/icon-names.d.ts
git commit -m "feat: add icon type generator script"
```

---

### Task 3: Add NativeMenuItemDescriptor type

**Files:**
- Create: `packages/ipc-contract/src/menu.ts`

**Interfaces:**
- Consumes: `NativeIconName` from `./icon-names`
- Produces: `NativeMenuItemDescriptor`, `NativeMenuItemType` used by IPC channels and all consumers

- [ ] **Step 1: Create menu type definitions**

```ts
// packages/ipc-contract/src/menu.ts
import type { NativeIconName } from './icon-names'

export type NativeMenuItemType = 'item' | 'separator' | 'checkbox' | 'radio' | 'submenu'

export interface NativeMenuItemDescriptor {
  id: string
  type?: NativeMenuItemType
  label?: string
  icon?: NativeIconName
  shortcut?: string
  enabled?: boolean
  checked?: boolean
  /** 预留字段，Electron 原生菜单暂不支持自定义颜色 */
  danger?: boolean
  children?: NativeMenuItemDescriptor[]
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ipc-contract/src/menu.ts
git commit -m "feat: add NativeMenuItemDescriptor type"
```

---

### Task 4: Add IPC channels

**Files:**
- Modify: `packages/ipc-contract/src/channels.ts`
- Modify: `packages/ipc-contract/src/index.ts`

**Interfaces:**
- Consumes: `NativeMenuItemDescriptor` from `./menu`
- Produces: `native-menu:open`, `native-menu:close`, `native-menu:action`, `native-menu:closed` channels

- [ ] **Step 1: Add NativeMenuItemDescriptor import to channels.ts**

At the top of `packages/ipc-contract/src/channels.ts`, add after the existing imports:

```ts
import type { NativeMenuItemDescriptor } from './menu'
```

- [ ] **Step 2: Add 4 native-menu channels to IpcContract**

Add before the closing `}` of `IpcContract`:

```ts
  // Native Menu
  'native-menu:open': (menuId: string, items: NativeMenuItemDescriptor[], position?: { x: number; y: number }) => Promise<void>
  'native-menu:close': (menuId: string) => Promise<void>
  // 主进程 → 渲染器（广播）
  'native-menu:action': (payload: { menuId: string; itemId: string }) => void
  'native-menu:closed': (menuId: string) => void
```

- [ ] **Step 3: Add channels to IPC_CHANNELS array**

Add after the `// Popover` section in the `IPC_CHANNELS` array:

```ts
  // Native Menu
  'native-menu:open',
  'native-menu:close',
  'native-menu:action',
  'native-menu:closed',
```

- [ ] **Step 4: Export new types from index.ts**

Add to the named exports in `packages/ipc-contract/src/index.ts`:

```ts
export type {
  // ... existing exports ...
  NativeMenuItemDescriptor,
  NativeMenuItemType,
} from './menu'
```

- [ ] **Step 5: Commit**

```bash
git add packages/ipc-contract/src/channels.ts packages/ipc-contract/src/index.ts
git commit -m "feat: add native-menu IPC channels"
```

---

### Task 5: Implement NativeIconManager

**Files:**
- Create: `apps/main/src/native-icon-manager.ts`

**Interfaces:**
- Consumes: `@iconify/utils` (`getIconData`, `iconToSVG`), `@iconify-json/*` packages
- Produces: `NativeIconManager.get(name)` → `NativeImage | undefined`

- [ ] **Step 1: Create NativeIconManager**

```ts
// apps/main/src/native-icon-manager.ts
import type { IconifyJSON } from '@iconify/utils'
import { getIconData, iconToSVG, importIcon } from '@iconify/utils'
import { nativeImage } from 'electron'

/**
 * Iconify 图标名 → Electron NativeImage 转换器。
 * 使用 @iconify/utils 从已安装的图标包读取 SVG 数据，
 * 转换为 PNG buffer 后创建 NativeImage。结果按名称缓存，避免重复转换。
 */
export class NativeIconManager {
  private cache = new Map<string, Electron.NativeImage>()

  async get(name: string): Promise<Electron.NativeImage | undefined> {
    const cached = this.cache.get(name)
    if (cached) return cached

    const colonIdx = name.indexOf(':')
    if (colonIdx === -1) {
      console.warn('[NativeIconManager] get: invalid icon name format', name)
      return undefined
    }

    const prefix = name.slice(0, colonIdx)
    const iconName = name.slice(colonIdx + 1)

    try {
      const iconSet = await this.loadIconSet(prefix)
      if (!iconSet) return undefined

      const iconData = getIconData(iconSet, iconName)
      if (!iconData) {
        console.warn('[NativeIconManager] get: icon not found', name)
        return undefined
      }

      const svgResult = iconToSVG(iconData)
      if (!svgResult) return undefined

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${svgResult.attributes}>${svgResult.body}</svg>`
      const buffer = Buffer.from(svg)
      const image = nativeImage.createFromBuffer(buffer)

      this.cache.set(name, image)
      console.debug('[NativeIconManager] get: converted & cached', name)
      return image
    } catch (err) {
      console.error('[NativeIconManager] get: conversion failed', name, err)
      return undefined
    }
  }

  async warmup(names: string[]): Promise<void> {
    for (const name of names) {
      await this.get(name)
    }
    console.info('[NativeIconManager] warmup: cached %d icons', this.cache.size)
  }

  private loadedSets = new Map<string, IconifyJSON>()

  private async loadIconSet(prefix: string): Promise<IconifyJSON | undefined> {
    if (this.loadedSets.has(prefix)) return this.loadedSets.get(prefix)

    try {
      // 动态导入图标包（@iconify-json/* 以 JSON 形式导出）
      const mod = await import(`@iconify-json/${prefix}`)
      const iconSet: IconifyJSON = mod.default || mod
      this.loadedSets.set(prefix, iconSet)
      return iconSet
    } catch {
      console.warn('[NativeIconManager] loadIconSet: package not installed', prefix)
      return undefined
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/main/src/native-icon-manager.ts
git commit -m "feat: implement NativeIconManager"
```

---

### Task 6: Implement NativeMenuManager

**Files:**
- Create: `apps/main/src/native-menu-manager.ts`

**Interfaces:**
- Consumes: `NativeMenuItemDescriptor` from `@browser/ipc-contract`, `NativeIconManager` from `./native-icon-manager`
- Produces: `NativeMenuManager.open(menuId, items, position?)`, `NativeMenuManager.close(menuId)`

- [ ] **Step 1: Create NativeMenuManager**

```ts
// apps/main/src/native-menu-manager.ts
import type { NativeMenuItemDescriptor } from '@browser/ipc-contract'
import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import type { NativeIconManager } from './native-icon-manager'

/**
 * Electron 原生菜单管理器。
 * 接收渲染器的菜单描述符，转换为 Electron MenuItemConstructorOptions，
 * 通过 Menu.popup() 显示。点击事件通过 IPC 路由回渲染器。
 */
export class NativeMenuManager {
  private currentMenu: Menu | null = null

  constructor(
    private win: BrowserWindow,
    private iconManager: NativeIconManager
  ) {}

  async open(menuId: string, items: NativeMenuItemDescriptor[], position?: { x: number; y: number }): Promise<void> {
    console.info('[NativeMenuManager] open: menuId itemCount', menuId, items.length)

    // 关闭上一个菜单
    if (this.currentMenu) {
      this.currentMenu = null
    }

    const template = await this.buildTemplate(items, menuId)
    this.currentMenu = Menu.buildFromTemplate(template)

    this.currentMenu.on('close', () => {
      console.debug('[NativeMenuManager] close event: menuId', menuId)
      this.currentMenu = null
      this.win.webContents.send('native-menu:closed', menuId)
    })

    this.currentMenu.popup({
      window: this.win,
      x: position?.x,
      y: position?.y,
    })
  }

  close(_menuId: string): void {
    if (this.currentMenu) {
      this.currentMenu.closePopup()
      this.currentMenu = null
    }
  }

  private async buildTemplate(
    items: NativeMenuItemDescriptor[],
    menuId: string
  ): Promise<MenuItemConstructorOptions[]> {
    const results: MenuItemConstructorOptions[] = []

    for (const item of items) {
      if (item.type === 'separator') {
        results.push({ type: 'separator' })
        continue
      }

      const templateItem: MenuItemConstructorOptions = {
        id: item.id,
        label: item.label,
        type: item.type === 'submenu' ? 'submenu' : (item.type ?? 'normal'),
        enabled: item.enabled ?? true,
      }

      if (item.type === 'checkbox' || item.type === 'radio') {
        templateItem.checked = item.checked ?? false
      }

      if (item.icon) {
        const image = await this.iconManager.get(item.icon)
        if (image) templateItem.icon = image
      }

      if (item.type !== 'separator' && item.type !== 'submenu') {
        templateItem.click = () => {
          console.debug('[NativeMenuManager] click: menuId itemId', menuId, item.id)
          this.win.webContents.send('native-menu:action', { menuId, itemId: item.id })
        }
      }

      if (item.children) {
        templateItem.submenu = await this.buildTemplate(item.children, menuId)
      }

      results.push(templateItem)
    }

    return results
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/main/src/native-menu-manager.ts
git commit -m "feat: implement NativeMenuManager"
```

---

### Task 7: Register IPC handlers + instantiate managers

**Files:**
- Modify: `apps/main/src/ipc/register.ts`

**Interfaces:**
- Consumes: `NativeMenuManager`, `NativeIconManager` from Task 5/6
- Produces: `native-menu:open/close` IPC handlers registered

- [ ] **Step 1: Add imports at top of register.ts**

```ts
import { NativeIconManager } from '../native-icon-manager'
import { NativeMenuManager } from '../native-menu-manager'
```

- [ ] **Step 2: Add module-level manager instances**

After the existing module-level variables (after `const findQueries = ...`):

```ts
/** NativeMenu 相关实例，由 initNativeMenu 初始化 */
let nativeMenuManager: NativeMenuManager | null = null

export function initNativeMenu(win: BrowserWindow): void {
  const iconManager = new NativeIconManager()
  nativeMenuManager = new NativeMenuManager(win, iconManager)
  console.info('[IPC] initNativeMenu: initialized')
}
```

- [ ] **Step 3: Add IPC handlers inside registerIpcHandlers()**

Add at the end of the `registerIpcHandlers()` function, before the closing `}`:

```ts
  // Native Menu
  handle('native-menu:open', async (_event, menuId, items, position) => {
    if (nativeMenuManager) {
      await nativeMenuManager.open(menuId, items, position)
    }
  })

  handle('native-menu:close', (_event, menuId) => {
    if (nativeMenuManager) {
      nativeMenuManager.close(menuId)
    }
  })
```

- [ ] **Step 4: Find where registerIpcHandlers is called to add initNativeMenu**

Search for where `registerIpcHandlers()` is called (likely in `index.ts` or `window-manager.ts`):

```bash
grep -rn "registerIpcHandlers" apps/main/src/
```

Add `initNativeMenu(win)` call after `registerIpcHandlers()`, passing the main BrowserWindow.

- [ ] **Step 5: Commit**

```bash
git add apps/main/src/ipc/register.ts
git commit -m "feat: register native-menu IPC handlers"
```

---

### Task 8: Add preload API

**Files:**
- Modify: `apps/main/src/preload.ts`

**Interfaces:**
- Consumes: `NativeMenuItemDescriptor` from `@browser/ipc-contract`
- Produces: `nativeMenuOpen`, `nativeMenuClose`, `onNativeMenuAction`, `onNativeMenuClosed` on `window.browserAPI`

- [ ] **Step 1: Add NativeMenuItemDescriptor import**

Add to the import from `@browser/ipc-contract`:

```ts
import type {
  // ... existing imports ...
  NativeMenuItemDescriptor,
} from '@browser/ipc-contract'
```

- [ ] **Step 2: Add type declarations to api object type**

Add in the `api` type definition:

```ts
  // Native Menu
  nativeMenuOpen: (menuId: string, items: NativeMenuItemDescriptor[], position?: { x: number; y: number }) => Promise<void>
  nativeMenuClose: (menuId: string) => Promise<void>
  onNativeMenuAction: (cb: (payload: { menuId: string; itemId: string }) => void) => void
  onNativeMenuClosed: (cb: (menuId: string) => void) => void
```

- [ ] **Step 3: Add implementations to api object**

Add before the closing `}` of the api object:

```ts
  // Native Menu
  nativeMenuOpen: (menuId, items, position) => ipcRenderer.invoke('native-menu:open', menuId, items, position),
  nativeMenuClose: (menuId) => ipcRenderer.invoke('native-menu:close', menuId),
  onNativeMenuAction: (cb) => ipcRenderer.on('native-menu:action', (_e, payload) => cb(payload as { menuId: string; itemId: string })),
  onNativeMenuClosed: (cb) => ipcRenderer.on('native-menu:closed', (_e, menuId) => cb(menuId as string)),
```

- [ ] **Step 4: Commit**

```bash
git add apps/main/src/preload.ts
git commit -m "feat: expose native menu API in preload"
```

---

### Task 9: Implement NativeMenu renderer class

**Files:**
- Create: `apps/renderer/src/lib/native-menu.ts`

**Interfaces:**
- Consumes: `NativeMenuItemDescriptor` from `@browser/ipc-contract`, `window.browserAPI.*` from preload
- Produces: `NativeMenu` class used by TabBar and other components

- [ ] **Step 1: Create NativeMenu class**

```ts
// apps/renderer/src/lib/native-menu.ts
import type { NativeMenuItemDescriptor } from '@browser/ipc-contract'

/** menuId → onEvent callback，用于路由面板事件到对应的 NativeMenu 实例 */
const eventMap = new Map<string, (eventName: string, eventData?: unknown) => void>()
/** menuId → onClose callback，菜单被外部关闭时通知 NativeMenu 实例 */
const closeCallbacks = new Map<string, () => void>()

// 模块加载时注册一次全局 IPC 监听
window.browserAPI.onNativeMenuAction((payload) => {
  console.debug('[NativeMenu] onNativeMenuAction: menuId itemId', payload.menuId, payload.itemId)
  eventMap.get(payload.menuId)?.('select', payload.itemId)
})

window.browserAPI.onNativeMenuClosed((menuId) => {
  console.debug('[NativeMenu] onNativeMenuClosed: menuId', menuId)
  eventMap.delete(menuId)
  closeCallbacks.get(menuId)?.()
  closeCallbacks.delete(menuId)
})

export interface NativeMenuOptions {
  items: NativeMenuItemDescriptor[]
  onEvent?: (eventName: string, eventData?: unknown) => void
  onClose?: () => void
  autoOpen?: boolean
}

/**
 * Electron 原生菜单的渲染器侧封装。
 * 通过 IPC 将菜单描述符发送到主进程，主进程构建 Menu 并 popup。
 * 点击/关闭事件通过 menuId 路由回对应实例。
 *
 * 参考 Popover 类的设计模式：构造时自动 open（除非 autoOpen=false），
 * 事件通过全局 IPC 监听器按 menuId 分发。
 */
export class NativeMenu {
  private menuId = crypto.randomUUID()
  private opened = false

  constructor(private opts: NativeMenuOptions) {
    if (opts.onClose) {
      closeCallbacks.set(this.menuId, opts.onClose)
    }
    if (opts.autoOpen !== false) this.open()
  }

  open(e?: MouseEvent): Promise<void> {
    if (this.opened) return Promise.resolve()
    console.debug('[NativeMenu] open: menuId itemCount', this.menuId, this.opts.items.length)

    if (this.opts.onEvent) {
      eventMap.set(this.menuId, this.opts.onEvent)
    }

    const position = e ? { x: e.clientX, y: e.clientY } : undefined
    return window.browserAPI.nativeMenuOpen(this.menuId, this.opts.items, position)
    this.opened = true
  }

  close(): void {
    if (!this.opened) return
    console.debug('[NativeMenu] close: menuId', this.menuId)
    eventMap.delete(this.menuId)
    closeCallbacks.delete(this.menuId)
    void window.browserAPI.nativeMenuClose(this.menuId)
    this.opened = false
  }

  get id(): string {
    return this.menuId
  }
}
```

- [ ] **Step 2: Fix the open() method (missing this.opened = true after await)**

The `open()` method has a bug — `this.opened = true` is after the `return`. Fix:

```ts
  open(e?: MouseEvent): Promise<void> {
    if (this.opened) return Promise.resolve()
    console.debug('[NativeMenu] open: menuId itemCount', this.menuId, this.opts.items.length)

    if (this.opts.onEvent) {
      eventMap.set(this.menuId, this.opts.onEvent)
    }

    const position = e ? { x: e.clientX, y: e.clientY } : undefined
    this.opened = true
    return window.browserAPI.nativeMenuOpen(this.menuId, this.opts.items, position)
  }
```

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/lib/native-menu.ts
git commit -m "feat: implement NativeMenu renderer class"
```

---

### Task 10: Integrate icon generation into dev.ts

**Files:**
- Modify: `scripts/dev.ts`

**Interfaces:**
- Consumes: `scripts/generate-icon-types.ts` from Task 2
- Produces: Icon types regenerated at dev startup

- [ ] **Step 1: Add icon type generation step in main()**

In `scripts/dev.ts`, add after `linkWorkspacePackages()` and before the Vite startup:

```ts
  // 生成图标类型文件（从已安装的图标包提取所有 icon 名称）
  console.log(`${CYAN}[dev]${RESET} 🎨 生成图标类型文件...`)
  try {
    execaCommandSync('bunx tsx scripts/generate-icon-types.ts', { cwd: ROOT, stdio: 'inherit' })
  } catch {
    console.log(`${RED}✗${RESET} 图标类型生成失败（非致命，继续启动）`)
  }
```

- [ ] **Step 2: Commit**

```bash
git add scripts/dev.ts
git commit -m "feat: integrate icon type generation into dev.ts"
```

---

### Task 11: Migrate TabBar to NativeMenu

**Files:**
- Modify: `apps/renderer/src/components/TabBar.vue`

**Interfaces:**
- Consumes: `NativeMenu` from Task 9, existing `TabState`/`runTabAction`
- Produces: TabBar right-click uses NativeMenu instead of DropdownMenu

- [ ] **Step 1: Replace DropdownMenu import with NativeMenu**

In the `<script setup>` section, replace:

```ts
import { DropdownMenu } from '../lib/dropdown-menu'
```

with:

```ts
import { NativeMenu } from '../lib/native-menu'
```

- [ ] **Step 2: Replace openTabContextMenu function**

Replace the entire `openTabContextMenu` function:

```ts
function openTabContextMenu(event: MouseEvent, tab: TabState): void {
  console.debug('[TabBar] openTabContextMenu: tabId', tab.id)
  event.preventDefault()
  event.stopPropagation()
  activeMenuTabId.value = tab.id

  new NativeMenu({
    items: [
      { id: 'new-tab-right', label: t('tab.closeRight'), icon: 'mdi:plus' },
      { id: 'sep-1', type: 'separator' },
      { id: 'reload', label: t('tab.reload'), icon: 'mdi:refresh' },
      { id: 'duplicate', label: t('tab.duplicate'), icon: 'mdi:content-copy' },
      { id: 'pin', type: 'checkbox', label: tab.isPinned ? t('tab.unpinned') : t('tab.pinned'), icon: 'mdi:pin', checked: tab.isPinned },
      {
        id: 'mute',
        type: 'checkbox',
        label: tab.isMuted ? t('tab.unmute') : t('tab.mute'),
        icon: tab.isMuted ? 'mdi:volume-off' : 'mdi:volume-high',
        checked: tab.isMuted,
      },
      { id: 'sep-2', type: 'separator' },
      { id: 'close', label: t('tab.close'), icon: 'mdi:close', danger: true },
      { id: 'close-others', label: t('tab.closeOthers'), icon: 'mdi:close-box-multiple' },
      { id: 'close-left', label: t('tab.closeLeft'), icon: 'mdi:arrow-left-bold-box-outline' },
      { id: 'close-right', label: t('tab.closeRightTabs'), icon: 'mdi:arrow-right-bold-box-outline' },
    ],
    onEvent: (eventName, itemId) => {
      if (eventName === 'select' && typeof itemId === 'string') {
        runTabAction(itemId, tab)
      }
    },
    onClose: () => {
      activeMenuTabId.value = null
    },
  })
}
```

- [ ] **Step 3: Remove old popover dismiss handler and related variables**

Remove from the `<script setup>`:
- `currentMenuPopoverId` variable
- `dismissHandler` variable
- The `onPopoverDismiss` registration in `onMounted`
- The `onPopoverDismiss` cleanup in `onUnmounted`
- The import of `DropdownMenu` (already replaced)

- [ ] **Step 4: Verify type-check passes**

```bash
bun run lint:typecheck
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/renderer/src/components/TabBar.vue
git commit -m "feat: migrate TabBar to NativeMenu"
```

---

### Task 12: Verify full build

**Files:**
- None (verification only)

- [ ] **Step 1: Run lint**

```bash
bun run lint
```

Expected: no errors

- [ ] **Step 2: Run typecheck**

```bash
bun run lint:typecheck
```

Expected: no errors

- [ ] **Step 3: Build all packages**

```bash
bun run build
```

Expected: successful build

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address lint/typecheck issues"
```
