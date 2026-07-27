# 标签创建与关闭动画 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为水平标签栏的标签创建和关闭添加平滑的宽度过渡动画。

**Architecture:** 在 `useTabList.ts` 中暴露创建/关闭回调，在 `TabBar.vue` 中维护 `enteringTabs` / `closingTabs` 两个 Set 来追踪动画状态，通过模板条件覆盖宽度值配合 CSS transition 实现动画。

**Tech Stack:** Vue 3 Composition API, CSS Transitions, TypeScript

## Global Constraints

- 水平标签栏（`TabBar.vue`）专属，不影响垂直标签栏
- 固定标签（pinned）不参与动画
- 动画时长 200ms，缓动：创建 `ease-out`，关闭 `ease-in`
- 过渡属性：`width`、`min-width`

---

## File Map

| 文件 | 职责 | 操作 |
|------|------|------|
| `apps/renderer/src/composables/useTabList.ts` | 标签数据管理，暴露创建/关闭回调 | 修改 |
| `apps/renderer/src/components/TabBar.vue` | 标签栏 UI，管理动画状态和 CSS | 修改 |

---

### Task 1: useTabList 暴露创建回调

**Files:**
- Modify: `apps/renderer/src/composables/useTabList.ts`

**Interfaces:**
- Produces: `onTabCreated: Ref<((tabId: string) => void) | null>` — 外部注册的回调，创建标签时调用

- [ ] **Step 1: 在 useTabList 中添加 onTabCreated 回调支持**

在 `useTabList.ts` 中添加一个 `onTabCreated` ref，允许外部注册回调。在 `createdHandler` 中调用该回调：

```typescript
// useTabList.ts — 在 ref 声明区域添加
let tabCreatedCallback: ((tabId: string) => void) | null = null

// 新增函数
function onTabCreated(cb: (tabId: string) => void): void {
  tabCreatedCallback = cb
}
```

在 `createdHandler` 中，`tabs.push(state)` 之后调用回调：

```typescript
createdHandler = (state: TabState) => {
  if (!tabs.value.some((t) => t.id === state.id)) {
    tabs.value.push(state)
    applyOrder()
    tabCreatedCallback?.(state.id)
  }
}
```

在 return 对象中添加 `onTabCreated`。

- [ ] **Step 2: 验证编译通过**

Run: `bun run --filter @browser/renderer typecheck`
Expected: PASS（仅有 useConfirm.ts 预存错误）

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/composables/useTabList.ts
git commit -m "feat(tab-animation): expose onTabCreated callback in useTabList"
```

---

### Task 2: useTabList 暴露关闭回调

**Files:**
- Modify: `apps/renderer/src/composables/useTabList.ts`

**Interfaces:**
- Produces: `onTabClosing: Ref<((tabId: string) => void) | null>` — 外部注册的回调，关闭标签时调用
- Produces: `removeTab: (tabId: string) => void` — 动画结束后真正移除标签

- [ ] **Step 1: 添加 onTabClosing 回调和 removeTab 函数**

```typescript
// useTabList.ts — 在 ref 声明区域添加
let tabClosingCallback: ((tabId: string) => void) | null = null

function onTabClosing(cb: (tabId: string) => void): void {
  tabClosingCallback = cb
}

/** 动画结束后真正移除标签（由 TabBar 在 transitionend 后调用） */
function removeTab(tabId: string): void {
  tabs.value = tabs.value.filter((t) => t.id !== tabId)
}
```

在 `removedHandler` 中改为调用回调（而非直接移除）：

```typescript
removedHandler = (tabId: string) => {
  // 如果有关闭动画回调，由外部决定何时移除；否则直接移除
  if (tabClosingCallback) {
    tabClosingCallback(tabId)
  } else {
    tabs.value = tabs.value.filter((t) => t.id !== tabId)
  }
}
```

在 return 对象中添加 `onTabClosing` 和 `removeTab`。

- [ ] **Step 2: 验证编译通过**

Run: `bun run --filter @browser/renderer typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/composables/useTabList.ts
git commit -m "feat(tab-animation): expose onTabClosing callback and removeTab in useTabList"
```

---

### Task 3: TabBar 进入动画逻辑

**Files:**
- Modify: `apps/renderer/src/components/TabBar.vue`

**Interfaces:**
- Consumes: `onTabCreated` from Task 1
- Consumes: `tabs` (existing)

- [ ] **Step 1: 添加 enteringTabs Set 和注册回调**

在 `TabBar.vue` 的 `<script setup>` 中，在解构 `useTabList()` 之后添加：

```typescript
import { nextTick } from 'vue'

// --- 标签创建动画 ---
const enteringTabs = new Set<string>()

