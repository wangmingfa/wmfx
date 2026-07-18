# 垂直标签栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional vertical tab bar mode (left sidebar with auto-collapse) to the browser, switchable instantly from settings.

**Architecture:** Extract shared tab data logic into `useTabList` composable, create new `VerticalTabBar.vue` component, add `tabBarPosition` setting, and use `v-if` in `ChromeUI.vue` to switch between horizontal and vertical layouts.

**Tech Stack:** Vue 3, TypeScript, Naive UI (NRadioGroup/NSelect), CSS variables, IPC (settings:get/set)

## Global Constraints

- Package manager: bun (not npm/pnpm)
- Subprocesses: execa (not node:child_process)
- CSS variables must have Chinese comments
- Naive UI components: import individually (tree-shaking)
- Log convention: `console.debug` everywhere, `console.info` for key paths
- i18n: all user-visible strings in zh-CN and en-US

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/renderer/src/composables/useTabList.ts` | Create | Shared tab data, IPC listeners, tab operations |
| `apps/renderer/src/components/VerticalTabBar.vue` | Create | Vertical tab bar with auto-collapse |
| `apps/renderer/src/components/TabBar.vue` | Modify | Migrate shared logic to useTabList |
| `apps/renderer/src/components/ChromeUI.vue` | Modify | Add v-if layout switching |
| `apps/main/src/settings-manager.ts` | Modify | Add tabBarPosition setting |
| `packages/ipc-contract/src/channels.ts` | Modify | Add tabBarPosition to SettingsSnapshot |
| `apps/renderer/src/views/settings/AppearanceView.vue` | Modify | Add tab position selector with illustrations |
| `apps/renderer/src/style.css` | Modify | Add vertical tab bar CSS variables |
| `packages/shared/src/i18n/messages.ts` | Modify | Add i18n keys |

---

### Task 1: Add tabBarPosition Setting

**Files:**
- Modify: `apps/main/src/settings-manager.ts` (lines 7-32, 34-59, 183-263)
- Modify: `packages/ipc-contract/src/channels.ts` (lines 380-395)

**Interfaces:**
- Consumes: existing SettingsSchema pattern
- Produces: `tabBarPosition: 'top' | 'left'` available via `settings:get`/`settings:set`

- [ ] **Step 1: Add tabBarPosition to SettingsSchema**

In `apps/main/src/settings-manager.ts`, add to the `SettingsSchema` interface (after line 32):

```typescript
tabBarPosition: 'top' | 'left'
```

- [ ] **Step 2: Add default value**

In `apps/main/src/settings-manager.ts`, add to `defaultSettings` (after line 59):

```typescript
tabBarPosition: 'top',
```

- [ ] **Step 3: Add validation case**

In `apps/main/src/settings-manager.ts`, find the `validateValue` method's switch statement (around line 183). Add a new case:

```typescript
case 'tabBarPosition': {
  if (['top', 'left'].includes(value as string))
    return value as SettingsSchema[K]
  return defaultSettings.tabBarPosition as SettingsSchema[K]
}
```

- [ ] **Step 4: Add to SettingsSnapshot**

In `packages/ipc-contract/src/channels.ts`, find the `SettingsSnapshot` interface (lines 380-395). Add:

```typescript
tabBarPosition: 'top' | 'left'
```

- [ ] **Step 5: Rebuild packages and verify**

```bash
bun run --filter @browser/ipc-contract build
```

- [ ] **Step 6: Commit**

```bash
git add apps/main/src/settings-manager.ts packages/ipc-contract/src/channels.ts
git commit -m "feat(settings): add tabBarPosition setting (top/left)"
```

---

### Task 2: Add i18n Keys

**Files:**
- Modify: `packages/shared/src/i18n/messages.ts` (lines 86-162, 421-498, 647-952)

**Interfaces:**
- Consumes: none
- Produces: i18n keys for tab position UI

- [ ] **Step 1: Add keys to Message interface**

In `packages/shared/src/i18n/messages.ts`, find the `settings` section in the `Message` interface (around line 86). Add after existing keys:

```typescript
tabBarPosition: string
tabBarPositionOptions: { top: string; left: string }
```

- [ ] **Step 2: Add zh-CN values**

Find the zh-CN `settings` object (around line 421). Add:

```typescript
tabBarPosition: '标签栏位置',
tabBarPositionOptions: { top: '顶部', left: '左侧' },
```

- [ ] **Step 3: Add en-US values**

Find the en-US `settings` object (around line 647). Add:

```typescript
tabBarPosition: 'Tab bar position',
tabBarPositionOptions: { top: 'Top', left: 'Left' },
```

- [ ] **Step 4: Rebuild shared package**

```bash
bun run --filter @browser/shared build
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/i18n/messages.ts
git commit -m "feat(i18n): add tabBarPosition keys"
```

---

### Task 3: Create useTabList Composable

**Files:**
- Create: `apps/renderer/src/composables/useTabList.ts`
- Modify: `apps/renderer/src/components/TabBar.vue` (lines 88-545)

**Interfaces:**
- Consumes: `TabState` from `@browser/ipc-contract`, `browserAPI` from preload
- Produces: `useTabList()` returning `{ tabs, thumbnailCache, setup, cleanup, ... }`

- [ ] **Step 1: Create useTabList.ts**

Create `apps/renderer/src/composables/useTabList.ts`:

```typescript
import type { TabState } from '@browser/ipc-contract'
import { ref } from 'vue'

