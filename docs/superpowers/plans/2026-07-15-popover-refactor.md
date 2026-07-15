# Popover 重构 + DropdownMenu + AddressBar 建议面板

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将现有 popover（菜单专用）重构为通用 Popover 底层 + DropdownMenu 封装，AddressBar 直接使用 Popover 渲染建议面板，解决 WebContentsView 遮挡问题。

**Architecture:** PopoverManager 管理唯一一个 WebContentsView，根据 `type` 参数路由到不同渲染组件。PanelRoot 通过 hash 路由加载 `menu`/`addressbar` 等子组件。新 `Popover` 类接收 `type + anchor + data`，`DropdownMenu` 基于 `Popover` 封装菜单逻辑。

**Tech Stack:** Vue 3 Composition API, TypeScript, Electron WebContentsView, IPC

## Global Constraints

- Package manager: `bun`
- Lint: `bun run lint`
- No new dependencies
- IPC 数据必须可序列化（不传函数）

---

## 文件结构

```
packages/ipc-contract/src/channels.ts       # MODIFY: 新类型
apps/main/src/popover-manager.ts             # MODIFY: 通用 type+data
apps/main/src/ipc/register.ts                # MODIFY: 更新 handler
apps/main/src/preload.ts                     # MODIFY: 更新 API
apps/renderer/src/lib/popover.ts             # REWRITE: 通用 Popover
apps/renderer/src/lib/dropdown-menu.ts       # NEW: DropdownMenu 封装
apps/renderer/src/panel/PanelRoot.vue        # MODIFY: 按 type 路由
apps/renderer/src/panel/AddressBarSuggestions.vue  # NEW
apps/renderer/src/components/AddressBar.vue  # MODIFY: 用 Popover
apps/renderer/src/components/AppMenuButton.vue  # MODIFY: 用 DropdownMenu
apps/renderer/src/components/TabBar.vue      # MODIFY: 用 DropdownMenu
apps/renderer/src/env.d.ts                   # MODIFY: 新类型
```

---

### Task 1: 更新 IPC 合约类型

**Files:**
- Modify: `packages/ipc-contract/src/channels.ts`

**Interfaces:**
- Produces: `PopoverType`, `PopoverOpenOptions`, `PopoverEventPayload`

- [ ] **Step 1: 新增类型定义**

在 `channels.ts` 中：

```ts
/** Popover 类型：menu=下拉菜单, addressbar=地址栏建议面板 */
export type PopoverType = 'menu' | 'addressbar'

/** Popover 事件：面板 → 主 renderer */
export interface PopoverEventPayload {
  popoverId: string
  eventName: string
  eventData?: unknown
}

/** Popover 打开参数（替代原 PopoverDescriptor 用于 open） */
export interface PopoverOpenOptions {
  type: PopoverType
  anchor: PopoverAnchor
  data?: unknown
}
```

- [ ] **Step 2: 修改 PopoverKind 为 PopoverType**

```ts
// 替换原 PopoverKind
export type PopoverType = 'menu' | 'addressbar'
```

删除旧的 `PopoverKind`。

- [ ] **Step 3: 更新 IpcContract 中的 popover 通道**

```ts
// 替换原 popover:open 签名
'popover:open': (popoverId: string, options: PopoverOpenOptions) => void
'popover:close': (popoverId: string) => void
// 新增：双向数据同步（主 renderer → popover，popover → 主 renderer）
'popover:data': (popoverId: string, data: unknown) => void
// 新增：面板事件（popover → 主 renderer）
'popover:event': (payload: PopoverEventPayload) => void
// 保留：面板渲染通知（主进程 → popover WebContentsView）
'popover:render': (popoverId: string, type: PopoverType, anchor: PopoverAnchor, data?: unknown) => void
// 保留：关闭通知
'popover:dismiss': (popoverId: string) => void
```

删除旧的 `popover:select`、`popover:action`、`PopoverDescriptor`。

- [ ] **Step 4: 更新 IPC_CHANNELS 数组**

```ts
export const IPC_CHANNELS: readonly IpcChannel[] = [
  // ... 其他通道保持不变 ...
  'popover:open',
  'popover:close',
  'popover:data',
  'popover:event',
  'popover:render',
  'popover:dismiss',
] as const
```

- [ ] **Step 5: Run lint**

Run: `bun run lint:ts`
Expected: No errors (types only, no runtime)

---

### Task 2: 重构 PopoverManager（主进程）