// 注册创建回调：新标签先以 1px 渲染，nextTick 后清除让其展开
onTabCreated((tabId: string) => {
  enteringTabs.add(tabId)
  void nextTick(() => {
    enteringTabs.delete(tabId)
  })
})
```

在 import 中添加 `nextTick`（已从 vue 导入 ref，合并即可）。

- [ ] **Step 2: 修改模板中的宽度计算**

找到模板中 `.tab-item` 的 `:style` 绑定（约第 29 行）。注意：固定标签（`tab.isPinned`）不参与动画，始终使用 `tabWidthFor(tab)`：

```html
<!-- 改后（此阶段仅有 enteringTabs，closingTabs 在 Task 4 添加） -->
:style="`width:${!tab.isPinned && enteringTabs.has(tab.id) ? 1 : tabWidthFor(tab)}px;min-width:${!tab.isPinned && enteringTabs.has(tab.id) ? 1 : tabWidthFor(tab)}px;max-width:${!tab.isPinned && enteringTabs.has(tab.id) ? 1 : tabWidthFor(tab)}px`"
```

- [ ] **Step 3: 添加 CSS transition**

在 `.tab-item` 样式中添加 transition：

```less
.tab-item {
  // 现有样式...
  transition: width 200ms ease-out, min-width 200ms ease-out;
}
```

- [ ] **Step 4: 手动验证创建动画**

Run: `bun run dev`，点击 `+` 新建标签
Expected: 新标签以细条出现，200ms 内展开到最终宽度，其他标签平滑收缩

- [ ] **Step 5: Commit**

```bash
git add apps/renderer/src/components/TabBar.vue
git commit -m "feat(tab-animation): add tab creation expand animation"
```

---

### Task 4: TabBar 关闭动画逻辑

**Files:**
- Modify: `apps/renderer/src/components/TabBar.vue`

**Interfaces:**
- Consumes: `onTabClosing` from Task 2
- Consumes: `removeTab` from Task 2

- [ ] **Step 1: 添加 closingTabs Set 和注册回调**

在 `TabBar.vue` 中，`enteringTabs` 旁边添加：

```typescript
// --- 标签关闭动画 ---
const closingTabs = new Set<string>()

onTabClosing((tabId: string) => {
  closingTabs.add(tabId)
  // 保持标签在数组中，宽度覆盖为 1px 以触发收缩动画
  // transitionend 后由 removeTab 移除
})
```

- [ ] **Step 2: 修改模板中的宽度计算（加入关闭态）**

将 Task 3 Step 2 中的模板宽度计算扩展为包含关闭态：

```html
:style="`width:${!tab.isPinned && (enteringTabs.has(tab.id) || closingTabs.has(tab.id)) ? 1 : tabWidthFor(tab)}px;min-width:${!tab.isPinned && (enteringTabs.has(tab.id) || closingTabs.has(tab.id)) ? 1 : tabWidthFor(tab)}px;max-width:${!tab.isPinned && (enteringTabs.has(tab.id) || closingTabs.has(tab.id)) ? 1 : tabWidthFor(tab)}px`"
```

- [ ] **Step 3: 处理 transitionend 事件移除标签**

在模板的 `.tab-item` div 上添加 `@transitionend` 事件处理：

```html
<div
  class="tab-item"
  :class="{ ... }"
  :style="..."
  @transitionend="onTabTransitionEnd($event, tab)"
>
```

在 `<script setup>` 中添加处理函数：

```typescript
function onTabTransitionEnd(event: TransitionEvent, tab: TabState): void {
  // 仅处理 width 过渡完成，忽略其他属性（如 background）
  if (event.propertyName !== 'width') return
  if (closingTabs.has(tab.id)) {
    closingTabs.delete(tab.id)
    removeTab(tab.id)
  }
}
```

- [ ] **Step 4: 修改 CSS transition 缓动**

将 `.tab-item` 的 transition 改为分别指定创建和关闭的缓动。由于 CSS 无法根据状态切换缓动，统一使用 `ease-in-out` 作为折中：

```less
.tab-item {
  transition: width 200ms ease-in-out, min-width 200ms ease-in-out;
}
```

- [ ] **Step 5: 手动验证关闭动画**

Run: `bun run dev`，打开多个标签后点击关闭按钮
Expected: 标签平滑收缩到消失，其他标签平滑扩展填补空隙

- [ ] **Step 6: 手动验证快速连续关闭**

Run: `bun run dev`，快速连续关闭多个标签
Expected: 每个标签独立收缩，无卡顿或残留

- [ ] **Step 7: Commit**

```bash
git add apps/renderer/src/components/TabBar.vue
git commit -m "feat(tab-animation): add tab close shrink animation"
```

---

### Task 5: 构建验证与清理

**Files:**
- Modify: `apps/renderer/src/components/TabBar.vue`（如需清理）
- Modify: `apps/renderer/src/composables/useTabList.ts`（如需清理）

- [ ] **Step 1: 全量构建验证**

Run: `bun run build`
Expected: PASS

- [ ] **Step 2: 全量类型检查**

Run: `bun run lint:typecheck`
Expected: PASS（仅 useConfirm.ts 预存错误）

- [ ] **Step 3: Lint 检查**

Run: `bun run lint:ts`
Expected: PASS

- [ ] **Step 4: Commit（如有清理改动）**

```bash
git add -A
git commit -m "chore(tab-animation): cleanup and final validation"
```
