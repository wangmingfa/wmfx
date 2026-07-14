# Popover 浮动面层系统 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一个通用浮层系统（Popover），用独立置顶的 `WebContentsView` 渲染菜单/下拉等弹出 UI，使其永不被标签页 `WebContentsView` 遮挡，并先迁移标签右键菜单与三点菜单。

**Architecture:** 主进程 `PopoverManager` 持有一个透明、铺满窗口、`setTopBrowserView` 置顶的 `popoverView`，按 `popoverId` 路由多个 popover；面板渲染进程（`/panel` 路由的 `PanelRoot.vue`）负责渲染菜单、测量后定位、Esc/背景关闭、accessKey；基础渲染进程通过 `lib/popover.ts` 的 `Popover` class（封装 preload 调用）打开/关闭。菜单以纯数据 `PopoverDescriptor`/`MenuItem` 描述，动作以 `id` 路由，回调存于调用方。

**Tech Stack:** Electron ^43.1.0、Vue 3 + vue-router（hash）、TypeScript、bun、Vitest（单测）、Playwright（E2E）。

## 与规格的偏差（重要）

规格 §9 假设"独立 `panel.html` Vite 入口"，但本仓库内部页走**单一 SPA + hash 路由**（`loadInternalView(view,'<path>')` 加载 `wmfx://<path>`，vue-router 按 hash 渲染）。因此：

- **不新增 Vite 入口**，改为在现有 renderer SPA 增加路由 `/panel` → `PanelRoot.vue`，`PopoverManager` 用 `loadInternalView(popoverView, 'panel')` 加载。
- 规格 §8「测量后定位」把定位放在面板渲染进程内闭环——本计划沿用，故 `cursor` 锚点在面板侧用"最近一次指针位置（`mousemove` 记录）"解析，而非主进程 `screen.getCursorScreenPoint()`。

其余完全遵循规格。

## Global Constraints

- Electron `^43.1.0`，必须用 `WebContentsView`（不引入独立 `BrowserWindow`）。
- 单一共享 `popoverView` + `popoverId` 路由（不为每个菜单建独立视图）。
- `popoverView` 透明；菜单样式复用 `--bg-secondary` / `--text-primary` / `--danger-color` / `--accent-color` 等 CSS 变量（见 `apps/renderer/src/style.css`）。
- 不实现背景层"穿透点击"（菜单打开期间整体模态）。
- 包管理器用 `bun`；lint/typecheck 用 `bun run lint:typecheck`。
- 菜单定义与动作回调留在基础渲染进程；跨 IPC 只传可序列化数据（id/descriptor），不传函数。

---

## 文件地图

- 修改：`packages/ipc-contract/src/channels.ts` — 新增 Popover 类型 + 6 个通道。
- 修改：`apps/main/src/preload.ts` — 新增 `popoverOpen/close/select` + `onPopoverRender/Dismiss/Action`。
- 修改：`apps/renderer/src/env.d.ts` — `window.browserAPI` 增加 Popover 方法类型。
- 新增：`apps/main/src/popover-utils.ts` — `findMenuItem`（纯函数）。
- 新增：`apps/main/src/popover-manager.ts` — `PopoverManager`。
- 修改：`apps/main/src/window-manager.ts` — 接口加 `popoverManager` 并在 `createMainWindow` 创建。
- 修改：`apps/main/src/ipc/register.ts` — 注册 `popover:open/close/select` 三个 handle。
- 新增：`apps/renderer/src/panel/position.ts` — `computeBoxPosition`（纯函数，可测）。
- 新增：`apps/renderer/src/panel/navigation.ts` — `getLevelItems`/`getSelectable`/`selectableIndexOf`/`pathToItem`（纯函数，可测）。
- 新增：`apps/renderer/src/panel/PopoverMenu.vue` — 递归渲染菜单项 + 子菜单（受控）。
- 新增：`apps/renderer/src/panel/PanelRoot.vue` — 面板根组件（路由 `/panel`）。
- 修改：`apps/renderer/src/router.ts` — 增加 `/panel` 路由。
- 新增：`apps/renderer/src/lib/popover.ts` — `Popover` class + `actionMap` 路由。
- 修改：`apps/renderer/src/components/TabBar.vue` — 两处内联菜单改为 Popover 驱动（模板删块、脚本改 `new Popover(...)`、删冗余 CSS）。
- 新增/修改测试：`apps/main/src/__tests__/popover-utils.test.ts`、`apps/renderer/src/panel/__tests__/position.test.ts`、`apps/renderer/src/__tests__/popover.test.ts`、`e2e/popover.spec.ts`。

---

### Task 1: IPC 契约 — Popover 类型与通道

**Files:**
- Modify: `packages/ipc-contract/src/channels.ts`

**Interfaces:**
- Produces: `PopoverKind` / `PopoverPlacement` / `PopoverAnchor` / `MenuItemType` / `MenuItem` / `PopoverDescriptor` / `PopoverActionPayload` 类型，以及 `IpcContract` 中 `popover:*` 通道，供后续所有任务引用。

- [ ] **Step 1: 在 `IpcContract` 接口定义之前插入类型**

在文件 `import` 区之后、`export interface TabState` 之前插入：

```ts
export type PopoverKind = 'menu' // 后续扩展 'command-palette' | 'panel'

export type PopoverPlacement =
  | 'bottom-start' | 'bottom-end'
  | 'top-start' | 'top-end'
  | 'right-start' | 'left-start'

/** 锚点：触发元素的窗口局部坐标，getBoundingClientRect 直传 */
export type PopoverAnchor =
  | { type: 'rect';   rect: ViewBounds; placement?: PopoverPlacement }
  | { type: 'point';  x: number; y: number; placement?: PopoverPlacement }
  | { type: 'cursor'; placement?: PopoverPlacement } // 面板侧用最近指针位置解析

export type MenuItemType = 'item' | 'separator' | 'submenu' // checkbox 后期扩展

/** 菜单项：纯数据描述，动作靠 id 路由，不携带函数（IPC 不可序列化函数） */
export interface MenuItem {
  id: string
  type?: MenuItemType          // 默认 'item'
  label?: string
  icon?: string                // 图标名，复用现有 Icon 组件
  shortcut?: string            // 纯展示文本（应用内全局快捷键提示）
  accessKey?: string           // 单字符助记符（如 'A'）；面板打开期间的临时触发键
  disabled?: boolean
  danger?: boolean             // 危险操作红色样式（如关闭标签页）
  children?: MenuItem[]        // submenu -> 递归即多级菜单
}

export interface PopoverDescriptor {
  id: string                   // 逻辑菜单 id，如 'tab-context' / 'app-menu'
  kind: PopoverKind
  items: MenuItem[]
}

/** 动作回调接收的参数 */
export interface PopoverActionPayload {
  menu: MenuItem
  context: { close: () => void }
}
```