/**
 * 共享标签数据与操作逻辑，供 TabBar（水平）和 VerticalTabBar（垂直）复用。
 * thumbnailCache 为模块级共享，切换布局后缩略图不丢失。
 */
const thumbnailCache = new Map<string, string>()

export function useTabList() {
  const tabs = ref<TabState[]>([])

  let stateChangeHandler: ((state: TabState) => void) | null = null
  let createdHandler: ((state: TabState) => void) | null = null
  let removedHandler: ((tabId: string) => void) | null = null

  async function loadTabs(): Promise<void> {
    tabs.value = await window.browserAPI.getList()
    console.debug('[useTabList] loadTabs: count', tabs.value.length)
  }

  function activateTab(tabId: string): void {
    console.debug('[useTabList] activateTab: tabId', tabId)
    window.browserAPI.activateTab(tabId)
  }

  function closeTab(tabId: string): void {
    console.debug('[useTabList] closeTab: tabId', tabId)
    window.browserAPI.closeTab(tabId)
  }

  function createNewTab(): void {
    console.debug('[useTabList] createNewTab')
    window.browserAPI.createNewTab()
  }

  /** 固定标签永远排在最前（保持相对顺序），并同步到主进程层叠顺序。 */
  function applyOrder(): void {
    const pinned = tabs.value.filter((t) => t.isPinned)
    const unpinned = tabs.value.filter((t) => !t.isPinned)
    const ordered = [...pinned, ...unpinned]
    tabs.value = ordered
    console.debug('[useTabList] applyOrder: order', ordered.map((t) => t.id).join(','))
    window.browserAPI.reorderTabs(ordered.map((t) => t.id))
  }

  /** 将新标签插入到目标标签右侧并同步顺序。 */
  function insertAfter(targetId: string, newTab: TabState): void {
    const others = tabs.value.filter((t) => t.id !== newTab.id)
    const pos = others.findIndex((t) => t.id === targetId)
    others.splice(pos + 1, 0, newTab)
    tabs.value = others
    window.browserAPI.reorderTabs(others.map((t) => t.id))
  }

  /** 内部页（wmfx://）按路由展示固定图标，避免回退到破图 favicon。 */
  function isInternalUrl(url: string): boolean {
    return url.startsWith('wmfx://')
  }

  function newTabToRight(tab: TabState): void {
    void window.browserAPI.createTab({ url: 'wmfx://newtab', activate: true }).then((newTab) => {
      insertAfter(tab.id, newTab)
    })
  }

  function reloadTab(tab: TabState): void {
    window.browserAPI.reload(tab.id)
  }

  function duplicateTab(tab: TabState): void {
    const { url, sessionId } = tab.navigation
    void window.browserAPI.createTab({ url, sessionId, activate: true }).then((newTab) => {
      insertAfter(tab.id, newTab)
    })
  }

  function togglePin(tab: TabState): void {
    window.browserAPI.setPinned(tab.id, !tab.isPinned)
  }

  function toggleMute(tab: TabState): void {
    window.browserAPI.setMuted(tab.id, !tab.isMuted)
  }

  function closeOthers(tab: TabState): void {
    const ids = tabs.value.filter((t) => t.id !== tab.id).map((t) => t.id)
    console.debug('[useTabList] closeOthers: keep close', tab.id, ids.join(','))
    window.browserAPI.closeTabs(ids)
  }

  function closeRight(tab: TabState): void {
    const idx = tabs.value.findIndex((t) => t.id === tab.id)
    const ids = tabs.value.slice(idx + 1).map((t) => t.id)
    console.debug('[useTabList] closeRight: keep close', tab.id, ids.join(','))
    window.browserAPI.closeTabs(ids)
  }

  function closeLeft(tab: TabState): void {
    const idx = tabs.value.findIndex((t) => t.id === tab.id)
    const ids = tabs.value.slice(0, idx).map((t) => t.id)
    console.debug('[useTabList] closeLeft: keep close', tab.id, ids.join(','))
    window.browserAPI.closeTabs(ids)
  }

  /** 注册 IPC 监听器，必须在 loadTabs 之前调用以避免竞态。 */
  function setup(): void {
    stateChangeHandler = (state: TabState) => {
      const idx = tabs.value.findIndex((t) => t.id === state.id)
      if (idx >= 0) {
        const wasPinned = tabs.value[idx].isPinned
        const prevUrl = tabs.value[idx].navigation.committedUrl
        tabs.value[idx] = state
        if (prevUrl !== state.navigation.committedUrl) {
          thumbnailCache.delete(state.id)
        }
        if (wasPinned !== state.isPinned) {
          applyOrder()
        }
      }
    }

    createdHandler = (state: TabState) => {
      if (!tabs.value.some((t) => t.id === state.id)) {
        tabs.value.push(state)
        applyOrder()
      }
    }

    removedHandler = (tabId: string) => {
      tabs.value = tabs.value.filter((t) => t.id !== tabId)
    }

    window.browserAPI.onTabStateChange(stateChangeHandler)
    window.browserAPI.onTabCreated(createdHandler)
    window.browserAPI.onTabRemoved(removedHandler)
  }

  function cleanup(): void {
    if (stateChangeHandler) window.browserAPI.removeListener('tab:state-change', stateChangeHandler as (...args: unknown[]) => void)
    if (createdHandler) window.browserAPI.removeListener('tab:created', createdHandler as (...args: unknown[]) => void)
    if (removedHandler) window.browserAPI.removeListener('tab:removed', removedHandler as (...args: unknown[]) => void)
    stateChangeHandler = null
    createdHandler = null
    removedHandler = null
  }

  return {
    tabs,
    thumbnailCache,
    loadTabs,
    setup,
    cleanup,
    applyOrder,
    insertAfter,
    isInternalUrl,
    activateTab,
    closeTab,
    createNewTab,
    newTabToRight,
    reloadTab,
    duplicateTab,
    togglePin,
    toggleMute,
    closeOthers,
    closeRight,
    closeLeft,
  }
}
```

- [ ] **Step 2: Verify composable compiles**

```bash
bun run --filter @browser/renderer build 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/composables/useTabList.ts
git commit -m "feat(tabs): create useTabList composable for shared tab logic"
```

---

### Task 4: Migrate TabBar.vue to useTabList

**Files:**
- Modify: `apps/renderer/src/components/TabBar.vue` (full script section)

**Interfaces:**
- Consumes: `useTabList()` from Task 3
- Produces: TabBar.vue uses composable, no behavior change

- [ ] **Step 1: Replace script setup imports and state**

In `apps/renderer/src/components/TabBar.vue`, replace the imports and state declaration section. Add import:

```typescript
import { useTabList } from '../composables/useTabList'
```

Replace the reactive state and function declarations. Keep only TabBar-specific state:

```typescript
const { tabs, thumbnailCache, loadTabs, setup, cleanup, applyOrder, insertAfter, isInternalUrl, activateTab: activateTabBase, closeTab, createNewTab: createNewTabBase, newTabToRight, reloadTab, duplicateTab, togglePin, toggleMute, closeOthers, closeRight, closeLeft } = useTabList()

