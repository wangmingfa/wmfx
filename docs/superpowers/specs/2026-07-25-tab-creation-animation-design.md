# 标签创建与关闭动画设计

## 概述

为水平标签栏的标签创建和关闭添加平滑的展开/收缩动画。新标签从细条扩展到最终宽度；关闭的标签从当前宽度收缩到消失。动画与相邻标签的宽度调整同步进行。

## 目标

为标签创建和关闭提供视觉反馈，使 UI 更具响应性和精致感。动画应轻量（200ms）、不阻塞操作，并与现有 flexbox 布局兼容。

## 现有行为

- 标签通过 `v-for` + `:key="tab.id"` 在 `TabBar.vue` 中渲染
- 每个标签的 `width`、`min-width`、`max-width` 通过 `tabWidthFor()` 动态计算并设为 inline style
- 新建或关闭标签时，Vue 立即重渲染所有标签的新宽度，无过渡效果

## 设计

### 创建动画

**阶段 1 — 初始渲染（width: 1px）**

`useTabList.ts` 的 `createdHandler` 触发时，新标签 ID 被加入 `TabBar.vue` 中的 `enteringTabs: Set<string>`。模板中判断：若标签在 `enteringTabs` 中，宽度设为 `1px` 而非调用 `tabWidthFor()`。

**阶段 2 — 宽度过渡（1px → 最终宽度）**

Vue 首次渲染完成后（`nextTick`），从 `enteringTabs` 中移除该标签 ID。模板恢复使用 `tabWidthFor()` 的计算值。CSS `transition: width 200ms ease-out` 将宽度从 `1px` 平滑过渡到最终值。

### 关闭动画

**阶段 1 — 收缩至 1px**

`removedHandler` 触发时，不立即从数组中移除标签，而是将其 ID 加入 `closingTabs: Set<string>`。模板将该标签宽度覆盖为 `1px`，其他标签平滑扩展填补空隙。

**阶段 2 — 从 DOM 移除**

CSS 过渡完成后（200ms），通过 `transitionend` 事件监听器触发，将标签从 `tabs` 数组中真正移除。

### 视觉效果 — 创建

1. 新标签以 1px 细条出现在 `+` 按钮左侧
2. 200ms 内向左扩展到最终宽度（`ease-out`）
3. `+` 按钮和窗口控件被向右推开
4. 所有现有标签平滑收缩以容纳新标签

### 视觉效果 — 关闭

1. 标签内容立即消失（可选：淡出）
2. 标签从当前宽度在 200ms 内收缩到 1px（`ease-in`）
3. `+` 按钮和窗口控件向左移动填补空隙
4. 所有现有标签平滑扩展以填充空出的空间
5. 过渡结束后，标签从 DOM 移除

### 数据流 — 创建

```
主进程: tab:created IPC
  ↓
useTabList.ts: createdHandler → tabs.push(state) → applyOrder()
  ↓
TabBar.vue: enteringTabs.add(newTabId)
  ↓
模板: tab width = enteringTabs.has(tab.id) ? 1 : tabWidthFor(tab)
  ↓
nextTick: enteringTabs.delete(newTabId)
  ↓
CSS transition: width 1px → 最终宽度
```

### 数据流 — 关闭

```
用户点击关闭 / 快捷键
  ↓
useTabList.ts: closeTab(tabId) → IPC 通知主进程
  ↓
主进程: 移除标签, 触发 tab:removed
  ↓
useTabList.ts: removedHandler → tabs = tabs.filter(...)
  ↓
TabBar.vue: closingTabs.add(tabId) → 保留标签在数组中, width 设为 1px
  ↓
CSS transition: width 当前值 → 1px
  ↓
transitionend 事件 → 从 tabs 数组中真正移除标签
```

### 涉及文件

| 文件 | 改动 |
|------|------|
| `apps/renderer/src/composables/useTabList.ts` | 新增 `onTabCreated` / `onTabClosing` 回调；修改 `removedHandler` 支持延迟移除 |
| `apps/renderer/src/components/TabBar.vue` | 新增 `enteringTabs` / `closingTabs` Set；模板覆盖进入/关闭态宽度；处理 `transitionend` |
| `apps/renderer/src/components/TabBar.vue` (CSS) | `.tab-item` 添加 `transition: width 200ms ease-out, min-width 200ms ease-out` |

### 边界情况

- **快速连续创建**：每个新标签独立追踪，多个标签可同时处于"进入"状态
- **快速连续关闭**：关闭中的标签若被重新添加（如撤销），应取消关闭动画
- **创建后立即关闭**：若标签正在创建动画中被关闭，取消创建动画并播放关闭动画
- **固定标签**：固定标签宽度固定为 30px，不受动画影响
- **垂直标签栏**：本设计仅适用于水平标签栏（`TabBar.vue`），`VerticalTabBar.vue` 使用 `TabItem.vue` 组件，无需改动

### 参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 初始宽度（创建） | 1px | 最小视觉占位，避免布局跳变 |
| 最终宽度（关闭） | 1px | 平滑收缩后再移除 |
| 时长 | 200ms | 与现有 UI 过渡保持一致的轻快手感 |
| 缓动（创建） | `ease-out` | 自然减速，标签平稳落位 |
| 缓动（关闭） | `ease-in` | 加速收缩，符合移除操作的直觉 |
| 过渡属性 | `width`、`min-width` | 两者都需过渡以避免布局冲突 |

### 不在本次范围

- 标签排序动画（已由拖拽处理）
- 标签激活动画
- 垂直标签栏动画
- 批量关闭动画