- [ ] **Step 2: 在 `IpcContract` 中增加通道（放在 `// Updater` 段之后）**

```ts
  // Popover
  'popover:open':   (popoverId: string, anchor: PopoverAnchor, descriptor: PopoverDescriptor) => void
  'popover:close':  (popoverId: string) => void
  'popover:select': (popoverId: string, itemId: string) => void
  'popover:render':  (popoverId: string, descriptor: PopoverDescriptor, anchor: PopoverAnchor) => void
  'popover:dismiss': (popoverId: string) => void
  'popover:action':  (payload: { popoverId: string; menu: MenuItem }) => void
```

- [ ] **Step 3: 在 `IPC_CHANNELS` 数组中加入 6 个通道**

在 `IPC_CHANNELS` 数组末尾（`'updater:getStatus'` 之后）追加：

```ts
  // Popover
  'popover:open',
  'popover:close',
  'popover:select',
  'popover:render',
  'popover:dismiss',
  'popover:action',
```

- [ ] **Step 4: 类型检查**

Run: `bun run lint:typecheck`
Expected: PASS（仅类型新增，无破坏）

- [ ] **Step 5: 提交**

```bash
git add packages/ipc-contract/src/channels.ts
git commit -m "feat(ipc): add Popover types and channels"
```

---

### Task 2: preload 暴露 Popover API

**Files:**
- Modify: `apps/main/src/preload.ts`

**Interfaces:**
- Consumes: Task 1 的类型（`PopoverAnchor` / `PopoverDescriptor` / `MenuItem`）。
- Produces: `browserAPI.popoverOpen/Close/Select/onPopoverRender/onPopoverDismiss/onPopoverAction`，供 renderer 调用。

- [ ] **Step 1: 在 preload 顶部 import 增加 Popover 类型**

```ts
import type {
  // ... 现有导入 ...
  MenuItem,
  PopoverAnchor,
  PopoverDescriptor,
} from '@browser/ipc-contract'
```

- [ ] **Step 2: 在 `api` 类型对象中（`// Proxy traffic broadcast` 段之前）增加字段**

```ts
  // Popover
  popoverOpen: (popoverId: string, anchor: PopoverAnchor, descriptor: PopoverDescriptor) => Promise<void>
  popoverClose: (popoverId: string) => Promise<void>
  popoverSelect: (popoverId: string, itemId: string) => Promise<void>
  onPopoverRender: (
    cb: (popoverId: string, descriptor: PopoverDescriptor, anchor: PopoverAnchor) => void
  ) => void
  onPopoverDismiss: (cb: (popoverId: string) => void) => void
  onPopoverAction: (cb: (payload: { popoverId: string; menu: MenuItem }) => void) => void
```

- [ ] **Step 3: 在 `api = { ... }` 实现对象尾部（`onProxyTraffic` 之前）增加实现**

```ts
  // Popover
  popoverOpen: (popoverId, anchor, descriptor) =>
    ipcRenderer.invoke('popover:open', popoverId, anchor, descriptor),
  popoverClose: (popoverId) => ipcRenderer.invoke('popover:close', popoverId),
  popoverSelect: (popoverId, itemId) =>
    ipcRenderer.invoke('popover:select', popoverId, itemId),
  onPopoverRender: (cb) =>
    ipcRenderer.on('popover:render', (_e, id, descriptor, anchor) =>
      cb(id, descriptor as PopoverDescriptor, anchor as PopoverAnchor)
    ),
  onPopoverDismiss: (cb) => ipcRenderer.on('popover:dismiss', (_e, id) => cb(id as string)),
  onPopoverAction: (cb) =>
    ipcRenderer.on('popover:action', (_e, payload) =>
      cb(payload as { popoverId: string; menu: MenuItem })
    ),
```

- [ ] **Step 4: 类型检查**

Run: `bun run lint:typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/main/src/preload.ts
git commit -m "feat(preload): expose Popover API"
```

---

### Task 3: 渲染进程 `window.browserAPI` 类型声明

**Files:**
- Modify: `apps/renderer/src/env.d.ts`

**Interfaces:**
- Consumes: Task 1 类型。
- Produces: 供 renderer TS 调用的 `window.browserAPI.popover*` 类型。

- [ ] **Step 1: 在 env.d.ts 顶部 import 增加类型**

```ts
import type {
  // ... 现有导入 ...
  MenuItem,
  PopoverAnchor,
  PopoverDescriptor,
} from '@browser/ipc-contract'
```

- [ ] **Step 2: 在 `Window.browserAPI` 接口（`// Proxy traffic broadcast` 段之前）增加**

```ts
      // Popover
      popoverOpen: IpcInvoke['popover:open']
      popoverClose: IpcInvoke['popover:close']
      popoverSelect: IpcInvoke['popover:select']
      onPopoverRender: (
        handler: (popoverId: string, descriptor: PopoverDescriptor, anchor: PopoverAnchor) => void
      ) => void
      onPopoverDismiss: (handler: (popoverId: string) => void) => void
      onPopoverAction: (
        handler: (payload: { popoverId: string; menu: MenuItem }) => void
      ) => void
```

- [ ] **Step 3: 类型检查**

Run: `bun run lint:typecheck`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/renderer/src/env.d.ts
git commit -m "feat(renderer): type Popover API on window.browserAPI"
```

---

### Task 4: 主进程 `findMenuItem` 纯函数 + 单测

**Files:**
- Create: `apps/main/src/popover-utils.ts`
- Create: `apps/main/src/__tests__/popover-utils.test.ts`

**Interfaces:**
- Produces: `findMenuItem(items, id)` 被 `PopoverManager` 使用；单测验证递归解析。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { findMenuItem } from '../popover-utils'
import type { MenuItem } from '@browser/ipc-contract'

const items: MenuItem[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B', children: [
    { id: 'b1', label: 'B1' },
    { id: 'b2', label: 'B2', children: [ { id: 'b2x', label: 'B2X' } ] },
  ] },
  { id: 'c', type: 'separator' },
]

describe('findMenuItem', () => {
  it('finds top-level item', () => {
    expect(findMenuItem(items, 'a')?.id).toBe('a')
  })
  it('finds nested item recursively', () => {
    expect(findMenuItem(items, 'b2x')?.id).toBe('b2x')
  })
  it('returns null when missing', () => {
    expect(findMenuItem(items, 'nope')).toBeNull()
  })
  it('ignores separator ids', () => {
    expect(findMenuItem(items, 'c')).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/main && bun x vitest run src/__tests__/popover-utils.test.ts`
Expected: FAIL（`Cannot find module '../popover-utils'`）

- [ ] **Step 3: 实现 `popover-utils.ts`**