const tabBarRef = ref<HTMLElement>()
const tabBarWidth = ref(0)
const isMaximized = ref(false)
const activeMenuTabId = ref<string | null>(null)

// TabBar-specific hover state (not shared)
let hoverDelayTimer: ReturnType<typeof setTimeout> | null = null
let hoverLeaveTimer: ReturnType<typeof setTimeout> | null = null
let hoverPopover: Popover | null = null
let hoverPopoverTabId: string | null = null
```

- [ ] **Step 2: Update activateTab and createNewTab wrappers**

Replace the existing functions to use composable functions plus TabBar-specific logic:

```typescript
function activateTab(tabId: string): void {
  closeHoverPopover()
  activateTabBase(tabId)
}

function createNewTab(): void {
  createNewTabBase()
  requestAddressBarFocus()
}
```

- [ ] **Step 3: Remove extracted functions**

Delete the following functions from TabBar.vue (they now live in useTabList):
- `loadTabs` (line 241-245)
- `closeTab` (line 267-270)
- `applyOrder` (line 278-286)
- `insertAfter` (line 289-295)
- `isInternalUrl` (line 298-300)
- `newTabToRight` (line 322-326)
- `reloadTab` (line 328-331)
- `duplicateTab` (line 334-342)
- `togglePin` (line 344-347)
- `toggleMute` (line 349-352)
- `closeOthers` (line 354-358)
- `closeRight` (line 360-365)
- `closeLeft` (line 367-372)

- [ ] **Step 4: Update onMounted/onUnmounted**

Replace the IPC listener setup in `onMounted` with composable calls:

```typescript
onMounted(() => {
  setup()
  void loadTabs().then(applyOrder)
  // ResizeObserver stays in TabBar (UI-specific)
  resizeObserver = new ResizeObserver(() => {
    if (tabBarRef.value) {
      tabBarWidth.value = tabBarRef.value.clientWidth
    }
  })
  if (tabBarRef.value) resizeObserver.observe(tabBarRef.value)
  // Window maximize state
  void window.browserAPI.isMaximized().then((v) => { isMaximized.value = v })
  window.browserAPI.onMaximizeChange((maximized: boolean) => { isMaximized.value = maximized })
})
```

Replace `onUnmounted`:

```typescript
onUnmounted(() => {
  cleanup()
  if (resizeObserver) resizeObserver.disconnect()
  if (hoverDelayTimer) clearTimeout(hoverDelayTimer)
  if (hoverLeaveTimer) clearTimeout(hoverLeaveTimer)
  hoverPopover?.close()
})
```

- [ ] **Step 5: Verify no behavior change**

```bash
bun run --filter @browser/renderer build
```

- [ ] **Step 6: Commit**

```bash
git add apps/renderer/src/components/TabBar.vue
git commit -m "refactor(tabs): migrate TabBar to useTabList composable"
```

---

### Task 5: Add Vertical Tab Bar CSS Variables

**Files:**
- Modify: `apps/renderer/src/style.css`

**Interfaces:**
- Consumes: existing CSS variable convention (oklch + Chinese comments)
- Produces: CSS variables for vertical tab bar

- [ ] **Step 1: Add CSS variables to :root**

In `apps/renderer/src/style.css`, find the `:root` selector. Add after the existing tab-related variables:

```css
  /* 垂直标签栏展开宽度 */
  --vtab-width-expanded: 220px;
  /* 垂直标签栏折叠宽度 */
  --vtab-width-collapsed: 48px;
  /* 垂直标签栏背景色（复用水平标签栏） */
  --vtab-bg: var(--tabbar-bg);
  /* 垂直标签栏 active 标签背景 */
  --vtab-item-active-bg: var(--bg-tab-hover);
  /* 垂直标签栏 active 指示器宽度 */
  --vtab-indicator-width: 3px;
  /* 垂直标签栏标签项高度 */
  --vtab-item-height: 32px;
  /* 垂直标签栏折叠时标签项高度 */
  --vtab-item-height-collapsed: 40px;