**Files:**
- Modify: `apps/main/src/popover-manager.ts`

**Interfaces:**
- Consumes: `PopoverType`, `PopoverAnchor`, `PopoverOpenOptions`
- Produces: `open()`, `close()`, `sendData()`, `notifyEvent()`

- [ ] **Step 1: 重写 OverlayState 和 open 签名**

```ts
import type { PopoverAnchor, PopoverOpenOptions, PopoverType } from '@browser/ipc-contract'
import type { BrowserWindow } from 'electron'
import { WebContentsView } from 'electron'
import { loadInternalView } from './internal-url'
import { getPreloadPath } from './paths'

interface OverlayState {
  anchor: PopoverAnchor
  type: PopoverType
  data?: unknown
}

export class PopoverManager {
  private popoverView: WebContentsView
  private overlays = new Map<string, OverlayState>()
  private stack: string[] = []

  constructor(private win: BrowserWindow) {
    this.popoverView = new WebContentsView({
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    this.popoverView.setBackgroundColor('rgba(0,0,0,0)')
    this.popoverView.setVisible(false)
    this.win.contentView.addChildView(this.popoverView)
    loadInternalView(this.popoverView, 'panel')
    this.win.on('resize', () => this.renderTop())
  }

  open(popoverId: string, options: PopoverOpenOptions): void {
    this.overlays.set(popoverId, {
      anchor: options.anchor,
      type: options.type,
      data: options.data,
    })
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
    this.win.contentView.removeChildView(this.popoverView)
    this.win.contentView.addChildView(this.popoverView)
    // 发送 type + anchor + data，不再发 descriptor
    this.popoverView.webContents.send('popover:render', id, ov.type, ov.anchor, ov.data)
    this.popoverView.webContents.focus()
  }

  /** 主 renderer → popover WebContentsView 双向数据同步 */
  sendData(popoverId: string, data: unknown): void {
    if (this.stack.includes(popoverId)) {
      this.popoverView.webContents.send('popover:data', popoverId, data)
    }
  }

  /** popover WebContentsView → 主 renderer 事件通知 */
  notifyEvent(popoverId: string, eventName: string, eventData?: unknown): void {
    this.win.webContents.send('popover:event', { popoverId, eventName, eventData })
  }

  close(popoverId: string): void {
    this.overlays.delete(popoverId)
    this.stack = this.stack.filter((id) => id !== popoverId)
    this.popoverView.webContents.send('popover:dismiss', popoverId)
    this.win.webContents.send('popover:dismiss', popoverId)
    if (this.stack.length > 0) {
      this.renderTop()
    } else {
      this.popoverView.setVisible(false)
    }
  }
}
```

- [ ] **Step 2: Run lint**

Run: `bun run lint:ts`
Expected: No errors

---

### Task 3: 更新 preload 和 IPC register

**Files:**
- Modify: `apps/main/src/preload.ts`
- Modify: `apps/main/src/ipc/register.ts`

- [ ] **Step 1: 更新 preload.ts — popover API**

替换 popover 部分：

```ts
// Popover
popoverOpen: (popoverId, options) =>
  ipcRenderer.invoke('popover:open', popoverId, options),
popoverClose: (popoverId) => ipcRenderer.invoke('popover:close', popoverId),
popoverSendData: (popoverId, data) =>
  ipcRenderer.invoke('popover:data', popoverId, data),
onPopoverRender: (cb) =>
  ipcRenderer.on('popover:render', (_e, id, type, anchor, data) =>
    cb(id, type, anchor, data)
  ),
onPopoverDismiss: (cb) =>
  ipcRenderer.on('popover:dismiss', (_e, id) => cb(id as string)),
onPopoverEvent: (cb) =>
  ipcRenderer.on('popover:event', (_e, payload) =>
    cb(payload as PopoverEventPayload)
  ),
```

- [ ] **Step 2: 更新 preload.ts — 类型声明**

```ts
import type {
  PopoverAnchor,
  PopoverEventPayload,
  PopoverOpenOptions,
  PopoverType,
} from '@browser/ipc-contract'

// 在 browserAPI 接口中：
popoverOpen: (popoverId: string, options: PopoverOpenOptions) => Promise<void>
popoverClose: (popoverId: string) => Promise<void>
popoverSendData: (popoverId: string, data: unknown) => Promise<void>
onPopoverRender: (
  cb: (popoverId: string, type: PopoverType, anchor: PopoverAnchor, data?: unknown) => void
) => void
onPopoverDismiss: (cb: (popoverId: string) => void) => void
onPopoverEvent: (cb: (payload: PopoverEventPayload) => void) => void
```

