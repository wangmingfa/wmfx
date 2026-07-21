# 分屏视图（Split View）设计文档

## 概述

在浏览器窗口内容区域内实现多面板分屏（Split View），支持最多 4 个面板的网格布局。每个面板拥有独立的迷你标签栏、地址栏和 viewport，可并排显示不同网页。面板通过拖拽交互创建/合并/调整比例，类似 Arc 浏览器的 Split View。

### 核心能力
- 支持水平/垂直分裂面板，最多 4 个同时可见
- 每个面板独立标签栏、地址栏、viewport
- 标签页可拖入/拖出面板，面板间移动
- 拖拽分割线调整面板比例
- 所有面板合并为 1 时自动退出分屏模式

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 布局引擎 | 二叉树（i3wm 风格） | 天然支持嵌套分割和比例调整，比固定网格更灵活 |
| 面板上限 | 4 个 | 平衡可用性与复杂度，树深度 ≤ 2 |
| 标签管理 | 每面板独立 MiniTabBar | 标签归属清晰，拖拽交互直观 |
| 全局标签栏 | 分屏时隐藏 | 避免 UI 冗余，面板内标签已足够 |
| 地址栏 | 每面板独立 | 每个面板显示各自的导航信息 |

## 数据模型

### PaneTreeNode

面板树节点，叶子是具体面板，非叶子是分割节点：

```typescript
type PaneTreeNode =
  | { type: 'leaf'; paneId: string; tabId: string }
  | {
      type: 'split';
      direction: 'horizontal' | 'vertical';
      splitRatio: number; // 0~1, left/top 占比
      left: PaneTreeNode;
      right: PaneTreeNode;
    }
```

### SplitState

每个窗口的分屏状态：

```typescript
interface SplitState {
  mode: 'single' | 'split';
  root: PaneTreeNode;
  minPanelWidth: number;   // 180
  minPanelHeight: number;  // 100
}
```

### Tab 扩展

现有 Tab 对象新增 `paneId` 字段：

```typescript
interface Tab {
  // ... 现有字段 ...
  paneId: string | null;  // null 表示属于全局标签栏
}
```

TabManager 新增：
- `tabToPane: Map<string, string | null>` — tabId → paneId
- `splitState: Map<string, SplitState>` — windowId → SplitState

## 主进程改动

### TabManager

| 方法 | 说明 |
|------|------|
| `splitPane(paneId, direction)` | 将指定面板按方向分裂为两个新面板 |
| `mergePane(paneId)` | 合并面板（移除该面板及其分割节点） |
| `moveTabToPane(tabId, paneId)` | 移动标签到指定面板 |
| `setSplitRatio(paneId, ratio)` | 调整面板分割比例 |
| `resolvePaneLayout(windowBounds)` | 解析面板树为每个 leaf 的实际 ViewBounds |
| `enterSplitMode()` | 进入分屏模式（隐藏全局标签栏/地址栏） |
| `exitSplitMode()` | 退出分屏模式（恢复全局标签栏/地址栏） |

### 布局解析算法

`resolvePaneLayout()` 递归遍历面板树，将窗口内容区域按比例分配给每个叶子节点。

**水平分割**：左面板宽度 = 区域宽度 × splitRatio，右面板宽度 = 区域宽度 × (1 - splitRatio)，高度不变。

**垂直分割**：上面板高度 = 区域高度 × splitRatio，下面板高度 = 区域高度 × (1 - splitRatio)，宽度不变。

**返回**：`Map<string, ViewBounds>`，key 为 paneId，value 为该面板在 window contentView 中的坐标。

### WebContentsView 管理

核心变化：**同时保持多个 WebContentsView 可见**，而非当前"移除旧 + 添加新"的单视图模型。

- 每个面板内 active tab 的 WebContentsView **始终在 `contentView.children` 中**
- 面板内非 active tab 的 View 设为 `setVisible(false)`（不销毁，仅隐藏）
- 面板内切换标签 → `setVisible(false/true)` + `setBounds()`，不改变 children 顺序
- 面板合并 → 旧面板的 View `setVisible(false)`，保留新面板的 View
- 分屏模式下的 `activate()` 改为只切换面板内的 active tab，不操作整个 contentView 的 children

### 分屏模式下的生命周期影响

- **暂停（Suspend）**：不在分屏面板内显示的标签仍可暂停；面板内可见的标签永不暂停
- **阅读模式（ReaderView）**：每个面板内的阅读模式独立管理，ReaderView 叠加在对应面板的 View 上
- **代理/无痕**：分屏面板继承窗口的 session 配置，不独立管理