```

- [ ] **Step 2: Add dark mode overrides**

Find the `[data-theme="dark"]` selector. Add corresponding dark overrides:

```css
  --vtab-bg: var(--tabbar-bg);
  --vtab-item-active-bg: var(--bg-tab-hover);
```

(Note: these复用现有变量，dark mode 自动跟随。仅在需要独立覆盖时才添加。)

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/style.css
git commit -m "style: add vertical tab bar CSS variables"
```

---

### Task 6: Create VerticalTabBar.vue Component

**Files:**
- Create: `apps/renderer/src/components/VerticalTabBar.vue`

**Interfaces:**
- Consumes: `useTabList()` from Task 3, `Popover` from `../lib/popover`, `DropdownMenu` from `../lib/dropdown-menu`
- Produces: renders vertical tab list with auto-collapse

- [ ] **Step 1: Create VerticalTabBar.vue with template**

Create `apps/renderer/src/components/VerticalTabBar.vue`:

```vue
<template>
  <div
    ref="vtabBarRef"
    class="vertical-tab-bar"
    :class="{ 'vertical-tab-bar--expanded': isExpanded }"
    @mouseenter="onBarEnter"
    @mouseleave="onBarLeave"
  >
    <div class="vtab-list">
      <template v-for="tab in tabs" :key="tab.id">
        <div
          v-if="tab.isPinned && isFirstUnpinned(tab)"
          class="vtab-separator"
          :class="{ 'vtab-separator--visible': isExpanded }"
        />
        <div
          class="vtab-item"
          :class="{
            'vtab-item--active': tab.active,
            'vtab-item--pinned': tab.isPinned,
          }"
          @click="activateTab(tab.id)"
          @contextmenu.prevent="openTabContextMenu($event, tab)"
          draggable="true"
          @dragstart="onDragStart($event, tab)"
          @dragover.prevent="onDragOver($event, tab)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, tab)"
          @dragend="onDragEnd"
          @mouseenter="onTabEnter($event, tab)"
          @mouseleave="onTabLeave"
        >
          <div v-if="tab.active" class="vtab-indicator" />
          <div class="vtab-favicon">
            <Favicon v-if="!showTabLoading(tab)" :src="tab.favicon" :size="16" />
            <Spinner v-else :size="14" />
          </div>
          <template v-if="isExpanded">
            <div class="vtab-title">{{ tab.title || 'New Tab' }}</div>
            <IconButton
              v-if="!tab.isPinned"
              class="vtab-close"
              :icon="closeIcon"
              :size="14"
              @click.stop="closeTab(tab.id)"
            />
          </template>
        </div>
      </template>
    </div>
    <div class="vtab-new" @click="createNewTab()">
      <IconButton :icon="plusIcon" :size="18" />
    </div>
  </div>
</template>
```

- [ ] **Step 2: Add script setup**