删除旧的 `popoverSelect`、`onPopoverAction`。

- [ ] **Step 3: 更新 ipc/register.ts**

```ts
handle('popover:open', (event, popoverId, options) => {
  getInstance(event)?.popoverManager.open(popoverId, options)
})
handle('popover:close', (event, popoverId) => {
  getInstance(event)?.popoverManager.close(popoverId)
})
handle('popover:data', (event, popoverId, data) => {
  getInstance(event)?.popoverManager.sendData(popoverId, data)
})
```

删除旧的 `popover:select` handler。

- [ ] **Step 4: Run lint**

Run: `bun run lint:ts`
Expected: No errors

---

### Task 4: 重构 PanelRoot — 按 type 路由

**Files:**
- Modify: `apps/renderer/src/panel/PanelRoot.vue`

**Interfaces:**
- Consumes: `popover:render` with `type + anchor + data`
- Produces: 动态加载 `PopoverMenu` 或 `AddressBarSuggestions`

- [ ] **Step 1: 重写 PanelRoot — 按 type 动态渲染**

```vue
<template>
  <div v-if="isOpen" class="popover-layer">
    <div class="popover-backdrop" @click="dismiss" @contextmenu.prevent="dismiss" />
    <div ref="boxRef" class="popover-box" :class="{ ready: boxVisible }" :style="boxStyle">
      <PopoverMenu
        v-if="currentType === 'menu'"
        :items="menuItems"
        :popover-id="currentPopoverId"
        :show-mnemonics="showMnemonics"
        :active-id="activeItem?.id ?? ''"
        :open-sub-ids="openSubIds"
        @hover="onHover"
        @select="onMenuSelect"
      />
      <AddressBarSuggestions
        v-else-if="currentType === 'addressbar'"
        :popover-id="currentPopoverId"
        :data="currentData"
        @event="onAddressBarEvent"
      />
    </div>
  </div>
</template>
```

script 部分保留菜单导航逻辑，新增 `currentType`、`currentData`、`isOpen` 状态，`onRender` 改为接收 `type + data`。

- [ ] **Step 2: 更新 onRender 处理**

```ts
const currentType = ref<PopoverType | null>(null)
const currentData = ref<unknown>(null)
const isOpen = ref(false)
const menuItems = computed(() => {
  if (currentType.value === 'menu' && currentData.value) {
    return (currentData.value as { items: MenuItem[] }).items
  }
  return []
})

function onRender(popoverId: string, type: PopoverType, anc: PopoverAnchor, data?: unknown): void {
  currentPopoverId.value = popoverId
  currentType.value = type
  currentData.value = data ?? null
  anchor.value = anc
  // ... 定位逻辑不变
  isOpen.value = true
}
```

- [ ] **Step 3: 新增 addressbar 事件处理**

```ts
function onAddressBarEvent(eventName: string, eventData?: unknown): void {
  // 转发到主进程
  window.browserAPI.popoverEvent({
    popoverId: currentPopoverId.value,
    eventName,
    eventData,
  })
}
```

- [ ] **Step 4: 菜单项适配 — 从 data.items 取而非 descriptor.items**

菜单导航逻辑（`activePath`、`activeIndex`、`onKeydown` 等）改为读 `menuItems` computed。

- [ ] **Step 5: Run lint**

Run: `bun run lint`
Expected: No errors

---

### Task 5: 创建 AddressBarSuggestions 组件

**Files:**
- Create: `apps/renderer/src/panel/AddressBarSuggestions.vue`

**Interfaces:**
- Consumes: `popoverId`, `data: { query: string, suggestions: AutocompleteSuggestion[] }`
- Produces: `@event('select', url)`, `@event('update-query', query)`

- [ ] **Step 1: 创建组件**