## 渲染进程改动

### ChromeUI 布局

分屏模式下 `ChromeContent` 区域替换为 `SplitView` 组件：

```
ChromeUI (flex column, 100vh)
  ├── VerticalTabBar / TabBar（分屏模式隐藏）
  ├── AddressBar（分屏模式隐藏）
  ├── BookmarkBar（分屏模式隐藏）
  └── ChromeContent (flex: 1)
       └── SplitView（分屏模式）| Viewport（单面板模式）
```

分屏模式切换由 `splitState.mode` 驱动，不需要用户显式切换按钮。

### SplitView 组件

递归渲染 `PaneTreeNode`：

- 叶子节点 → `<Pane :pane-id="node.paneId" :bounds="bounds" />`
- 分割节点 → 按 `direction` + `splitRatio` 渲染子节点，中间插入 `<SplitBar />`

`SplitBar` 是 2px 宽/高的拖拽手柄，`mousedown` + `mousemove` 实时调整 `splitRatio`。

### Pane 组件

每个 Pane 内部结构：

```
Pane (position: absolute, 占满分配区域)
  ├── MiniTabBar（高度 24px）
  ├── PaneAddressBar（高度 32px，可折叠）
  └── PaneViewport（flex: 1）
```

- **MiniTabBar**：复用现有 `TabBar`/`VerticalTabBar` 的标签渲染逻辑，高度压缩至 24px
- **PaneAddressBar**：复用 `AddressBar` 组件，绑定面板内的 active tab
- **PaneViewport**：改造版 `Viewport`，绑定 `paneId` 而非单一 `activeTabId`，`ResizeObserver` 推送 `{ paneId, bounds }`

### 拖拽交互

| 动作 | 源 | 目标 | 行为 |
|------|-----|------|------|
| 标签 → 面板内容区 | 全局标签栏标签 | Pane | 标签移动到面板，面板 active 为该标签 |
| 标签 → 面板边缘 | 全局标签栏标签 | Pane 左/右/上/下边缘 | 分裂面板 + 标签进入新面板 |
| 标签 → 全局标签栏 | 面板内标签 | 全局标签栏 | 标签回到全局标签栏，面板若无其他标签则合并 |
| 拖边调整 | SplitBar | — | 实时调整 splitRatio，两个面板同时 resize |

使用 HTML5 Drag & Drop API，拖边调整使用 `mousedown` + `mousemove`。

## IPC 通信

| Channel | 方向 | 用途 |
|---------|------|------|
| `split:init` | invoke | 初始化分屏状态（窗口创建时） |
| `split:split` | invoke | 分裂当前面板（传入 direction） |
| `split:merge` | invoke | 合并面板（传入 paneId） |
| `split:resize` | invoke | 调整分割比例 |
| `split:getState` | invoke | 获取当前分屏状态 |
| `split:state-change` | send | 主进程→渲染进程，分屏状态变更广播 |

## 边界条件

| 场景 | 处理 |
|------|------|
| 窗口 resize 时面板比例 | 保持 splitRatio，重新计算绝对坐标 |
| 面板尺寸小于最小值 | 禁止调整，保持最小尺寸 |
| 最后一个面板被合并 | 自动退出分屏模式 |
| 分屏模式下关闭面板的最后一个标签 | 该面板自动合并到相邻面板 |
| 分屏模式下创建新标签 | 默认进入全局标签栏（paneId = null） |
| 分屏模式下工作区切换 | 保存分屏状态，恢复时重建面板树 |
| 分屏模式下阅读模式 | 每面板独立，不跨面板共享 |

## 实现阶段

### 阶段 1：基础设施
- 面板树数据模型 + SplitState 管理
- `resolvePaneLayout()` 布局算法
- TabManager 方法：splitPane / mergePane / moveTabToPane
- WebContentsView 多视图管理

### 阶段 2：渲染层
- SplitView 组件（递归渲染面板树）
- Pane 组件（MiniTabBar + PaneAddressBar + PaneViewport）
- 分屏模式切换（全局标签栏/地址栏隐藏）

### 阶段 3：交互
- 标签拖拽（标签 ↔ 面板、标签 ↔ 全局标签栏）
- 拖边调整比例
- 面板分裂/合并手势

### 阶段 4：生命周期
- 暂停逻辑适配（面板内标签不暂停）
- 阅读模式适配（每面板独立）
- 工作区切换适配

### 阶段 5：打磨
- 动画过渡（面板分裂/合并的平滑动画）
- 键盘快捷键（Ctrl+\ 快速分裂当前标签）
- 分屏状态持久化