```vue
<script setup lang="ts">
import type { PopoverAnchor, TabState } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { onMounted, onUnmounted, ref } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import { useI18n } from '../composables/useI18n'
import { useTabList } from '../composables/useTabList'
import { DropdownMenu } from '../lib/dropdown-menu'
import { Popover } from '../lib/popover'
import Favicon from './Favicon.vue'
import Spinner from './ui/Spinner.vue'

const closeIcon = { icon: 'ic:sharp-close' }
const plusIcon = { icon: 'ic:round-plus' }

const { t } = useI18n()
const {
  tabs, thumbnailCache, loadTabs, setup, cleanup,
  applyOrder, isInternalUrl, activateTab: activateTabBase,
  closeTab, createNewTab: createNewTabBase,
  newTabToRight, reloadTab, duplicateTab,
  togglePin, toggleMute, closeOthers, closeRight, closeLeft,
} = useTabList()

const vtabBarRef = ref<HTMLElement>()
const isExpanded = ref(false)
const activeMenuTabId = ref<string | null>(null)
const dragOverTabId = ref<string | null>(null)

// Hover popover state
let hoverDelayTimer: ReturnType<typeof setTimeout> | null = null
let hoverLeaveTimer: ReturnType<typeof setTimeout> | null = null
let hoverPopover: Popover | null = null
let hoverPopoverTabId: string | null = null
let barLeaveTimer: ReturnType<typeof setTimeout> | null = null

function isFirstUnpinned(tab: TabState): boolean {
  if (!tab.isPinned) return false
  const idx = tabs.value.findIndex((t) => t.id === tab.id)
  return tabs.value.findIndex((t) => !t.isPinned) === idx
}

function showTabLoading(tab: TabState): boolean {
  return tab.navigation.isLoading && !isInternalUrl(tab.navigation.committedUrl)
}

function activateTab(tabId: string): void {
  closeHoverPopover()
  activateTabBase(tabId)
}

function createNewTab(): void {
  createNewTabBase()
}

// --- Auto-collapse ---
function onBarEnter(): void {
  if (barLeaveTimer) {
    clearTimeout(barLeaveTimer)
    barLeaveTimer = null
  }
  isExpanded.value = true
}

function onBarLeave(): void {
  barLeaveTimer = setTimeout(() => {
    isExpanded.value = false
  }, 300)
}

// --- Context menu ---
function openTabContextMenu(event: MouseEvent, tab: TabState): void {
  activeMenuTabId.value = tab.id
  const menuItems = [
    { id: 'reload', label: t('tab.reload') },
    { id: 'duplicate', label: t('tab.duplicate') },
    { id: 'pin', label: tab.isPinned ? t('tab.unpin') : t('tab.pin') },
    { id: 'mute', label: tab.isMuted ? t('tab.unmute') : t('tab.mute') },
    { type: 'separator' as const },
    { id: 'close', label: t('tab.close') },
    { id: 'close-others', label: t('tab.closeOthers') },
    { id: 'close-right', label: t('tab.closeRight') },
    { id: 'close-left', label: t('tab.closeLeft') },
  ]
  const menu = new DropdownMenu({
    x: event.clientX,
    y: event.clientY,
    items: menuItems,
    onSelect: (id) => runTabAction(id, tab),
    onDismiss: () => { activeMenuTabId.value = null },
  })
  menu.show()
}

function runTabAction(id: string, tab: TabState): void {
  switch (id) {
    case 'reload': reloadTab(tab); break
    case 'duplicate': duplicateTab(tab); break
    case 'pin': togglePin(tab); break
    case 'mute': toggleMute(tab); break
    case 'close': closeTab(tab.id); break
    case 'close-others': closeOthers(tab); break
    case 'close-right': closeRight(tab); break
    case 'close-left': closeLeft(tab); break
  }
}

// --- Hover thumbnail popover ---
function onTabEnter(event: MouseEvent, tab: TabState): void {
  if (tab.active || tab.isPinned) return
  cancelHoverLeave()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  hoverDelayTimer = setTimeout(() => {
    const src = thumbnailCache.get(tab.id) ?? null
    const data = { src, loading: !src, title: tab.title || 'New Tab', url: tab.navigation.displayUrl }
    const anchor: PopoverAnchor = {
      type: 'rect',
      rect: { x: rect.right + 6, y: rect.top, width: 0, height: rect.height },
      placement: 'end-start',
    }
    hoverPopover?.close()
    const tabId = tab.id
    hoverPopover = new Popover({
      type: 'tab-thumbnail',
      mode: 'bounded',
      anchor,
      data,
      size: { width: 280 },
      persistent: true,
      onDismiss: () => {
        if (hoverPopoverTabId === tabId) {
          hoverPopover = null
          hoverPopoverTabId = null
        }
      },
    })
    hoverPopoverTabId = tab.id
    if (!thumbnailCache.has(tab.id)) {
      void window.browserAPI.captureThumbnail(tab.id).then((dataUrl: string | null) => {
        if (hoverPopoverTabId === tab.id) {
          if (dataUrl) thumbnailCache.set(tab.id, dataUrl)
          hoverPopover?.sendData({ ...data, src: dataUrl, loading: false })
        }
      })
    }
  }, 300)
}

function onTabLeave(): void {
  if (hoverDelayTimer) {
    clearTimeout(hoverDelayTimer)
    hoverDelayTimer = null
  }
  hoverLeaveTimer = setTimeout(closeHoverPopover, 200)
}

function cancelHoverLeave(): void {
  if (hoverLeaveTimer) {
    clearTimeout(hoverLeaveTimer)
    hoverLeaveTimer = null
  }
}

function closeHoverPopover(): void {
  if (hoverDelayTimer) {
    clearTimeout(hoverDelayTimer)
    hoverDelayTimer = null
  }
  if (hoverLeaveTimer) {
    clearTimeout(hoverLeaveTimer)
    hoverLeaveTimer = null
  }
  hoverPopover?.close()
  hoverPopover = null
  hoverPopoverTabId = null
}

// --- Drag & drop ---
function onDragStart(event: DragEvent, tab: TabState): void {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', tab.id)
}

function onDragOver(event: DragEvent, tab: TabState): void {
  if (!event.dataTransfer) return
  dragOverTabId.value = tab.id
}

function onDragLeave(): void {
  dragOverTabId.value = null
}

function onDrop(event: DragEvent, targetTab: TabState): void {
  if (!event.dataTransfer) return
  const srcId = event.dataTransfer.getData('text/plain')
  if (!srcId || srcId === targetTab.id) return
  const srcIdx = tabs.value.findIndex((t) => t.id === srcId)
  const targetIdx = tabs.value.findIndex((t) => t.id === targetTab.id)
  if (srcIdx < 0 || targetIdx < 0) return
  const [moved] = tabs.value.splice(srcIdx, 1)
  tabs.value.splice(targetIdx, 0, moved)
  applyOrder()
  dragOverTabId.value = null
}

function onDragEnd(): void {
  dragOverTabId.value = null
}

// --- Lifecycle ---
onMounted(() => {
  setup()
  void loadTabs().then(applyOrder)
})

onUnmounted(() => {
  cleanup()
  if (hoverDelayTimer) clearTimeout(hoverDelayTimer)
  if (hoverLeaveTimer) clearTimeout(hoverLeaveTimer)
  if (barLeaveTimer) clearTimeout(barLeaveTimer)
  hoverPopover?.close()
})
</script>
```