```vue
<template>
  <div class="addressbar-panel">
    <input
      ref="inputRef"
      :value="data.query"
      class="addressbar-input"
      placeholder="输入地址或搜索..."
      @input="onInput"
      @keydown="onKeydown"
    />
    <div v-if="data.suggestions?.length" class="addressbar-suggestions">
      <div
        v-for="(item, index) in data.suggestions"
        :key="item.url"
        class="addressbar-suggestion-item"
        :class="{ active: index === activeIndex }"
        @mousedown.prevent="onSelect(item.url)"
        @mouseenter="activeIndex = index"
      >
        <Icon v-if="item.type === 'history'" icon="carbon:time" width="14" height="14" />
        <Icon v-else-if="item.type === 'bookmark'" icon="carbon:bookmark-filled" width="14" height="14" />
        <Icon v-else icon="ic:round-search" width="14" height="14" />
        <span class="suggestion-title">{{ item.title }}</span>
        <span class="suggestion-url">{{ item.url }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AutocompleteSuggestion } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  popoverId: string
  data: { query: string; suggestions: AutocompleteSuggestion[] }
}>()

const emit = defineEmits<{
  event: [eventName: string, eventData?: unknown]
}>()

const inputRef = ref<HTMLInputElement>()
const activeIndex = ref(-1)

onMounted(() => {
  nextTick(() => inputRef.value?.focus())
})

watch(() => props.data.suggestions, () => {
  activeIndex.value = -1
})

function onInput(e: Event): void {
  const value = (e.target as HTMLInputElement).value
  emit('event', 'update-query', value)
}

function onKeydown(e: KeyboardEvent): void {
  const suggestions = props.data.suggestions ?? []
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, suggestions.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (activeIndex.value >= 0 && suggestions[activeIndex.value]) {
      onSelect(suggestions[activeIndex.value].url)
    } else {
      emit('event', 'navigate', props.data.query)
    }
  } else if (e.key === 'Escape') {
    emit('event', 'close')
  }
}

function onSelect(url: string): void {
  emit('event', 'select', url)
}
</script>
```

- [ ] **Step 2: 添加 CSS 样式**

```css
<style scoped>
.addressbar-panel {
  padding: 6px;
  min-width: 300px;
}

.addressbar-input {
  width: 100%;
  height: 28px;
  background: #fff;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}

.addressbar-input:focus {
  border-color: var(--accent-color);
}

.addressbar-suggestions {
  border-top: 1px solid var(--border-color);
  margin-top: 4px;
  padding-top: 4px;
}

.addressbar-suggestion-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
}

.addressbar-suggestion-item:hover,
.addressbar-suggestion-item.active {
  background: var(--bg-tertiary);
}

.suggestion-title {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.suggestion-url {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
</style>
```

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: No errors

---

### Task 6: 重写 Popover 类（通用）

**Files:**
- Rewrite: `apps/renderer/src/lib/popover.ts`

**Interfaces:**
- Produces: `Popover` class — `open()`, `close()`, `sendData()`, `onEvent()`

- [ ] **Step 1: 重写 Popover 类**

```ts
import type { PopoverAnchor, PopoverEventPayload, PopoverOpenOptions, PopoverType } from '@browser/ipc-contract'

const eventMap = new Map<string, (eventName: string, eventData?: unknown) => void>()

window.browserAPI.onPopoverEvent((payload) => {
  eventMap.get(payload.popoverId)?.(payload.eventName, payload.eventData)
})

window.browserAPI.onPopoverDismiss((popoverId) => {
  eventMap.delete(popoverId)
})

export interface PopoverOptions {
  type: PopoverType
  anchor: PopoverAnchor
  data?: unknown
  onEvent?: (eventName: string, eventData?: unknown) => void
  autoOpen?: boolean
}

export class Popover {
  private popoverId = crypto.randomUUID()
  private opened = false

  constructor(private opts: PopoverOptions) {
    if (opts.autoOpen !== false) this.open()
  }

  open(): void {
    if (this.opened) return
    if (this.opts.onEvent) {
      eventMap.set(this.popoverId, this.opts.onEvent)
    }
    const options: PopoverOpenOptions = {
      type: this.opts.type,
      anchor: this.opts.anchor,
      data: this.opts.data,
    }
    void window.browserAPI.popoverOpen(this.popoverId, options)
    this.opened = true
  }

  close(): void {
    if (!this.opened) return
    eventMap.delete(this.popoverId)
    void window.browserAPI.popoverClose(this.popoverId)
    this.opened = false
  }

  sendData(data: unknown): void {
    if (!this.opened) return
    void window.browserAPI.popoverSendData(this.popoverId, data)
  }

  get id(): string {
    return this.popoverId
  }
}
```

- [ ] **Step 2: Run lint**

Run: `bun run lint:ts`
Expected: No errors

---

### Task 7: 创建 DropdownMenu 封装