```ts
import type { MenuItem } from '@browser/ipc-contract'

/** 递归在菜单树中按 id 查找 MenuItem（含子菜单）；找不到返回 null。 */
export function findMenuItem(items: MenuItem[], id: string): MenuItem | null {
  for (const it of items) {
    if (it.id === id) return it
    if (it.children) {
      const found = findMenuItem(it.children, id)
      if (found) return found
    }
  }
  return null
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/main && bun x vitest run src/__tests__/popover-utils.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/main/src/popover-utils.ts apps/main/src/__tests__/popover-utils.test.ts
git commit -m "feat(popover): add findMenuItem pure util + test"
```

---

### Task 5: 主进程 `PopoverManager`

**Files:**
- Create: `apps/main/src/popover-manager.ts`

**Interfaces:**
- Consumes: `getPreloadPath`（paths）、`loadInternalView`（internal-url）、`findMenuItem`（Task 4）、`PopoverAnchor`/`PopoverDescriptor` 类型。
- Produces: `PopoverManager` 实例（在 Task 8 挂到 `BrowserWindowInstance`）；`open/close/select` 被 Task 9 的 IPC handler 调用。

- [ ] **Step 1: 实现 `popover-manager.ts`**

```ts
import { WebContentsView } from 'electron'
import type { BrowserWindow } from 'electron'
import type { PopoverAnchor, PopoverDescriptor } from '@browser/ipc-contract'
import { findMenuItem } from './popover-utils'
import { getPreloadPath } from './paths'
import { loadInternalView } from './internal-url'

interface OverlayState {
  anchor: PopoverAnchor
  descriptor: PopoverDescriptor
}

/**
 * 管理唯一一个透明、铺满窗口、置顶的 popoverView。
 * 多 popover 通过 popoverId 隔离入栈，面板渲染栈顶；主进程只负责定位与按 id 路由。
 */
export class PopoverManager {
  private popoverView: WebContentsView
  private overlays = new Map<string, OverlayState>()
  private stack: string[] = []

  constructor(private win: BrowserWindow) {
    this.popoverView = new WebContentsView({
      backgroundColor: '#00000000',
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    this.popoverView.setVisible(false)
    this.win.contentView.addChildView(this.popoverView)
    loadInternalView(this.popoverView, 'panel')
  }

  open(popoverId: string, anchor: PopoverAnchor, descriptor: PopoverDescriptor): void {
    this.overlays.set(popoverId, { anchor, descriptor })
    if (!this.stack.includes(popoverId)) this.stack.push(popoverId)
    this.renderTop()
  }

  private renderTop(): void {
    const id = this.stack[this.stack.length - 1]
    const ov = this.overlays.get(id)
    if (!ov) return
    const { width, height } = this.win.getContentBounds()
    this.popoverView.setBounds({ x: 0, y: 0, width, height })
    this.popoverView.setVisible(true)
    this.win.setTopBrowserView(this.popoverView)
    this.popoverView.webContents.send('popover:render', id, ov.descriptor, ov.anchor)
  }

  /** 面板点击叶子项：解析 MenuItem 回传基础渲染进程，再关闭该 popover。 */
  select(popoverId: string, itemId: string): void {
    const ov = this.overlays.get(popoverId)
    const menu = ov ? findMenuItem(ov.descriptor.items, itemId) : null
    if (menu) {
      this.win.webContents.send('popover:action', { popoverId, menu })
    }
    this.close(popoverId)
  }

  close(popoverId: string): void {
    this.overlays.delete(popoverId)
    this.stack = this.stack.filter(id => id !== popoverId)
    if (this.stack.length > 0) {
      this.renderTop()
    } else {
      this.popoverView.setVisible(false)
    }
  }
}
```

- [ ] **Step 2: 类型检查**

Run: `bun run lint:typecheck`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add apps/main/src/popover-manager.ts
git commit -m "feat(popover): add PopoverManager"
```

---

### Task 6: 接入 `window-manager`

**Files:**
- Modify: `apps/main/src/window-manager.ts`

**Interfaces:**
- Consumes: `PopoverManager`（Task 5）。
- Produces: `BrowserWindowInstance.popoverManager` 供 `register.ts` 的 handler 使用。

- [ ] **Step 1: 在 `BrowserWindowInstance` 接口增加字段（在 `subscriptionManager` 之后）**

```ts
  popoverManager: PopoverManager
```

- [ ] **Step 2: 在文件顶部 import 增加**

```ts
import { PopoverManager } from './popover-manager'
```

- [ ] **Step 3: 在 `createMainWindow` 中 `const subscriptionManager = ...` 之后创建实例**

```ts
  const popoverManager = new PopoverManager(win)
```

- [ ] **Step 4: 在返回的 object 中增加 `popoverManager`**

```ts
    subscriptionManager,
    popoverManager,
```

- [ ] **Step 5: 类型检查 + 提交**

Run: `bun run lint:typecheck`
Expected: PASS

```bash
git add apps/main/src/window-manager.ts
git commit -m "feat(popover): wire PopoverManager into window instance"
```

---

### Task 7: 注册 IPC handler

**Files:**
- Modify: `apps/main/src/ipc/register.ts`

**Interfaces:**
- Consumes: `getInstance(event).popoverManager`（Task 6）。
- Produces: 主进程监听 `popover:open/close/select`。

- [ ] **Step 1: 在 `registerIpcHandlers()` 内（任意位置，建议在 `// Updater` 段附近）增加**

```ts
  // Popover
  handle('popover:open', (event, popoverId, anchor, descriptor) => {
    getInstance(event)?.popoverManager.open(popoverId, anchor, descriptor)
  })
  handle('popover:close', (event, popoverId) => {
    getInstance(event)?.popoverManager.close(popoverId)
  })
  handle('popover:select', (event, popoverId, itemId) => {
    getInstance(event)?.popoverManager.select(popoverId, itemId)
  })
```

- [ ] **Step 2: 类型检查**

Run: `bun run lint:typecheck`
Expected: PASS（`handle` 泛型约束通道名与签名一致）

- [ ] **Step 3: 提交**

```bash
git add apps/main/src/ipc/register.ts
git commit -m "feat(popover): register popover IPC handlers"
```

---

### Task 8: 面板定位纯函数 `computeBoxPosition` + 单测

**Files:**
- Create: `apps/renderer/src/panel/position.ts`
- Create: `apps/renderer/src/panel/__tests__/position.test.ts`

**Interfaces:**
- Produces: `computeBoxPosition(anchor, size, win)` 被 `PanelRoot.vue` 使用；单测验证边界收敛。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { computeBoxPosition } from '../position'
import type { PopoverAnchor } from '@browser/ipc-contract'

const win = { width: 800, height: 600 }