- [ ] **Step 3: Add styles**

```vue
<style scoped>
.vertical-tab-bar {
  display: flex;
  flex-direction: column;
  width: var(--vtab-width-collapsed);
  background: var(--vtab-bg);
  border-right: 1px solid var(--border);
  overflow: hidden;
  flex-shrink: 0;
  transition: width 150ms ease;
  user-select: none;
}

.vertical-tab-bar--expanded {
  width: var(--vtab-width-expanded);
}

.vtab-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px;
}

.vtab-item {
  display: flex;
  align-items: center;
  height: var(--vtab-item-height-collapsed);
  border-radius: 6px;
  padding: 0 8px;
  cursor: pointer;
  position: relative;
  gap: 8px;
  transition: background 100ms;
}

.vertical-tab-bar--expanded .vtab-item {
  height: var(--vtab-item-height);
  padding: 0 8px 0 12px;
}

.vtab-item:hover {
  background: var(--vtab-item-active-bg);
}

.vtab-item--active {
  background: var(--vtab-item-active-bg);
}

.vtab-indicator {
  position: absolute;
  left: 0;
  top: 25%;
  bottom: 25%;
  width: var(--vtab-indicator-width);
  background: var(--accent-color);
  border-radius: 2px;
}

.vtab-favicon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.vertical-tab-bar:not(.vertical-tab-bar--expanded) .vtab-favicon {
  margin: 0 auto;
}

.vtab-title {
  flex: 1;
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.vtab-close {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 100ms;
}

.vtab-item:hover .vtab-close {
  opacity: 1;
}

.vtab-separator {
  height: 0;
  overflow: hidden;
  margin: 4px 8px;
  border-top: 1px solid var(--border);
  transition: height 150ms;
}

.vtab-separator--visible {
  height: 1px;
}

.vtab-new {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-top: 1px solid var(--border);
}
</style>
```

- [ ] **Step 4: Verify compiles**

```bash
bun run --filter @browser/renderer build 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add apps/renderer/src/components/VerticalTabBar.vue
git commit -m "feat(tabs): create VerticalTabBar component with auto-collapse"
```

---

### Task 7: Add Layout Switch to ChromeUI

**Files:**
- Modify: `apps/renderer/src/components/ChromeUI.vue` (lines 1-28, 30-105, 107-160)

**Interfaces:**
- Consumes: `useTabList()` for `tabBarPosition`, `VerticalTabBar.vue` from Task 6, `TabBar.vue` (existing)
- Produces: dynamic layout switching based on settings, respecting `isHtmlFullscreen`

**Note:** ChromeUI now has `isHtmlFullscreen` (line 48) that hides all UI chrome when a tab enters HTML Fullscreen API. Both horizontal and vertical tab bars must be hidden in fullscreen mode.

- [ ] **Step 1: Add tabBarPosition state to ChromeUI script**

In `apps/renderer/src/components/ChromeUI.vue`, add to imports:

```typescript
import VerticalTabBar from './VerticalTabBar.vue'
```

Add state:

```typescript
const tabBarPosition = ref<'top' | 'left'>('top')
```

Add function to sync the setting:

```typescript
function syncTabBarPosition(): void {
  void window.browserAPI.getSetting('tabBarPosition').then((v) => {
    tabBarPosition.value = (v as 'top' | 'left') ?? 'top'
  })
}
```