**Files:**
- Create: `apps/renderer/src/lib/dropdown-menu.ts`

**Interfaces:**
- Consumes: `Popover` class
- Produces: `DropdownMenu` class — 保持与原 `Popover` 相同的外部 API

- [ ] **Step 1: 创建 DropdownMenu**

```ts
import type { MenuItem, PopoverAnchor } from '@browser/ipc-contract'
import { Popover } from './popover'

export interface DropdownMenuOptions {
  anchor: PopoverAnchor
  descriptor: { id: string; items: MenuItem[] }
  onAction: (payload: { menu: MenuItem; context: { close: () => void } }) => void
  autoOpen?: boolean
}

/**
 * 基于 Popover 封装的下拉菜单。
 * 对外保持与原 Popover 相同的 API（anchor + descriptor + onAction）。
 */
export class DropdownMenu {
  private popover: Popover

  constructor(private opts: DropdownMenuOptions) {
    this.popover = new Popover({
      type: 'menu',
      anchor: opts.anchor,
      data: opts.descriptor,
      onEvent: (eventName, eventData) => {
        if (eventName === 'select' && typeof eventData === 'string') {
          const menu = this.findMenuItem(opts.descriptor.items, eventData)
          if (menu) {
            opts.onAction({ menu, context: { close: () => this.close() } })
          }
        }
      },
      autoOpen: opts.autoOpen,
    })
  }

  close(): void {
    this.popover.close()
  }

  private findMenuItem(items: MenuItem[], id: string): MenuItem | null {
    for (const it of items) {
      if (it.type === 'separator') continue
      if (it.id === id) return it
      if (it.children) {
        const found = this.findMenuItem(it.children, id)
        if (found) return found
      }
    }
    return null
  }
}
```

- [ ] **Step 2: Run lint**

Run: `bun run lint:ts`
Expected: No errors

---

### Task 8: 更新 AppMenuButton — 用 DropdownMenu

**Files:**
- Modify: `apps/renderer/src/components/AppMenuButton.vue`

- [ ] **Step 1: 替换 import 和用法**

```ts
import { DropdownMenu } from '../lib/dropdown-menu'
// 替换原 import { Popover } from '../lib/popover'
```

```ts
function openMenu(event: MouseEvent): void {
  event.stopPropagation()
  isOpen.value = true
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const descriptor = { id: 'app-menu', items: menuItems.value }
  void new DropdownMenu({
    anchor: {
      type: 'rect',
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      placement: 'bottom-end',
    },
    descriptor,
    onAction: ({ menu, context }) => {
      void runMenuItem(menu.id)
      context.close()
    },
  })
}
```

- [ ] **Step 2: 更新 dismiss 监听**

删除旧的 `onPopoverAction` 监听，改用 `onPopoverDismiss`（已经存在）。

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: No errors

---

### Task 9: 更新 TabBar — 用 DropdownMenu

**Files:**
- Modify: `apps/renderer/src/components/TabBar.vue`

- [ ] **Step 1: 替换 import**

```ts
import { DropdownMenu } from '../lib/dropdown-menu'
// 替换原 import { Popover } from '../lib/popover'
```

- [ ] **Step 2: 替换 openTabContextMenu 中的 new Popover**

```ts
function openTabContextMenu(event: MouseEvent, tab: TabState): void {
  event.preventDefault()
  event.stopPropagation()
  const anchor: PopoverAnchor = { type: 'point', x: event.clientX, y: event.clientY, placement: 'bottom-start' }
  activeMenuTabId.value = tab.id
  const descriptor = {
    id: 'tab-context',
    items: [
      { id: 'new-tab-right', label: t('tab.closeRight'), icon: 'mdi:plus' },
      { id: 'sep-1', type: 'separator' as const },
      { id: 'reload', label: t('tab.reload'), icon: 'mdi:refresh' },
      { id: 'duplicate', label: t('tab.duplicate'), icon: 'mdi:content-copy' },
      { id: 'pin', label: tab.isPinned ? t('tab.unpinned') : t('tab.pinned'), icon: 'mdi:pin' },
      {
        id: 'mute',
        label: tab.isMuted ? t('tab.unmute') : t('tab.mute'),
        icon: tab.isMuted ? 'mdi:volume-off' : 'mdi:volume-high',
      },
      { id: 'sep-2', type: 'separator' as const },
      { id: 'close', label: t('tab.close'), icon: 'mdi:close', danger: true },
      { id: 'close-others', label: t('tab.closeOthers'), icon: 'mdi:close-box-multiple' },
      { id: 'close-left', label: t('tab.closeLeft'), icon: 'mdi:arrow-left-bold-box-outline' },
      { id: 'close-right', label: t('tab.closeRightTabs'), icon: 'mdi:arrow-right-bold-box-outline' },
    ],
  }
  void new DropdownMenu({
    anchor,
    descriptor,
    onAction: ({ menu, context }) => {
      runTabAction(menu.id, tab)
      context.close()
    },
  })
}
```

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: No errors