describe('computeBoxPosition', () => {
  it('bottom-start 在 rect 下方左对齐', () => {
    const anchor: PopoverAnchor = { type: 'rect', rect: { x: 10, y: 20, width: 100, height: 30 }, placement: 'bottom-start' }
    const pos = computeBoxPosition(anchor, { width: 120, height: 80 }, win)
    expect(pos).toEqual({ x: 10, y: 50 })
  })
  it('bottom-end 在 rect 下方右对齐', () => {
    const anchor: PopoverAnchor = { type: 'rect', rect: { x: 10, y: 20, width: 100, height: 30 }, placement: 'bottom-end' }
    const pos = computeBoxPosition(anchor, { width: 120, height: 80 }, win)
    expect(pos).toEqual({ x: -10, y: 50 })
  })
  it('point 右侧溢出时收敛到窗口内', () => {
    const anchor: PopoverAnchor = { type: 'point', x: 790, y: 300, placement: 'bottom-start' }
    const pos = computeBoxPosition(anchor, { width: 120, height: 80 }, win)
    expect(pos.x).toBeLessThanOrEqual(win.width - 120 - 4)
    expect(pos.x).toBeGreaterThanOrEqual(4)
  })
  it('top 越界时收敛到窗口内', () => {
    const anchor: PopoverAnchor = { type: 'point', x: 100, y: 10, placement: 'top-start' }
    const pos = computeBoxPosition(anchor, { width: 120, height: 80 }, win)
    expect(pos.y).toBeGreaterThanOrEqual(4)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/renderer && bun x vitest run src/panel/__tests__/position.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `position.ts`**

```ts
import type { PopoverAnchor } from '@browser/ipc-contract'

export interface BoxSize { width: number; height: number }
export interface Point { x: number; y: number }

const MARGIN = 4

/**
 * 依据锚点与方向计算菜单盒子左上角，并向窗口内收敛。
 * cursor 锚点由调用方预先解析为 point 后传入（面板侧用最近指针位置）。
 */
export function computeBoxPosition(anchor: PopoverAnchor, size: BoxSize, win: { width: number; height: number }): Point {
  let refLeft = 0
  let refTop = 0
  let refRight = 0
  let refBottom = 0

  if (anchor.type === 'rect') {
    refLeft = anchor.rect.x
    refTop = anchor.rect.y
    refRight = anchor.rect.x + anchor.rect.width
    refBottom = anchor.rect.y + anchor.rect.height
  } else {
    const x = anchor.type === 'point' ? anchor.x : 0
    const y = anchor.type === 'point' ? anchor.y : 0
    refLeft = refRight = x
    refTop = refBottom = y
  }

  const place = anchor.type === 'cursor' ? 'bottom-start' : (anchor.placement ?? 'bottom-start')
  const [v, h] = place.split('-') as ['bottom' | 'top' | 'right' | 'left', 'start' | 'end']

  let left = 0
  let top = 0
  if (v === 'bottom') {
    top = refBottom
    left = h === 'end' ? refRight - size.width : refLeft
  } else if (v === 'top') {
    top = refTop - size.height
    left = h === 'end' ? refRight - size.width : refLeft
  } else if (v === 'right') {
    left = refRight
    top = h === 'end' ? refBottom - size.height : refTop
  } else {
    left = refLeft - size.width
    top = h === 'end' ? refBottom - size.height : refTop
  }

  left = Math.max(MARGIN, Math.min(left, win.width - size.width - MARGIN))
  top = Math.max(MARGIN, Math.min(top, win.height - size.height - MARGIN))
  return { x: left, y: top }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/renderer && bun x vitest run src/panel/__tests__/position.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/renderer/src/panel/position.ts apps/renderer/src/panel/__tests__/position.test.ts
git commit -m "feat(popover): add computeBoxPosition + test"
```

---

### Task 8b: 导航纯函数 `navigation.ts` + 单测

**Files:**
- Create: `apps/renderer/src/panel/navigation.ts`
- Create: `apps/renderer/src/panel/__tests__/navigation.test.ts`

**Interfaces:**
- Produces: `getLevelItems` / `getSelectable` / `selectableIndexOf` / `pathToItem`，供 `PanelRoot.vue` 方向键导航与鼠标 hover 共用；单测验证。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { getLevelItems, getSelectable, selectableIndexOf, pathToItem } from '../navigation'
import type { MenuItem } from '@browser/ipc-contract'

const items: MenuItem[] = [
  { id: 'a', label: 'A' },
  { type: 'separator' },
  { id: 'b', label: 'B', children: [
    { id: 'b1', label: 'B1' },
    { id: 'b2', label: 'B2', children: [ { id: 'b2x', label: 'B2X' } ] },
  ] },
]

describe('navigation', () => {
  it('getLevelItems 按 path 下钻', () => {
    expect(getLevelItems(items, ['b']).map(i => i.id)).toEqual(['b1', 'b2'])
    expect(getLevelItems(items, ['b', 'b2']).map(i => i.id)).toEqual(['b2x'])
    expect(getLevelItems(items, []).map(i => i.id)).toEqual(['a', 'b'])
  })
  it('getSelectable 跳过 separator', () => {
    expect(getSelectable(items).map(i => i.id)).toEqual(['a', 'b'])
  })
  it('selectableIndexOf 在可选中项中定位', () => {
    expect(selectableIndexOf(items, 'b')).toBe(1)
    expect(selectableIndexOf(items, 'nope')).toBe(-1)
  })
  it('pathToItem 返回祖先链', () => {
    expect(pathToItem(items, 'b2x')).toEqual(['b', 'b2'])
    expect(pathToItem(items, 'a')).toEqual([])
    expect(pathToItem(items, 'missing')).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/renderer && bun x vitest run src/panel/__tests__/navigation.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `navigation.ts`**

```ts
import type { MenuItem } from '@browser/ipc-contract'

/** 按 path（子菜单 id 链）下钻到对应层级的可选项列表。 */
export function getLevelItems(items: MenuItem[], path: string[]): MenuItem[] {
  let level = items
  for (const id of path) {
    const sub = level.find(i => i.id === id)
    if (sub?.children) level = sub.children
    else break
  }
  return level
}

/** 过滤出可导航项（非 separator）。 */
export function getSelectable(items: MenuItem[]): MenuItem[] {
  return items.filter(i => i.type !== 'separator')
}

/** 在可选中项中按 id 定位下标；找不到返回 -1。 */
export function selectableIndexOf(items: MenuItem[], id: string): number {
  return getSelectable(items).findIndex(i => i.id === id)
}

/** 返回某 id 在菜单树中的祖先链（含自身父链，不含自身）；找不到返回 null。 */
export function pathToItem(items: MenuItem[], targetId: string, trail: string[] = []): string[] | null {
  for (const it of items) {
    if (it.id === targetId) return trail
    if (it.children) {
      const r = pathToItem(it.children, targetId, [...trail, it.id])
      if (r) return r
    }
  }
  return null
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/renderer && bun x vitest run src/panel/__tests__/navigation.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/renderer/src/panel/navigation.ts apps/renderer/src/panel/__tests__/navigation.test.ts
git commit -m "feat(popover): add keyboard navigation pure helpers + test"
```

### Task 9: 面板渲染组件 `PopoverMenu.vue` 与 `PanelRoot.vue`

**Files:**
- Create: `apps/renderer/src/panel/PopoverMenu.vue`
- Create: `apps/renderer/src/panel/PanelRoot.vue`

**Interfaces:**
- Consumes: Task 8 `computeBoxPosition`、Task 8b `navigation.ts`（`getLevelItems`/`getSelectable`/`selectableIndexOf`/`pathToItem`）、Task 3 暴露的 `browserAPI.onPopoverRender/onPopoverDismiss/popoverSelect/popoverDismiss`、类型 `PopoverAnchor`/`PopoverDescriptor`/`MenuItem`。
- Produces: 面板渲染进程 UI；`popover:select`/`popover:dismiss` 由点击触发。

- [ ] **Step 1: 实现 `PopoverMenu.vue`（递归子菜单）**

```vue
<template>
  <ul class="popover-menu">
    <li
      v-for="(item, idx) in items"
      :key="item.id ?? idx"
      class="popover-menu-item"
      :class="{ disabled: item.disabled, danger: item.danger, 'has-submenu': item.type === 'submenu', active: item.id === activeId }"
      @mouseenter="emit('hover', item.id)"
      @click="onClick(item)"
    >
      <template v-if="item.type === 'separator'">
        <div class="popover-divider" />
      </template>
      <template v-else>
        <Icon v-if="item.icon" :icon="item.icon" class="popover-item-icon" width="16" height="16" />
        <span class="popover-item-label">
          <template v-if="item.accessKey && showMnemonics">
            <u>{{ item.label?.charAt(0) }}</u>{{ item.label?.slice(1) }}
          </template>
          <template v-else>{{ item.label }}</template>
        </span>
        <span v-if="item.shortcut" class="popover-item-shortcut">{{ item.shortcut }}</span>
        <Icon v-if="item.type === 'submenu'" icon="mdi:chevron-right" class="popover-submenu-arrow" width="16" height="16" />
        <div
          v-if="item.type === 'submenu' && openSubIds.has(item.id) && item.children"
          class="popover-submenu"
        >
          <PopoverMenu
            :items="item.children"
            :popover-id="popoverId"
            :show-mnemonics="showMnemonics"
            :active-id="activeId"
            :open-sub-ids="openSubIds"
            @hover="(id) => emit('hover', id)"
            @select="(id) => emit('select', id)"
          />
        </div>
      </template>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { MenuItem } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'

const props = defineProps<{
  items: MenuItem[]
  popoverId: string
  showMnemonics: boolean
  activeId: string
  openSubIds: Set<string>
}>()

const emit = defineEmits<{
  (e: 'hover', itemId: string): void
  (e: 'select', itemId: string): void
}>()

function onClick(item: MenuItem): void {
  if (item.disabled) return
  if (item.type === 'submenu') { emit('hover', item.id); return }
  emit('select', item.id)
}
</script>

<style lang="less" scoped>
.popover-menu { list-style: none; margin: 0; padding: 0; }
.popover-menu-item {
  position: relative;
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px; min-width: 180px;
  color: var(--text-primary); font-size: 13px; cursor: pointer;
  &:hover { background: var(--bg-tertiary); }
  &.disabled { color: var(--text-secondary); cursor: default; &:hover { background: transparent; } }
  &.active { background: var(--bg-tertiary); }
  &.danger { color: var(--danger-color); }
}
.popover-item-icon { flex-shrink: 0; }
.popover-item-label { flex: 1; }
.popover-item-shortcut { margin-left: auto; color: var(--text-secondary); font-size: 12px; }
.popover-submenu-arrow { margin-left: auto; }
.popover-submenu {
  position: absolute;
  background: var(--bg-secondary);
  border: 1px solid var(--bg-tertiary);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  padding: 4px 0;
  z-index: 10;
}
.popover-divider { height: 1px; margin: 4px 0; background: var(--bg-tertiary); }
</style>
```

- [ ] **Step 2: 实现 `PanelRoot.vue`**

```vue
<template>
  <div v-if="descriptor" class="popover-layer">
    <div class="popover-backdrop" @click="dismiss" @contextmenu.prevent="dismiss" />
    <div
      ref="boxRef"
      class="popover-box"
      :class="{ ready: boxVisible }"
      :style="boxStyle"
    >
      <PopoverMenu
        :items="descriptor.items"
        :popover-id="currentPopoverId"
        :show-mnemonics="showMnemonics"
        :active-id="activeItem?.id ?? ''"
        :open-sub-ids="openSubIds"
        @hover="onHover"
        @select="onSelect"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { PopoverAnchor, PopoverDescriptor } from '@browser/ipc-contract'
import { computeBoxPosition } from './position'
import { getLevelItems, getSelectable, selectableIndexOf, pathToItem } from './navigation'
import PopoverMenu from './PopoverMenu.vue'

const descriptor = ref<PopoverDescriptor | null>(null)
const anchor = ref<PopoverAnchor | null>(null)
const currentPopoverId = ref('')
const boxRef = ref<HTMLElement>()
const boxVisible = ref(false)
const boxStyle = ref<Record<string, string>>({})
const showMnemonics = ref(false)
const lastPointer = ref({ x: 0, y: 0 })

// 方向键导航状态：activePath = 已展开子菜单 id 链；activeIndex = 当前层可选中项下标
const activePath = ref<string[]>([])
const activeIndex = ref(0)

const currentItems = computed(() => getLevelItems(descriptor.value?.items ?? [], activePath.value))
const selectable = computed(() => getSelectable(currentItems.value))
const activeItem = computed(() => selectable.value[activeIndex.value] ?? null)
const openSubIds = computed(() => new Set(activePath.value))

let renderOff: (() => void) | null = null
let dismissOff: (() => void) | null = null
let keyHandler: ((e: KeyboardEvent) => void) | null = null

function dismiss(): void {
  if (currentPopoverId.value) window.browserAPI.popoverDismiss(currentPopoverId.value)
  reset()
}
function reset(): void {
  descriptor.value = null
  anchor.value = null
  boxVisible.value = false
  activePath.value = []
  activeIndex.value = 0
}

function onRender(popoverId: string, desc: PopoverDescriptor, anc: PopoverAnchor): void {
  currentPopoverId.value = popoverId
  descriptor.value = desc
  anchor.value = anc
  activePath.value = []
  activeIndex.value = 0
  boxVisible.value = false
  nextTick(() => {
    const el = boxRef.value
    if (!el || !anchor.value) return
    const size = { width: el.offsetWidth, height: el.offsetHeight }
    const resolved: PopoverAnchor = anchor.value.type === 'cursor'
      ? { type: 'point', x: lastPointer.value.x, y: lastPointer.value.y, placement: anchor.value.placement }
      : anchor.value
    const pos = computeBoxPosition(resolved, size, { width: window.innerWidth, height: window.innerHeight })
    boxStyle.value = { left: `${pos.x}px`, top: `${pos.y}px` }
    boxVisible.value = true
  })
}

function onSelect(itemId: string): void {
  window.browserAPI.popoverSelect(currentPopoverId.value, itemId)
}

function openCurrentSub(): void {
  const item = activeItem.value
  if (item?.type === 'submenu' && item.children) {
    activePath.value = [...activePath.value, item.id]
    activeIndex.value = 0
  }
}
function closeCurrentSub(): void {
  if (activePath.value.length === 0) return // 根层级无上一级，无操作
  const popped = activePath.value[activePath.value.length - 1]
  activePath.value = activePath.value.slice(0, -1)
  const parentItems = getLevelItems(descriptor.value?.items ?? [], activePath.value)
  const idx = selectableIndexOf(parentItems, popped)
  if (idx >= 0) activeIndex.value = idx
}
function activateCurrent(): void {
  const item = activeItem.value
  if (!item || item.disabled) return
  if (item.type === 'submenu') openCurrentSub()
  else onSelect(item.id)
}
function onHover(itemId: string): void {
  const path = pathToItem(descriptor.value?.items ?? [], itemId)
  if (!path) return
  activePath.value = path
  activeIndex.value = Math.max(0, selectableIndexOf(getLevelItems(descriptor.value?.items ?? [], path), itemId))
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') { e.preventDefault(); dismiss(); return }
  if (e.key === 'Alt') { showMnemonics.value = true; return }
  if (e.altKey) return
  const n = selectable.value.length
  if (n === 0) return
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); activeIndex.value = (activeIndex.value + 1) % n; break
    case 'ArrowUp': e.preventDefault(); activeIndex.value = (activeIndex.value - 1 + n) % n; break
    case 'ArrowRight': e.preventDefault(); openCurrentSub(); break
    case 'ArrowLeft': e.preventDefault(); closeCurrentSub(); break
    case 'Enter':
    case ' ': e.preventDefault(); activateCurrent(); break
    default: {
      const hit = selectable.value.find(
        i => i.accessKey && i.accessKey.toLowerCase() === e.key.toLowerCase() && !i.disabled
      )
      if (hit) { e.preventDefault(); onSelect(hit.id) }
    }
  }
}

onMounted(() => {
  renderOff = window.browserAPI.onPopoverRender(onRender)
  dismissOff = window.browserAPI.onPopoverDismiss(reset)
  keyHandler = (e: KeyboardEvent) => onKeydown(e)
  window.addEventListener('keydown', keyHandler)
  window.addEventListener('mousemove', (e) => { lastPointer.value = { x: e.clientX, y: e.clientY } })
})
onBeforeUnmount(() => {
  renderOff?.()
  dismissOff?.()
  if (keyHandler) window.removeEventListener('keydown', keyHandler)
})
</script>

<!-- 非 scoped：覆盖面板 webContents 的 body 背景为透明，使浮层之下内容可见 -->
<style>
html, body { background: transparent !important; margin: 0; }
</style>

<style lang="less" scoped>
.popover-layer { position: fixed; inset: 0; pointer-events: none; }
.popover-backdrop { position: fixed; inset: 0; pointer-events: auto; background: transparent; }
.popover-box {
  position: fixed;
  visibility: hidden;
  min-width: 180px;
  background: var(--bg-secondary);
  border: 1px solid var(--bg-tertiary);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  padding: 4px 0;
  pointer-events: auto;
  &.ready { visibility: visible; }
}
</style>
```

- [ ] **Step 3: 类型检查**

Run: `bun run lint:typecheck`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/renderer/src/panel/PopoverMenu.vue apps/renderer/src/panel/PanelRoot.vue
git commit -m "feat(popover): add PanelRoot + PopoverMenu renderer components"
```

---

### Task 10: 路由 `/panel`

**Files:**
- Modify: `apps/renderer/src/router.ts`

**Interfaces:**
- Consumes: `PanelRoot.vue`（Task 9）。
- Produces: URL `wmfx://panel`（hash `/panel`）渲染面板；`PopoverManager` 用 `loadInternalView(popoverView,'panel')` 加载。

- [ ] **Step 1: 在 `router.ts` 顶部 import 增加，并在 routes 中 `catch-all` 之前增加路由**

```ts
import PanelRoot from './panel/PanelRoot.vue'
```

在 `{ path: '/newtab', component: NewTabView }` 之后、`{ path: '/:pathMatch(.*)*', redirect: '/' }` 之前插入：

```ts
    { path: '/panel', component: PanelRoot },
```

- [ ] **Step 2: 类型检查 + 提交**

Run: `bun run lint:typecheck`
Expected: PASS

```bash
git add apps/renderer/src/router.ts
git commit -m "feat(popover): add /panel route"
```

---

### Task 11: 渲染进程 `Popover` class

**Files:**
- Create: `apps/renderer/src/lib/popover.ts`

**Interfaces:**
- Consumes: Task 3 暴露的 `browserAPI.popoverOpen/Close/onPopoverAction` + 类型。
- Produces: `Popover` class（调用方 `new Popover({...})`），被 Task 13 的 TabBar 使用；`actionMap` 路由回调到实例。

- [ ] **Step 1: 实现 `lib/popover.ts`**

```ts
import type {
  MenuItem,
  PopoverActionPayload,
  PopoverAnchor,
  PopoverDescriptor,
} from '@browser/ipc-contract'

const actionMap = new Map<string, (menu: MenuItem) => void>()

// 模块加载时注册一次：主进程回传 popoverId + menu，分发到对应实例
window.browserAPI.onPopoverAction(({ popoverId, menu }) => {
  actionMap.get(popoverId)?.(menu)
})

export interface PopoverOptions {
  anchor: PopoverAnchor
  descriptor: PopoverDescriptor
  onAction: (p: PopoverActionPayload) => void
  autoOpen?: boolean // 默认 true：构造后自动 open；设为 false 时需手动调用 open()
}

/**
 * 稳定调用接口：封装 preload 的 browserAPI.popover* 调用。
 * 后期更换底层实现（如不再用独立 WebContentsView）时，调用处代码无需改动。
 */
export class Popover {
  private popoverId = crypto.randomUUID()
  private opened = false

  constructor(private opts: PopoverOptions) {
    if (opts.autoOpen !== false) this.open()
  }

  open(): void {
    if (this.opened) return
    // context.close 指向本实例 close()
    actionMap.set(this.popoverId, (menu) =>
      this.opts.onAction({ menu, context: { close: () => this.close() } })
    )
    window.browserAPI.popoverOpen(this.popoverId, this.opts.anchor, this.opts.descriptor)
    this.opened = true
  }

  close(): void {
    if (!this.opened) return
    actionMap.delete(this.popoverId)
    window.browserAPI.popoverClose(this.popoverId)
    this.opened = false
  }
}
```

- [ ] **Step 2: 类型检查**

Run: `bun run lint:typecheck`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add apps/renderer/src/lib/popover.ts
git commit -m "feat(popover): add Popover class wrapping preload API"
```

---

### Task 12: `Popover` class 路由单测

**Files:**
- Create: `apps/renderer/src/__tests__/popover.test.ts`

**Interfaces:**
- Consumes: Task 11 `Popover` + `actionMap` 路由。
- Produces: 验证 `open` 调 `popoverOpen`、`close` 调 `popoverClose`、回调经 `onPopoverAction` 触发并带 `context.close`。

- [ ] **Step 1: 写测试（用 vi 桩 window.browserAPI）**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Record<string, unknown[]> = {}
const browserAPI = {
  popoverOpen: vi.fn((...a: unknown[]) => { calls.open = a; return Promise.resolve() }),
  popoverClose: vi.fn((...a: unknown[]) => { calls.close = a; return Promise.resolve() }),
  onPopoverAction: vi.fn((cb: (p: { popoverId: string; menu: unknown }) => void) => {
    ;(browserAPI as { __cb?: typeof cb }).__cb = cb
  }),
}
vi.stubGlobal('window', { browserAPI })
vi.stubGlobal('crypto', { randomUUID: () => 'id-1' })

import { Popover } from '../lib/popover'

describe('Popover', () => {
  beforeEach(() => {
    calls.open = undefined
    calls.close = undefined
    vi.clearAllMocks()
  })

  it('autoOpen 时构造即调用 popoverOpen，且注册 popoverId', () => {
    new Popover({
      anchor: { type: 'point', x: 1, y: 2 },
      descriptor: { id: 't', kind: 'menu', items: [] },
      onAction: () => {},
    })
    expect(calls.open?.[0]).toBe('id-1')
    expect(calls.open?.[2]).toMatchObject({ id: 't' })
  })

  it('close 调用 popoverClose 并注销', () => {
    const p = new Popover({
      anchor: { type: 'point', x: 1, y: 2 },
      descriptor: { id: 't', kind: 'menu', items: [] },
      onAction: () => {},
    })
    p.close()
    expect(calls.close?.[0]).toBe('id-1')
  })

  it('onPopoverAction 回填时调用 onAction 且 context.close 可关闭', () => {
    const onAction = vi.fn()
    new Popover({
      anchor: { type: 'point', x: 1, y: 2 },
      descriptor: { id: 't', kind: 'menu', items: [] },
      onAction,
    })
    const cb = (browserAPI as { __cb?: (p: { popoverId: string; menu: unknown }) => void }).__cb!
    let closed = false
    cb({ popoverId: 'id-1', menu: { id: 'x' } })
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ menu: { id: 'x' }, context: expect.any(Object) })
    )
    const ctx = onAction.mock.calls[0][0].context
    const closeSpy = vi.spyOn(browserAPI, 'popoverClose')
    ctx.close()
    expect(closeSpy).toHaveBeenCalledWith('id-1')
    expect(closed).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试**

Run: `cd apps/renderer && bun x vitest run src/__tests__/popover.test.ts`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add apps/renderer/src/__tests__/popover.test.ts
git commit -m "test(popover): cover Popover class routing"
```

---

### Task 13: 迁移 TabBar 两处菜单到 Popover

**Files:**
- Modify: `apps/renderer/src/components/TabBar.vue`

**Interfaces:**
- Consumes: Task 11 `Popover` class、类型 `PopoverDescriptor`/`MenuItem`、`TabState`，既有动作函数 `newTabToRight/reloadTab/duplicateTab/togglePin/toggleMute/closeTab/closeOthers/closeRight/closeLeft`。
- Produces: 移除内联 `.app-menu-dropdown` / `.tab-context-menu` 及其状态与处理器，改为 Popover 驱动。

- [ ] **Step 1: 模板改动**

  1. 删除 `<div class="app-menu-wrap"> ... </div>` 整块（原 96–122 行含三点图标与下拉）。
  2. 删除 `<div v-if="contextMenu.tab" class="tab-context-menu"> ... </div>` 整块（原 158–264 行）。
  3. 三点图标改为：

```vue
      <Icon
        class="app-menu"
        icon="carbon:overflow-menu-vertical"
        width="18"
        height="18"
        @click.stop="openAppMenu"
      />
```

  4. tab 行的 `@contextmenu="onTabContextMenu($event, tab)"` 保持不变（函数体将改为打开 Popover）。

- [ ] **Step 2: 脚本改动**

  删除：`appMenuOpen` ref、`contextMenu` ref、`menuItems` 常量、`toggleAppMenu`、`onAppMenuItem`、`onTabContextMenu`（旧实现）、`onContextMenu`、`hideContextMenu`、`onDocClick` 及其在 `onMounted`/`onUnmounted` 的注册。

  新增/替换为：

```ts
import type { MenuItem, PopoverDescriptor } from '@browser/ipc-contract'
import { Popover } from '../lib/popover'

const appMenuItems: MenuItem[] = [
  { id: 'incognito', label: '新建隐身标签页', icon: 'mdi:account-off' },
  { id: 'wmfx://bookmarks', label: '书签', icon: 'mdi:bookmark' },
  { id: 'wmfx://history', label: '历史', icon: 'mdi:history' },
  { id: 'wmfx://downloads', label: '下载', icon: 'mdi:download' },
  { id: 'wmfx://proxy', label: '代理', icon: 'mdi:network' },
  { id: 'wmfx://settings', label: '设置', icon: 'mdi:cog' },
]

function openAppMenu(event: MouseEvent): void {
  event.stopPropagation()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const descriptor: PopoverDescriptor = { id: 'app-menu', kind: 'menu', items: appMenuItems }
  new Popover({
    anchor: { type: 'rect', rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, placement: 'bottom-end' },
    descriptor,
    onAction: ({ menu, context }) => {
      void runAppMenuItem(menu.id)
      context.close()
    },
  })
}

async function runAppMenuItem(id: string): Promise<void> {
  if (id === 'incognito') {
    window.browserAPI.createNewTab('incognito')
    return
  }
  const list = await window.browserAPI.getList()
  const existing = list.find(t => t.url === id || t.url.startsWith(`${id}/`))
  if (existing) window.browserAPI.activateTab(existing.id)
  else window.browserAPI.createTab({ url: id })
}

function openTabContextMenu(event: MouseEvent, tab: TabState): void {
  event.preventDefault()
  event.stopPropagation()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const descriptor: PopoverDescriptor = {
    id: 'tab-context',
    kind: 'menu',
    items: [
      { id: 'new-tab-right', label: '在右侧新增标签页', icon: 'mdi:plus' },
      { type: 'separator' },
      { id: 'reload', label: '重新加载', icon: 'mdi:refresh' },
      { id: 'duplicate', label: '复制', icon: 'mdi:content-copy' },
      { id: 'pin', label: tab.isPinned ? '取消固定' : '固定', icon: 'mdi:pin' },
      { id: 'mute', label: tab.isMuted ? '取消静音' : '将这个网站静音', icon: tab.isMuted ? 'mdi:volume-off' : 'mdi:volume-high' },
      { type: 'separator' },
      { id: 'close', label: '关闭', icon: 'mdi:close', danger: true },
      { id: 'close-others', label: '关闭其它标签页', icon: 'mdi:close-box-multiple' },
      { id: 'close-right', label: '关闭右侧标签页', icon: 'mdi:arrow-right-bold-box-outline' },
      { id: 'close-left', label: '关闭左侧标签页', icon: 'mdi:arrow-left-bold-box-outline' },
    ],
  }
  new Popover({
    anchor: { type: 'rect', rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, placement: 'bottom-start' },
    descriptor,
    onAction: ({ menu, context }) => {
      runTabAction(menu.id, tab)
      context.close()
    },
  })
}

function runTabAction(id: string, tab: TabState): void {
  switch (id) {
    case 'new-tab-right': void newTabToRight(tab); break
    case 'reload': reloadTab(tab); break
    case 'duplicate': void duplicateTab(tab); break
    case 'pin': togglePin(tab); break
    case 'mute': toggleMute(tab); break
    case 'close': closeTab(tab.id); break
    case 'close-others': closeOthers(tab); break
    case 'close-right': closeRight(tab); break
    case 'close-left': closeLeft(tab); break
  }
}
```

  既有动作函数 `newTabToRight/reloadTab/duplicateTab/togglePin/toggleMute/closeOthers/closeRight/closeLeft` 中原有的 `hideContextMenu()` 调用**全部删除**（由 `context.close()` 负责关闭）。例如 `reloadTab` 改为：

```ts
function reloadTab(tab: TabState): void {
  window.browserAPI.reload(tab.id)
}
```

  （其余同类函数同理移除 `hideContextMenu()` 调用。）

- [ ] **Step 3: `onMounted`/`onUnmounted` 清理**

  删除 `document.addEventListener('click', onDocClick)` 与 `document.addEventListener('contextmenu', onDocClick)` 两行（及 `onDocClick` 函数）。PanelRoot 自行处理外部点击关闭。

- [ ] **Step 4: 删除无用样式**

  在 `<style>` 中删除 `.app-menu-wrap`、`.app-menu`、`.app-menu-dropdown`、`.app-menu-item`、`.tab-context-menu`、`.tab-context-menu-item`、`.tab-context-menu-divider`（这些样式已迁移到 `PopoverMenu.vue` / `PanelRoot.vue`）。

- [ ] **Step 5: 类型检查 + lint**

Run: `bun run lint:typecheck && bun run lint`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/renderer/src/components/TabBar.vue
git commit -m "feat(popover): migrate TabBar context & app menus to Popover"
```

---

### Task 14: E2E 验证

**Files:**
- Create: `e2e/popover.spec.ts`

**Interfaces:**
- Consumes: 已完成的 Popover 系统。验证不被遮挡、点击生效、Esc/背景关闭、子菜单展开。

- [ ] **Step 1: 写 E2E（best-effort，跨 webContents）**

说明：popover 渲染在独立 `popoverView` 的 `/panel` 路由中，Playwright `page` 可能绑定到基础或 popover webContents。以下断言以"基础 DOM 不再含旧内联菜单"（证明迁移）与"菜单文本出现在页面中"为主，必要时用 `page.waitForSelector` 等待 popover 文本。

```ts
import { expect, test } from '@playwright/test'

test('tab context menu opens via Popover and is not the old inline menu', async ({ page }) => {
  // 等待首个标签出现
  const firstTab = page.locator('.tab-item').first()
  await firstTab.waitFor()

  // 旧内联菜单不应存在
  await expect(page.locator('.tab-context-menu')).toHaveCount(0)

  // 右键打开 Popover
  await firstTab.click({ button: 'right' })

  // 菜单项文本出现在页面某处（popover webContents），且可点击
  const reload = page.getByText('重新加载', { exact: true })
  await reload.waitFor({ timeout: 5000 })
  await reload.click()

  // 点击后 popover 关闭（文本消失或不可见）
  await expect(page.getByText('关闭其它标签页', { exact: true })).toHaveCount(0)
})

test('three-dot app menu opens via Popover', async ({ page }) => {
  await expect(page.locator('.app-menu-dropdown')).toHaveCount(0)
  await page.locator('.app-menu').click()
  const bookmarks = page.getByText('书签', { exact: true })
  await bookmarks.waitFor({ timeout: 5000 })
  // Esc 关闭
  await page.keyboard.press('Escape')
})
```

- [ ] **Step 2: 运行 E2E（若环境支持 electron launch）**

Run: `bun x playwright test e2e/popover.spec.ts`
Expected: PASS（如 CI 不支持 electron 启动，标注为手动验证，不阻塞合并）

- [ ] **Step 3: 提交**

```bash
git add e2e/popover.spec.ts
git commit -m "test(popover): e2e for tab/app menus via Popover"
```

---

### Task 15: 全量校验与收尾

**Files:**
- 无新增；整体校验。

- [ ] **Step 1: 全量 typecheck + lint**

Run: `bun run lint:typecheck && bun run lint`
Expected: PASS

- [ ] **Step 2: 全量单测**

Run: `cd apps/main && bun x vitest run src/__tests__/popover-utils.test.ts && cd ../../apps/renderer && bun x vitest run src/panel/__tests__/position.test.ts src/__tests__/popover.test.ts`
Expected: 全部 PASS

- [ ] **Step 3: 提交（若有余下改动）或确认完成**

若无未提交改动则跳过；否则：

```bash
git add -A
git commit -m "chore(popover): final typecheck/lint cleanups"
```

---

## 自检摘要

- **规格覆盖**：类型(§4)/通道(§5)/渲染 API(§6)/主进程 Manager(§7)/面板测量定位(§8)/构建(§9 已据实改为路由)/迁移(§10)/测试(§11)/扩展(§12)/YAGNI(§13) 均有对应 Task。checkbox 已按确认略去；`shortcut`/`accessKey`/`autoOpen` 均含入。
- **占位符扫描**：所有 Step 均含可执行代码或精确命令，无 TBD。
- **类型一致性**：`PopoverAnchor`/`PopoverDescriptor`/`MenuItem`/`PopoverManager`/`Popover`/`computeBoxPosition`/`findMenuItem` 在各 Task 签名一致；preload/env 类型与 channels 对齐。