- [ ] **Step 2: Call syncTabBarPosition in onMounted**

Add to the `onMounted` block (after `syncWindowInfo()`):

```typescript
syncTabBarPosition()
```

- [ ] **Step 3: Update template**

Replace the template in ChromeUI.vue. Key change: both tab bar modes are hidden when `isHtmlFullscreen`:

```vue
<template>
  <div
    class="chrome-ui"
    :class="{
      'chrome-ui--incognito': isIncognito,
      'chrome-ui--left': tabBarPosition === 'left',
    }"
  >
    <VerticalTabBar v-if="tabBarPosition === 'left' && !isHtmlFullscreen" />
    <TabBar v-else-if="!isHtmlFullscreen" :is-incognito="isIncognito" />
    <div class="chrome-main">
      <div class="chrome-content">
        <AddressBar
          v-if="activeTab && !isHtmlFullscreen"
          :tab-id="activeTab.id"
          :url="activeTab.navigation.displayUrl"
          :can-go-back="activeTab.canGoBack"
          :can-go-forward="activeTab.canGoForward"
          :is-loading="activeTab.navigation.isLoading"
          :security-state="activeTab.navigation.securityState"
          :favicon="activeTab.favicon"
          :is-reader-mode="activeTab.isReaderMode"
        />
        <BookmarkBar v-if="showBookmarkBar && !isHtmlFullscreen" />
        <Viewport v-if="activeTab" :tab-id="activeTab.id" />
      </div>
      <FindBar v-if="!isHtmlFullscreen" :active-tab-id="activeTab?.id ?? null" />
    </div>
    <div v-if="isIncognito && !isHtmlFullscreen" class="incognito-badge" :title="t('appMenu.incognitoWindow')">
      <span class="incognito-dot" />
      <span class="incognito-label">{{ t('appMenu.incognitoWindow') }}</span>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Add CSS for vertical layout mode**

In ChromeUI.vue's `<style scoped>`, add after `.chrome-ui`:

```css
.chrome-ui--left {
  flex-direction: row;
}
```

The existing `.chrome-ui` flex column layout stays for top mode.

- [ ] **Step 5: Verify layout switching works**

```bash
bun run --filter @browser/renderer build
```

- [ ] **Step 6: Commit**

```bash
git add apps/renderer/src/components/ChromeUI.vue
git commit -m "feat(tabs): add layout switching in ChromeUI (top/left)"
```

---

### Task 8: Add Settings UI with Illustrations

**Files:**
- Modify: `apps/renderer/src/views/settings/AppearanceView.vue`

**Interfaces:**
- Consumes: `useI18n`, `Section`/`SectionItem` components (card-style, lines 1-53/1-84), settings i18n keys from Task 2
- Produces: visual tab position selector in settings page

**Note:** `Section.vue` is a card container (border-radius: 12px, bg-secondary background). `SectionItem.vue` is a left-label + right-control flex row with divider borders. The illustration cards need to sit INSIDE a `SectionItem`'s default slot.

- [ ] **Step 1: Add tab position section to AppearanceView**

In `apps/renderer/src/views/settings/AppearanceView.vue`, add a new `<Section>` after the existing theme section:

```vue
<template>
  <Section :title="t('settings.sections.theme')">
    <SectionItem :label="t('settings.theme')">
      <NRadioGroup :value="themeSetting" class="settings-radio-group" @update:value="onThemeChange">
        <NRadio v-for="mode in themeModes" :key="mode.value" :value="mode.value" :label="mode.label" />
      </NRadioGroup>
    </SectionItem>
  </Section>

  <Section :title="t('settings.tabBarPosition')">
    <SectionItem :label="t('settings.tabBarPosition')">
      <div class="tab-position-options">
        <label
          class="tab-position-card"
          :class="{ 'tab-position-card--active': tabBarPosition === 'top' }"
          @click="onTabBarPositionChange('top')"
        >
          <div class="tab-position-illustration">
            <!-- 水平标签栏示意图：顶部标签行 + 地址栏 + 内容区 -->
            <div class="illust-row">
              <div class="illust-tab-bar-h">
                <div class="illust-tab" /><div class="illust-tab" /><div class="illust-tab active" />
              </div>
            </div>
            <div class="illust-row">
              <div class="illust-addressbar" />
            </div>
            <div class="illust-row illust-content" />
          </div>
          <NRadio :value="tabBarPosition" value="top">
            {{ t('settings.tabBarPositionOptions.top') }}
          </NRadio>
        </label>

        <label
          class="tab-position-card"
          :class="{ 'tab-position-card--active': tabBarPosition === 'left' }"
          @click="onTabBarPositionChange('left')"
        >
          <div class="tab-position-illustration">
            <!-- 垂直标签栏示意图：左侧标签列 + 右侧地址栏/内容区 -->
            <div class="illust-row illust-row--h">
              <div class="illust-tab-bar-v">
                <div class="illust-tab-v" /><div class="illust-tab-v active" /><div class="illust-tab-v" />
              </div>
              <div class="illust-main-area">
                <div class="illust-addressbar" />
                <div class="illust-row illust-content" />
              </div>
            </div>
          </div>
          <NRadio :value="tabBarPosition" value="left">
            {{ t('settings.tabBarPositionOptions.left') }}
          </NRadio>
        </label>
      </div>
    </SectionItem>
  </Section>