---

### Task 10: 更新 AddressBar — 用 Popover

**Files:**
- Modify: `apps/renderer/src/components/AddressBar.vue`

- [ ] **Step 1: 替换内联面板为 Popover**

删除内联面板相关的 template（`.url-panel`、`.url-panel-input` 等），恢复为简单的 input。

script 中新增：

```ts
import { Popover } from '../lib/popover'

let currentPopover: Popover | null = null

function onFocus(): void {
  requestAnimationFrame(() => {
    inputRef.value?.select()
  })
  fetchSuggestions()
  openPopover()
}

function openPopover(): void {
  const rect = inputRef.value?.getBoundingClientRect()
  if (!rect) return
  currentPopover = new Popover({
    type: 'addressbar',
    anchor: {
      type: 'rect',
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      placement: 'bottom-start',
    },
    data: { query: urlInput.value, suggestions: suggestions.value },
    onEvent: (eventName, eventData) => {
      if (eventName === 'select' && typeof eventData === 'string') {
        selectSuggestion(eventData)
      } else if (eventName === 'update-query' && typeof eventData === 'string') {
        urlInput.value = eventData
        fetchSuggestions()
        currentPopover?.sendData({ query: urlInput.value, suggestions: suggestions.value })
      } else if (eventName === 'navigate' && typeof eventData === 'string') {
        urlInput.value = eventData
        navigate()
      } else if (eventName === 'close') {
        closePopover()
      }
    },
  })
}

function closePopover(): void {
  currentPopover?.close()
  currentPopover = null
  inputRef.value?.blur()
}

function onBlur(): void {
  setTimeout(() => {
    closePopover()
    suggestions.value = []
    activeIndex.value = -1
  }, 150)
}
```

watch urlInput 时同步更新 popover data：

```ts
watch(urlInput, () => {
  if (currentPopover) {
    currentPopover.sendData({ query: urlInput.value, suggestions: suggestions.value })
  }
})
```

- [ ] **Step 2: 删除内联面板 CSS**

删除 `.url-panel`、`.url-panel-input`、`.url-panel-suggestions` 等样式。保留 `.url-input` 默认样式。

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: No errors

---

### Task 11: 更新 env.d.ts 类型

**Files:**
- Modify: `apps/renderer/src/env.d.ts`

- [ ] **Step 1: 更新 browserAPI 类型声明**

```ts
popoverOpen: (popoverId: string, options: PopoverOpenOptions) => Promise<void>
popoverClose: (popoverId: string) => Promise<void>
popoverSendData: (popoverId: string, data: unknown) => Promise<void>
onPopoverRender: (
  cb: (popoverId: string, type: PopoverType, anchor: PopoverAnchor, data?: unknown) => void
) => void
onPopoverDismiss: (cb: (popoverId: string) => void) => void
onPopoverEvent: (cb: (payload: PopoverEventPayload) => void) => void
```

删除旧的 `popoverSelect`、`onPopoverAction`。

- [ ] **Step 2: Run full lint**

Run: `bun run lint`
Expected: No errors

---

### Task 12: 清理旧代码 + 最终验证

**Files:**
- Delete: `apps/renderer/src/popover-utils.ts`（如已移至 main）

- [ ] **Step 1: 检查是否有遗留的旧 popover 引用**

Run: `grep -r "PopoverDescriptor\|PopoverKind\|popover:action\|popover:select" apps/ packages/`
Expected: No results

- [ ] **Step 2: 运行完整 lint + typecheck**

Run: `bun run lint`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: extract Popover base + DropdownMenu, address bar uses Popover for suggestions

- Generic Popover accepts type+anchor+data, renders in WebContentsView
- DropdownMenu wraps Popover for menu use cases
- PanelRoot routes by type (menu/addressbar)
- AddressBar opens Popover on focus, suggestions render above WebContentsView
- Updated IPC contract: popover:open/close/data/event"
```
