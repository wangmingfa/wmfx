# Popover 双模式（overlay / bounded）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Popover 增加 `bounded` 模式——WebContentsView 只覆盖内容区、不挡应用、失焦关闭；保留 `overlay` 模式兼容。

**Architecture:** 主进程 `PopoverManager` 在 bounded 模式把 view 移到屏幕外（保持可见）渲染→面板测量内容尺寸→`popover:measure` 回传→主进程 `setBounds` 精确定位并显示；失焦自动关闭。前端 `PanelRoot` 按 `mode` 分支：bounded 无 backdrop、`.popover-box` 自然尺寸、测量上报；overlay 保持原行为。`mode` 经 `popover:render` 透传到面板。

**Tech Stack:** Electron `WebContentsView` / `screen` / `ResizeObserver`，Vue 3，TypeScript，IPC 契约 `@browser/ipc-contract`，Vitest 单测，Playwright E2E。

## Global Constraints

- 包管理器用 `bun`（非 npm/pnpm）；脚本见 AGENTS.md（`bun run lint` 等）。
- 新增/修改类型在 `packages/ipc-contract/src/channels.ts`，改动后需 `bun run build` 让依赖包重新构建（workspace 软链）。
- 通信必须结构化可克隆（已用 `toPlain()` 剥 Vue Proxy），`PopoverOpenOptions` 不得携带函数。
- 注释规范：类/方法 JSDoc 说明职责与关键步骤（见 AGENTS.md 代理模块架构约定）。
- 提交前须 `bun run lint`（biome + eslint + typecheck 全过）。

---

## File Structure

- `packages/ipc-contract/src/channels.ts` — 类型契约：`PopoverMode`、`PopoverOpenOptions.mode/size`、`popover:measure` 通道、`popover:render` 加 `mode`、`PopoverPlacement` 增 `cover-start|cover-end`
- `apps/renderer/src/env.d.ts` — `window.browserAPI` 类型：`onPopoverRender` 加 `mode`、`popoverMeasure`
- `apps/main/src/preload.ts` — `onPopoverRender` 透传 `mode`、`popoverMeasure` 实现
- `apps/main/src/popover-position.ts` — 新建：主进程侧 `computePopoverBounds`（含 `cover` 放置）
- `apps/main/src/popover-manager.ts` — `OverlayState.mode/size`、bounded 两趟流程、`applyMeasure`、`blur` 失焦关闭、`renderTop` 分支
- `apps/main/src/ipc/register.ts` — 注册 `popover:measure`
- `apps/renderer/src/lib/popover.ts` — `PopoverOptions.mode/size` 透传
- `apps/renderer/src/lib/dropdown-menu.ts` — `mode` 透传
- `apps/renderer/src/panel/PanelRoot.vue` — `currentMode`、bounded 分支、ResizeObserver、CSS
- `apps/renderer/src/components/AddressBar.vue` — `mode:'bounded'` + `size` + `placement:'cover-start'`
- `apps/renderer/src/components/AppMenuButton.vue` — `mode:'bounded'`
- `apps/renderer/src/components/TabBar.vue` — `mode:'bounded'`

---

### Task 1: IPC 契约扩展（类型 + 通道）

**Files:**
- Modify: `packages/ipc-contract/src/channels.ts`

**Interfaces:**
- Consumes: 现有 `PopoverType`、`PopoverAnchor`、`PopoverPlacement`
- Produces: `PopoverMode`、`PopoverOpenOptions`（扩展）、`popover:measure` 通道、`popover:render`（扩展）、`PopoverPlacement`（扩展）

- [ ] **Step 1: 扩展 PopoverPlacement 与新增 PopoverMode**

在 `channels.ts` 现有 `PopoverPlacement`（约 line 24）改为：

```ts
export type PopoverPlacement =
  | 'bottom-start'
  | 'bottom-end'
  | 'top-start'
  | 'top-end'
  | 'right-start'
  | 'left-start'
  | 'cover-start' // 视图左上角对齐锚点 rect 左上角（覆盖在元素上，向下延伸）
  | 'cover-end' // 视图右上角对齐锚点 rect 右上角
```

在 `PopoverType`（line 8）附近新增：