</template>
```

- [ ] **Step 2: Add script logic**

Add to the script section:

```typescript
import { onMounted, ref } from 'vue'

const tabBarPosition = ref<'top' | 'left'>('top')

async function loadTabBarPosition(): Promise<void> {
  const v = await window.browserAPI.getSetting('tabBarPosition')
  tabBarPosition.value = (v as 'top' | 'left') ?? 'top'
}

function onTabBarPositionChange(value: 'top' | 'left'): void {
  tabBarPosition.value = value
  void window.browserAPI.setSetting({ key: 'tabBarPosition', value })
}

onMounted(() => {
  void loadTabBarPosition()
})
```

- [ ] **Step 3: Add illustration CSS**

```css
.tab-position-options {
  display: flex;
  gap: 12px;
}

.tab-position-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 150ms;
  flex: 1;
}

.tab-position-card--active {
  border-color: var(--accent-color);
}

.tab-position-illustration {
  width: 100%;
  height: 64px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-primary);
}

.illust-row {
  display: flex;
  height: 14px;
}

.illust-row--h {
  height: 100%;
}

.illust-tab-bar-h {
  display: flex;
  gap: 2px;
  padding: 2px 4px;
  background: var(--tabbar-bg, #cddffd);
  width: 100%;
}

.illust-tab {
  flex: 1;
  background: var(--bg-tertiary);
  border-radius: 2px;
}

.illust-tab.active {
  background: var(--accent-color);
  opacity: 0.5;
}

.illust-addressbar {
  height: 10px;
  margin: 2px 4px;
  background: var(--bg-tertiary);
  border-radius: 2px;
}

.illust-content {
  flex: 1;
  background: var(--bg-secondary);
}

.illust-tab-bar-v {
  width: 20px;
  background: var(--tabbar-bg, #cddffd);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px;
}

.illust-tab-v {
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: 2px;
}

.illust-tab-v.active {
  background: var(--accent-color);
  opacity: 0.5;
}

.illust-main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 4: Verify settings page renders**

```bash
bun run --filter @browser/renderer build
```

- [ ] **Step 5: Commit**

```bash
git add apps/renderer/src/views/settings/AppearanceView.vue
git commit -m "feat(settings): add tab position selector with layout illustrations"
```

---

### Task 9: Fix ChromeUI Listener Cleanup

**Files:**
- Modify: `apps/renderer/src/components/ChromeUI.vue` (onUnmounted)

**Interfaces:**
- Consumes: existing IPC listener references
- Produces: proper cleanup of all listeners

- [ ] **Step 1: Store listener references for cleanup**

In ChromeUI.vue script, store the handler references so they can be removed:

```typescript
let bookmarksChangedHandler: (() => void) | null = null
let focusAddressBarHandler: (() => void) | null = null
```

In onMounted, store references:

```typescript
bookmarksChangedHandler = () => syncBookmarkBar()
window.browserAPI.onBookmarksChanged(bookmarksChangedHandler)
focusAddressBarHandler = () => requestAddressBarFocus()
window.browserAPI.onFocusAddressBar(focusAddressBarHandler)
```

- [ ] **Step 2: Add cleanup in onUnmounted**

```typescript
onUnmounted(() => {
  // ... existing listener removal ...
  // Note: onBookmarksChanged and onFocusAddressBar may not have removeListener
  // If they do, clean them up here
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/components/ChromeUI.vue
git commit -m "fix: clean up ChromeUI IPC listeners on unmount"
```

---

### Task 10: Rebuild and Verify

**Files:** None (verification only)

- [ ] **Step 1: Full build**

```bash
bun run build
```

- [ ] **Step 2: Run linter**

```bash
bun run lint
```

- [ ] **Step 3: Run typecheck**

```bash
bun run lint:typecheck
```

- [ ] **Step 4: Start dev server and manual test**

```bash
bun run dev
```

Manual test checklist:
- [ ] Settings page shows tab position selector with illustrations
- [ ] Switch to "Left" → vertical tab bar appears on left side
- [ ] Vertical tab bar shows pinned tabs first, then unpinned
- [ ] Click tab → activates and shows content
- [ ] Hover tab → thumbnail popover appears on right side
- [ ] Right-click tab → context menu works
- [ ] Drag tab → reorder works
- [ ] Mouse leaves vertical bar → collapses after 300ms
- [ ] Mouse enters vertical bar → expands immediately
- [ ] Close tab → tab removed from list
- [ ] New tab → added to list
- [ ] Switch back to "Top" → horizontal tab bar restores
- [ ] Window controls work in both modes (non-macOS)

- [ ] **Step 5: Final commit if needed**