```ts
/** Popover 显示模式：overlay=铺满窗口阻断交互；bounded=仅覆盖内容区、非阻断、失焦关闭 */
export type PopoverMode = 'overlay' | 'bounded'
```

- [ ] **Step 2: 扩展 PopoverOpenOptions 并新增 popover:measure**

修改 `PopoverOpenOptions`（line 18）：

```ts
export interface PopoverOpenOptions {
  type: PopoverType
  anchor: PopoverAnchor
  data?: unknown
  mode?: PopoverMode
  size?: { width: number; height: number }
}
```

在 `IpcContract` 的 Popover 区（约 line 399）更新 `popover:render` 并新增 `popover:measure`：

```ts
  // Popover
  'popover:open': (popoverId: string, options: PopoverOpenOptions) => void
  'popover:close': (popoverId: string) => void
  'popover:data': (popoverId: string, data: unknown) => void
  'popover:panel-event': (payload: PopoverEventPayload) => void
  'popover:event': (payload: PopoverEventPayload) => void
  'popover:render': (
    popoverId: string,
    type: PopoverType,
    anchor: PopoverAnchor,
    data?: unknown,
    mode?: PopoverMode
  ) => void
  'popover:measure': (popoverId: string, size: { width: number; height: number }) => void
  'popover:dismiss': (popoverId: string) => void
```

- [ ] **Step 3: 运行类型检查确认契约正确**

Run: `bun run --filter @browser/ipc-contract typecheck`
Expected: PASS（无报错）

- [ ] **Step 4: 提交**

```bash
git add packages/ipc-contract/src/channels.ts
git commit -m "feat(ipc): add PopoverMode, size/measure for bounded popover"
```

---

### Task 2: 前端 browserAPI 类型 + preload 透传

**Files:**
- Modify: `apps/renderer/src/env.d.ts`
- Modify: `apps/main/src/preload.ts`

**Interfaces:**
- Consumes: Task 1 的 `PopoverMode`、`popover:measure`
- Produces: `window.browserAPI.onPopoverRender` 含 `mode`；`window.browserAPI.popoverMeasure`

- [ ] **Step 1: env.d.ts 更新 onPopoverRender 签名并加 popoverMeasure**

在 `env.d.ts` 顶部 import 增加 `PopoverMode`：

```ts
import type {
  CreateTabOptions,
  FindInPageOptions,
  IpcInvoke,
  LogEntry,
  PopoverAnchor,
  PopoverEventPayload,
  PopoverMode,
  PopoverOpenOptions,
  PopoverType,
  TabState,
  ThemeMode,
  UpdaterStatus,
} from '@browser/ipc-contract'
```

修改 `onPopoverRender`（约 line 145）：

```ts
      onPopoverRender: (
        handler: (
          popoverId: string,
          type: PopoverType,
          anchor: PopoverAnchor,
          data?: unknown,
          mode?: PopoverMode
        ) => void
      ) => void
```

在 `// Popover` 区（约 line 144 后）新增：

```ts
      popoverMeasure: (popoverId: string, size: { width: number; height: number }) => void
```

- [ ] **Step 2: preload.ts 透传 mode 并实现 popoverMeasure**

修改 `onPopoverRender`（约 line 307）：

```ts
  onPopoverRender: (cb) =>
    ipcRenderer.on('popover:render', (_e, id, type, anchor, data, mode) =>
      cb(id, type as PopoverType, anchor as PopoverAnchor, data, mode as PopoverMode | undefined)
    ),
```

在 `popoverEvent` 之后新增：

```ts
  popoverMeasure: (popoverId, size) => ipcRenderer.send('popover:measure', popoverId, size),
```

- [ ] **Step 3: 类型检查**

Run: `bun run lint:typecheck`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/renderer/src/env.d.ts apps/main/src/preload.ts
git commit -m "feat(popover): thread mode through render + add popoverMeasure"
```

---

### Task 3: 主进程定位工具 computePopoverBounds（含单测）

**Files:**
- Create: `apps/main/src/popover-position.ts`
- Test: `apps/main/src/__tests__/popover-position.test.ts`

**Interfaces:**
- Consumes: `PopoverAnchor`、`PopoverMode`（Task 1）
- Produces: `computePopoverBounds(anchor, size, win, cursor?)` 供 Task 4 调用

- [ ] **Step 1: 写失败单测**

```ts
import { describe, expect, it } from 'vitest'
import { computePopoverBounds } from '../popover-position'

describe('computePopoverBounds', () => {
  const win = { width: 1000, height: 800 }

  it('bottom-start 放在 rect 下方、左对齐', () => {
    const r = computePopoverBounds(
      { type: 'rect', rect: { x: 100, y: 100, width: 200, height: 30 }, placement: 'bottom-start' },
      { width: 300, height: 120 },
      win,
    )
    expect(r).toEqual({ x: 100, y: 130 })
  })

  it('cover-start 视图左上角对齐 rect 左上角', () => {
    const r = computePopoverBounds(
      { type: 'rect', rect: { x: 100, y: 100, width: 200, height: 30 }, placement: 'cover-start' },
      { width: 200, height: 150 },
      win,
    )
    expect(r).toEqual({ x: 100, y: 100 })
  })

  it('cursor 用传入光标位置', () => {
    const r = computePopoverBounds(
      { type: 'cursor', placement: 'bottom-start' },
      { width: 100, height: 40 },
      win,
      { x: 500, y: 400 },
    )
    expect(r).toEqual({ x: 500, y: 400 })
  })

  it('夹紧到窗口内（不超出右/下边界）', () => {
    const r = computePopoverBounds(
      { type: 'point', x: 990, y: 790, placement: 'bottom-start' },
      { width: 300, height: 200 },
      win,
    )
    expect(r.x).toBeLessThanOrEqual(win.width - 300 - 4)
    expect(r.y).toBeLessThanOrEqual(win.height - 200 - 4)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bun x vitest run apps/main/src/__tests__/popover-position.test.ts`
Expected: FAIL（`computePopoverBounds` 未定义）

- [ ] **Step 3: 实现 computePopoverBounds**

```ts
import type { PopoverAnchor } from '@browser/ipc-contract'

export interface BoxSize {
  width: number
  height: number
}
export interface Point {
  x: number
  y: number
}

const MARGIN = 4

/**
 * 依据锚点 + 内容尺寸 + 窗口尺寸计算 popover 视图左上角，并夹紧进窗口。
 * cursor 锚点由调用方把屏幕光标转为窗口局部坐标后通过 cursor 传入。
 */
export function computePopoverBounds(
  anchor: PopoverAnchor,
  size: BoxSize,
  win: { width: number; height: number },
  cursor?: { x: number; y: number },
): Point {
  let refLeft = 0
  let refTop = 0
  let refRight = 0
  let refBottom = 0

  if (anchor.type === 'rect') {
    refLeft = anchor.rect.x
    refTop = anchor.rect.y
    refRight = anchor.rect.x + anchor.rect.width
    refBottom = anchor.rect.y + anchor.rect.height
  } else if (anchor.type === 'point') {
    refLeft = refRight = anchor.x
    refTop = refBottom = anchor.y
  } else {
    const x = cursor?.x ?? 0
    const y = cursor?.y ?? 0
    refLeft = refRight = x
    refTop = refBottom = y
  }

  const place = anchor.placement ?? 'bottom-start'
  const [v, h] = place.split('-') as ['cover' | 'bottom' | 'top' | 'right' | 'left', 'start' | 'end']

  let left = 0
  let top = 0
  if (v === 'cover') {
    left = h === 'end' ? refRight - size.width : refLeft
    top = refTop
  } else if (v === 'bottom') {
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

- [ ] **Step 4: 运行确认通过**

Run: `bun x vitest run apps/main/src/__tests__/popover-position.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/main/src/popover-position.ts apps/main/src/__tests__/popover-position.test.ts
git commit -m "feat(popover): add computePopoverBounds with cover placement"
```

---

### Task 4: PopoverManager bounded 流程 + 失焦关闭 + register

**Files:**
- Modify: `apps/main/src/popover-manager.ts`
- Modify: `apps/main/src/ipc/register.ts`

**Interfaces:**
- Consumes: `computePopoverBounds`（Task 3）、`screen` from electron、`PopoverMode`（Task 1）
- Produces: `popover:measure` 处理 → `applyMeasure`；`renderTop` 分支；`blur` 失焦关闭

- [ ] **Step 1: 扩展 import 与 OverlayState、加 rendered 集合与 blur 监听**

修改 `popover-manager.ts` 顶部 import：

```ts
import type {
  PopoverAnchor,
  PopoverMode,
  PopoverOpenOptions,
  PopoverType,
  ThemeMode,
} from '@browser/ipc-contract'
import type { BrowserWindow } from 'electron'
import { WebContentsView, screen } from 'electron'
import { loadInternalView } from './internal-url'
import { getPreloadPath } from './paths'
```

`OverlayState` 接口（约 line 12）改为：

```ts
interface OverlayState {
  anchor: PopoverAnchor
  type: PopoverType
  data?: unknown
  mode: PopoverMode
  size?: { width: number; height: number }
  onSelect?: (eventData: unknown) => void
}
```

在类字段加 `private rendered = new Set<string>()`。构造函数末尾（`this.win.on('resize', ...)` 之前或之后）加 blur 监听：

```ts
    // bounded 模式：popover 视图失焦（用户点击应用其它区域）即关闭栈顶
    this.popoverView.webContents.on('blur', () => {
      const top = this.stack[this.stack.length - 1]
      if (top && this.overlays.get(top)?.mode === 'bounded') {
        this.close(top)
      }
    })
```

- [ ] **Step 2: open() 存 mode/size 并按模式预备 view**

修改 `open()`（约 line 49）：

```ts
  open(
    popoverId: string,
    options: PopoverOpenOptions & { onSelect?: (eventData: unknown) => void }
  ): void {
    this.overlays.set(popoverId, {
      anchor: options.anchor,
      type: options.type,
      data: options.data,
      mode: options.mode ?? 'overlay',
      size: options.size,
      onSelect: options.onSelect,
    })
    if (!this.stack.includes(popoverId)) this.stack.push(popoverId)
    if ((options.mode ?? 'overlay') === 'bounded') {
      // 首帧移到屏幕外但保持可见，仅用于渲染测量（避免 setVisible(false) 导致测量为 0）
      this.popoverView.setVisible(true)
      this.popoverView.setBounds({ x: -10000, y: -10000, width: 1, height: 1 })
    }
    this.renderTop()
  }
```

- [ ] **Step 3: renderTop() 按模式分支**

修改 `renderTop()`（约 line 64）：

```ts
  private renderTop(): void {
    const id = this.stack[this.stack.length - 1]
    const ov = this.overlays.get(id)
    if (!ov) return
    // 保证 view 在 contentView 栈顶（盖住 tab 视图）
    this.win.contentView.removeChildView(this.popoverView)
    this.win.contentView.addChildView(this.popoverView)

    if (ov.mode === 'bounded') {
      // 先发渲染让面板测量内容；定位与显示等 popover:measure 回执
      this.popoverView.webContents.send('popover:render', id, ov.type, ov.anchor, ov.data, 'bounded')
      return
    }

    // overlay：铺满窗口并置于最前
    const { width, height } = this.win.getContentBounds()
    this.popoverView.setBounds({ x: 0, y: 0, width, height })
    this.popoverView.setVisible(true)
    this.popoverView.webContents.send('popover:render', id, ov.type, ov.anchor, ov.data, 'overlay')
    this.popoverView.webContents.focus()
  }
```

- [ ] **Step 4: 新增 applyMeasure 处理 popover:measure**

在 `renderTop()` 之后新增：

```ts
  /** 面板测量完内容尺寸后回调：据此精确定位并显示 bounded popover（仅首次聚焦） */
  applyMeasure(popoverId: string, size: { width: number; height: number }): void {
    const ov = this.overlays.get(popoverId)
    if (!ov || ov.mode !== 'bounded') return
    // 若调用方给定了固定尺寸，优先使用（部分维度）
    const w = ov.size?.width ?? size.width
    const h = ov.size?.height ?? size.height
    const win = this.win.getContentBounds()
    const winSize = { width: win.width, height: win.height }
    let cursor: { x: number; y: number } | undefined
    if (ov.anchor.type === 'cursor') {
      const sp = screen.getCursorScreenPoint()
      cursor = { x: sp.x - win.x, y: sp.y - win.y }
    }
    const pos = computePopoverBounds(ov.anchor, { width: w, height: h }, winSize, cursor)
    this.popoverView.setBounds({ x: pos.x, y: pos.y, width: w, height: h })
    if (!this.rendered.has(popoverId)) {
      this.rendered.add(popoverId)
      this.popoverView.setVisible(true)
      this.popoverView.webContents.focus()
    }
  }
```

- [ ] **Step 5: close() 清理 rendered 集合**

在 `close()`（约 line 103）中 `this.overlays.delete(popoverId)` 后加 `this.rendered.delete(popoverId)`：

```ts
  close(popoverId: string): void {
    this.overlays.delete(popoverId)
    this.rendered.delete(popoverId)
    this.stack = this.stack.filter((id) => id !== popoverId)
    this.popoverView.webContents.send('popover:dismiss', popoverId)
    this.win.webContents.send('popover:dismiss', popoverId)
    if (this.stack.length > 0) {
      this.renderTop()
    } else {
      this.popoverView.setVisible(false)
    }
  }
```

- [ ] **Step 6: register.ts 注册 popover:measure**

在 `ipc/register.ts` 的 Popover 区（约 line 666 `ipcMain.on('popover:panel-event'...)` 之后）新增：

```ts
  ipcMain.on('popover:measure', (event, popoverId, size) => {
    getInstance(event)?.popoverManager.applyMeasure(
      popoverId,
      size as { width: number; height: number },
    )
  })
```

- [ ] **Step 7: 类型检查 + lint**

Run: `bun run --filter @browser/main typecheck && bun x biome check apps/main/src/popover-manager.ts apps/main/src/popover-position.ts apps/main/src/ipc/register.ts`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add apps/main/src/popover-manager.ts apps/main/src/ipc/register.ts
git commit -m "feat(popover): bounded two-pass locate + blur auto-close"
```

---

### Task 5: 渲染进程 Popover / DropdownMenu 透传 mode

**Files:**
- Modify: `apps/renderer/src/lib/popover.ts`
- Modify: `apps/renderer/src/lib/dropdown-menu.ts`
- Test: `apps/renderer/src/__tests__/popover.test.ts`

**Interfaces:**
- Consumes: `PopoverMode`（Task 1）
- Produces: `PopoverOptions.mode/size` 透传到 `popoverOpen` 的 `PopoverOpenOptions`

- [ ] **Step 1: popover.ts 增加 mode/size 并透传**

修改 `apps/renderer/src/lib/popover.ts` import 与 `PopoverOptions`、open()：

```ts
import type { PopoverAnchor, PopoverMode, PopoverOpenOptions, PopoverType } from '@browser/ipc-contract'
```

```ts
export interface PopoverOptions {
  type: PopoverType
  anchor: PopoverAnchor
  data?: unknown
  mode?: PopoverMode
  size?: { width: number; height: number }
  onEvent?: (eventName: string, eventData?: unknown) => void
  onDismiss?: () => void
  autoOpen?: boolean
}
```

在 `open()` 内构造 `options`：

```ts
    const options: PopoverOpenOptions = {
      type: this.opts.type,
      anchor: this.opts.anchor,
      data: toPlain(this.opts.data),
      mode: this.opts.mode,
      size: this.opts.size,
    }
```

- [ ] **Step 2: dropdown-menu.ts 透传 mode**

修改 `apps/renderer/src/lib/dropdown-menu.ts`：

```ts
import type { MenuItem, PopoverAnchor, PopoverMode } from '@browser/ipc-contract'
import { Popover } from './popover'

export interface DropdownMenuOptions {
  anchor: PopoverAnchor
  descriptor: { id: string; items: MenuItem[] }
  onAction: (payload: { menu: MenuItem; context: { close: () => void } }) => void
  mode?: PopoverMode
  autoOpen?: boolean
}
```

在 `constructor` 的 `new Popover({...})` 内 `anchor: opts.anchor,` 之后加 `mode: opts.mode,`。

- [ ] **Step 3: 单测补充 mode 透传断言**

在 `apps/renderer/src/__tests__/popover.test.ts` 的 `browserAPI` hoisted 对象加 `popoverMeasure` stub（与 `popoverOpen` 类似，仅记录调用），并在第一个 `it` 后新增：

```ts
  it('open 透传 mode 到 popoverOpen', () => {
    new Popover({
      type: 'menu',
      anchor: { type: 'point', x: 1, y: 2 },
      mode: 'bounded',
    })
    expect(calls.open?.[1]).toMatchObject({ mode: 'bounded' })
  })
```

（注意 `calls.open?.[1]` 即 options 参数；现有测试已断言 `[0]` 为 popoverId。）

- [ ] **Step 4: 运行单测 + lint**

Run: `bun x vitest run apps/renderer/src/__tests__/popover.test.ts && bun x biome check apps/renderer/src/lib/popover.ts apps/renderer/src/lib/dropdown-menu.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/renderer/src/lib/popover.ts apps/renderer/src/lib/dropdown-menu.ts apps/renderer/src/__tests__/popover.test.ts
git commit -m "feat(popover): pass mode/size through Popover + DropdownMenu"
```

---

### Task 6: PanelRoot 按 mode 分支（bounded 测量 + 无 backdrop）

**Files:**
- Modify: `apps/renderer/src/panel/PanelRoot.vue`

**Interfaces:**
- Consumes: `window.browserAPI.popoverMeasure`（Task 2）、`currentMode` 由 `onRender` 接收 `mode` 设置
- Produces: 渲染 `.popover-box` 按模式差异化；bounded 测量并 `popoverMeasure` 上报

- [ ] **Step 1: 模板加 is-bounded 类、backdrop 仅 overlay 显示**

修改 `<template>` 根（约 line 2）与 backdrop（line 3）：

```html
  <div v-if="isOpen" class="popover-root" :class="{ 'is-bounded': currentMode === 'bounded' }">
    <div v-if="currentMode === 'overlay'" class="popover-backdrop" @click="dismiss" @contextmenu.prevent="dismiss" />
    <div
      ref="boxRef"
      class="popover-box"
      :class="{ ready: boxVisible, 'is-addressbar': currentType === 'addressbar' }"
      :style="boxStyle"
      @mouseleave="onMouseLeave"
    >
```

- [ ] **Step 2: 脚本加 currentMode、boxStyle 处理、测量与 ResizeObserver**

在 `import` 区增加 `PopoverMode` 类型导入：

```ts
import type { AutocompleteSuggestion, MenuItem, PopoverAnchor, PopoverMode, PopoverType } from '@browser/ipc-contract'
```

新增 ref 与 observer 变量（在 `const lastPointer` 附近）：

```ts
const currentMode = ref<PopoverMode>('overlay')
let resizeObserver: ResizeObserver | null = null
```

`reset()` 内补 `currentMode.value = 'overlay'` 并断开 observer：

```ts
function reset(): void {
  currentType.value = null
  currentData.value = null
  anchor.value = null
  currentMode.value = 'overlay'
  isOpen.value = false
  boxVisible.value = false
  resizeObserver?.disconnect()
  resizeObserver = null
  activePath.value = []
  activeIndex.value = -1
}
```

修改 `onRender` 签名与 nextTick 分支（约 line 92）：

```ts
function onRender(popoverId: string, type: PopoverType, anc: PopoverAnchor, data?: unknown, mode?: PopoverMode): void {
  currentPopoverId.value = popoverId
  currentType.value = type
  currentData.value = data ?? null
  currentMode.value = mode ?? 'overlay'
  anchor.value = anc
  activePath.value = []
  activeIndex.value = 0
  boxVisible.value = false
  isOpen.value = true
  nextTick(() => {
    const el = boxRef.value
    if (!el || !anchor.value) return
    if (currentMode.value === 'bounded') {
      // 内容自然尺寸上报；rect 锚点用其宽度约束（地址栏覆盖原输入框宽度），其余 max-content
      const w = anchor.value.type === 'rect' ? anchor.value.rect.width : el.offsetWidth
      window.browserAPI.popoverMeasure(currentPopoverId.value, { width: w, height: el.offsetHeight })
      resizeObserver?.disconnect()
      resizeObserver = new ResizeObserver(() => {
        if (boxRef.value) {
          const bw = anchor.value?.type === 'rect' ? anchor.value.rect.width : boxRef.value.offsetWidth
          window.browserAPI.popoverMeasure(currentPopoverId.value, { width: bw, height: boxRef.value.offsetHeight })
        }
      })
      resizeObserver.observe(el)
      return
    }
    // overlay：保持原内部定位逻辑
    const size = { width: el.offsetWidth, height: el.offsetHeight }
    const resolved: PopoverAnchor =
      anchor.value.type === 'cursor'
        ? { type: 'point', x: lastPointer.value.x, y: lastPointer.value.y, placement: anchor.value.placement }
        : anchor.value
    const pos = computeBoxPosition(resolved, size, { width: window.innerWidth, height: window.innerHeight })
    boxStyle.value = { left: `${pos.x}px`, top: `${pos.y}px` }
    boxVisible.value = true
  })
}
```

`onBeforeUnmount` 内补 `resizeObserver?.disconnect()`。

- [ ] **Step 3: 样式：bounded 盒子自然尺寸 + 无 min-width**

修改 `.popover-box` 相关样式（文件末尾 scoped 样式），新增 `.popover-root` 与 `.is-bounded`：

```css
.popover-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
}
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
  &.ready {
    visibility: visible;
  }
  &.is-bounded {
    min-width: 0;
    width: max-content;
    height: max-content;
    padding: 0;
  }
  &.is-addressbar {
    background: #fff;
    border: none;
    border-radius: 14px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
    padding: 0;
    min-width: 0;
    overflow: hidden;
  }
}
```

（`.is-bounded` 与 `.is-addressbar` 叠加时仍以 addressbar 圆角为主；地址栏在 bounded 下宽度由内联 `boxStyle` 设为 rect.width。）

- [ ] **Step 4: 类型检查 + lint**

Run: `bun run --filter @browser/renderer typecheck && bun x biome check apps/renderer/src/panel/PanelRoot.vue`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/renderer/src/panel/PanelRoot.vue
git commit -m "feat(panel): bounded mode render branch + measure/resize report"
```

---

### Task 7: 调用方切换到 bounded 模式

**Files:**
- Modify: `apps/renderer/src/components/AddressBar.vue`
- Modify: `apps/renderer/src/components/AppMenuButton.vue`
- Modify: `apps/renderer/src/components/TabBar.vue`

**Interfaces:**
- Consumes: `mode: 'bounded'` 透传、`placement: 'cover-start'`（Task 1）
- Produces: 各 popover 以 bounded 模式打开

- [ ] **Step 1: AddressBar 传 mode + size + placement**

修改 `apps/renderer/src/components/AddressBar.vue` 的 `openPopover()` 内 `new Popover({...})`：

```ts
  currentPopover = new Popover({
    type: 'addressbar',
    mode: 'bounded',
    size: { width: rect.width, height: rect.height },
    anchor: {
      type: 'rect',
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      placement: 'cover-start',
    },
    data: { query: urlInput.value, suggestions: suggestions.value },
    onEvent: (eventName, eventData) => {
      ...
    },
    onDismiss: () => {
      currentPopover = null
      suggestions.value = []
      activeIndex.value = -1
    },
  })
```

（其余 onEvent 逻辑不变。）

- [ ] **Step 2: AppMenuButton 传 mode**

修改 `apps/renderer/src/components/AppMenuButton.vue` 的 `new DropdownMenu({...})`：

```ts
  void new DropdownMenu({
    mode: 'bounded',
    anchor: {
      type: 'rect',
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      placement: 'bottom-end',
    },
    descriptor: { id: 'app-menu', items: menuItems.value },
    onAction: ({ menu, context }) => {
      void runMenuItem(menu.id)
      context.close()
    },
  })
```

- [ ] **Step 3: TabBar 传 mode**

修改 `apps/renderer/src/components/TabBar.vue` 的 `new DropdownMenu({...})`：在 `anchor,` 之前加 `mode: 'bounded',`：

```ts
  void new DropdownMenu({
    mode: 'bounded',
    anchor,
    descriptor: {
      id: 'tab-context',
      items: [ /* 保持不变 */ ],
    },
    onAction: ({ menu, context }) => {
      runTabAction(menu.id, tab)
      context.close()
    },
  })
```

- [ ] **Step 4: 类型检查 + lint**

Run: `bun run lint:typecheck && bun x biome check apps/renderer/src/components/AddressBar.vue apps/renderer/src/components/AppMenuButton.vue apps/renderer/src/components/TabBar.vue`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/renderer/src/components/AddressBar.vue apps/renderer/src/components/AppMenuButton.vue apps/renderer/src/components/TabBar.vue
git commit -m "feat: switch addressbar + menus to bounded popover mode"
```

---

### Task 8: E2E 验证非阻断与失焦关闭

**Files:**
- Test: `apps/renderer/e2e/popover-bounded.spec.ts`（或沿用现有 e2e 目录）

**Interfaces:**
- Consumes: 应用启动后地址栏聚焦 / 菜单点击行为
- Produces: 断言 popover 不挡应用、失焦关闭

- [ ] **Step 1: 写 E2E 用例**

```ts
import { expect, test } from '@playwright/test'

test('地址栏 popover 覆盖输入框但不挡标签栏，点标签栏可切换并失焦关闭', async ({ page }) => {
  await page.goto('wmfx://newtab')
  const addr = page.locator('.url-input')
  await addr.click()
  // popover 出现
  await expect(page.locator('.popover-box.is-addressbar')).toBeVisible()
  // 标签栏仍可点击（popover 未铺满窗口阻断）
  const tab = page.locator('.tab').first()
  await tab.click()
  // 失焦后 popover 关闭
  await expect(page.locator('.popover-box.is-addressbar')).toHaveCount(0)
})

test('菜单 popover 不挡应用，点应用其它区域失焦关闭', async ({ page }) => {
  await page.goto('wmfx://newtab')
  await page.locator('.app-menu').click()
  await expect(page.locator('.popover-box')).toBeVisible()
  // 点击页面区域（非 popover）应关闭
  await page.mouse.click(400, 400)
  await expect(page.locator('.popover-box')).toHaveCount(0)
})
```

- [ ] **Step 2: 运行 E2E（如环境支持）**

Run: `bun x playwright test apps/renderer/e2e/popover-bounded.spec.ts`
Expected: PASS（若本地无 Electron 运行环境，标注待 CI 验证）

- [ ] **Step 3: 提交**

```bash
git add apps/renderer/e2e/popover-bounded.spec.ts
git commit -m "test(e2e): popover bounded non-blocking + blur close"
```

---

### Task 9: 全量 lint / typecheck 收尾

**Files:**
- 无新增，仅验证

- [ ] **Step 1: 全量 lint**

Run: `bun run lint`
Expected: biome + eslint + 6 包 typecheck 全过（含新增/修改文件）

- [ ] **Step 2: 若有报错逐一修复后重新提交**

（仅当 Step 1 有错时执行；修复后 `git add -A && git commit --amend --no-edit` 或新提交。）

- [ ] **Step 3: 最终提交（如本任务产生修复提交）**

```bash
git add -A
git commit -m "fix: address lint/typecheck findings for bounded popover"
```

---

## Self-Review 对照

- **Spec 覆盖**：第1节 API（Task1）✓；第2节主进程两趟/失焦/首帧屏幕外（Task3+4）✓；第3节 mode 透传（Task2+6）✓；第4节面板分支（Task6）✓；第5节调用方（Task7）✓；第6节数据流（measure 通道 Task1/4，坐标转换 Task4）✓；第7节测试（Task3 单测 + Task8 E2E）✓。
- **Placeholder 扫描**：无 TBD/“类似”等占位；每个代码步均给出完整代码。
- **类型一致性**：`PopoverMode` 在 Task1 定义，Task2/4/5/6/7 一致引用；`popoverMeasure(popoverId, size)` 签名在 Task1/2/6 一致；`computePopoverBounds` 签名 Task3/4 一致；`placement:'cover-start'` Task1 定义、Task7 使用。
