# 垂直标签栏设计方案

## 概述

为浏览器新增可选的垂直标签栏模式（Arc 风格），用户可在设置页即时切换水平/垂直布局，无需重启窗口。当前无持久化侧边栏，垂直标签栏不与现有 UI 冲突。

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 风格 | 左侧垂直标签栏 | 左侧固定侧边栏，折叠态仅 favicon，展开态 favicon+标题+关闭按钮 |
| 折叠行为 | 自动折叠 | 鼠标离开300ms后折叠，进入时立即展开。折叠/展开会挤压页面宽度（挤压模式） |
| 与侧边栏关系 | 无冲突 | 当前无持久化侧边栏，下载/历史/书签/设置为独立页面视图，垂直标签栏不与之冲突 |
| 地址栏位置 | 保持顶部 | 地址栏在垂直标签栏右侧，与水平模式一致 |
| 切换方式 | 设置页即时切换 | v-if 动态切换，无需重启窗口 |

## 数据层

### SettingsManager 新增字段

```typescript
tabBarPosition: 'top' | 'left'  // 默认 'top'
```

持久化到 electron-store，即时生效。

### IPC 通道

无新增 IPC 通道。垂直标签栏复用所有现有 `tab:*` 通道。

## 组件架构

### ChromeUI 布局切换

`ChromeUI.vue` 根据 `tabBarPosition` 设置值动态切换布局：

```html
<div :class="['chrome-ui', tabBarPosition === 'left' ? 'chrome-ui--left' : 'chrome-ui--top']">
  <VerticalTabBar v-if="tabBarPosition === 'left'" />
  <TabBar v-else />
  <div class="chrome-main">
    <AddressBar v-if="activeTab" />
    <BookmarkBar v-if="showBookmarkBar" />
    <Viewport v-if="activeTab" />
    <FindBar />
  </div>
</div>
```

CSS 布局：

```css
/* 水平模式（现有） */
.chrome-ui--top {
  flex-direction: column;
  height: 100vh;
}

/* 垂直模式 */
.chrome-ui--left {
  flex-direction: row;
  height: 100vh;
}
.chrome-ui--left .chrome-main {
  flex: 1;
  min-width: 0;  /* 防止 flex 子元素溢出 */
}
```

窗口控制按钮在垂直模式下移到地址栏右侧（非 macOS）。

### useTabList composable

两个 TabBar 共用的逻辑抽取到 `apps/renderer/src/composables/useTabList.ts`：

```typescript
export function useTabList() {
  const tabs = ref<TabState[]>([])
  const thumbnailCache = new Map<string, string>()

  // Tab 生命周期
  async function loadTabs() { ... }
  function stateChangeHandler(state: TabState) { ... }
  function createdHandler(state: TabState) { ... }
  function removedHandler(tabId: string) { ... }

  // 右键菜单 actions
  function closeTab(tabId: string) { ... }
  function closeOthers(tab: TabState) { ... }
  function closeRight(tab: TabState) { ... }
  function closeLeft(tab: TabState) { ... }

  // 缩略图
  async function captureThumbnail(tabId: string): Promise<string | null> { ... }

  // IPC 注册/清理
  function setup() { ... }
  function cleanup() { ... }

  return {
    tabs, thumbnailCache,
    loadTabs, setup, cleanup,
    closeTab, closeOthers, closeRight, closeLeft,
    captureThumbnail,
  }
}
```

`thumbnailCache` 为模块级共享 Map，确保切换布局后缩略图不丢失。

### VerticalTabBar.vue

```
VerticalTabBar.vue
├── div.vertical-tab-bar (flex column, 固定宽度)
│   ├── div.vtab-list (flex: 1, overflow-y: auto)
│   │   ├── div.vtab-item.pinned (固定标签, 固定在顶部)
│   │   │   ├── Favicon (16px, 居中)
│   │   │   └── [展开时] title + close btn
│   │   ├── div.vtab-separator (pinned 与 unpinned 分隔线, 仅展开时可见)
│   │   └── div.vtab-item (非固定标签)
│   │       ├── Favicon (16px)
│   │       ├── title (展开时, 单行省略)
│   │       └── close btn (展开时, IconButton)
│   └── div.vtab-new
│       └── IconButton (ic:round-plus)
```

#### 自动折叠逻辑

| 状态 | 宽度 | 显示内容 | 布局影响 |
|------|------|---------|---------|
| 折叠 | 48px | 仅 favicon（居中） | 页面宽度增加 48px |
| 展开 | 220px | favicon + title + close btn | 页面宽度增加 220px |

- **折叠触发**：`mouseleave` → 300ms 延迟 → 切换折叠态
- **展开触发**：`mouseenter` → 立即展开（无延迟）
- **保持展开**：右键菜单打开、拖拽进行中时不折叠
- **布局模式**：挤压模式，标签栏占据空间，Viewport 宽度随 flex 自动调整

#### 标签项行为

- **active tab**：左侧 3px accent 色竖线指示器（`var(--accent-color)`），背景高亮
- **hover**：背景变 `var(--bg-tab-hover)`
- **拖拽**：HTML5 DnD，垂直方向视觉反馈，共用 `reorderTabs` IPC
- **右键菜单**：复用现有 `DropdownMenu`（reload/duplicate/pin/mute/close 等）
- **悬停缩略图**：300ms 延迟 → Popover 在标签栏右侧弹出（`placement: 'end-start'`）
- **固定标签**：排序在最前，favicon 居中显示，展开时不显示 close btn

#### 缩略图 Popover 方向差异

| 模式 | Popover 锚点 | placement |
|------|-------------|-----------|
| 水平 (TabBar) | 标签底部下方 | `bottom-start` |
| 垂直 (VerticalTabBar) | 标签右侧 | `end-start` |

### 与现有组件的差异对比

| 逻辑 | TabBar (水平) | VerticalTabBar (垂直) |
|------|--------------|----------------------|
| 拖拽视觉 | 水平方向 | 垂直方向 |
| 缩略图 Popover 方向 | 下方弹出 | 右侧弹出 |
| 折叠/展开 | 无 | 自动折叠逻辑 |
| Tab 宽度 | 动态均分（min 30px, max 240px） | 固定宽度（220px / 48px） |
| 窗口控制按钮 | 右侧（非 macOS） | 移到地址栏右侧 |
| SVG 角填充 | active tab 底部圆角过渡到 AddressBar | 不需要 |
| Tab 高度 | 固定 28px | 固定 32px（垂直空间更宽裕） |

## 设置页

在设置页「外观」分区新增「标签栏位置」选项：

```
标签栏位置
┌─────────────────────────────────┐
│  ┌─[示意图: 水平标签栏布局]──┐  │
│  │  [=Tab1][=Tab2][=Tab3]    │  │
│  │  [AddressBar            ] │  │
│  │  [                      ] │  │
│  │  [     Web Content      ] │  │
│  │  [                      ] │  │
│  └───────────────────────────┘  │
│  ( ) 顶部                       │
│                                 │
│  ┌─[示意图: 垂直标签栏布局]──┐  │
│  │ ┌──┐[AddressBar         ] │  │
│  │ │T1│[                    ] │  │
│  │ │T2│[    Web Content     ] │  │
│  │ │T3│[                    ] │  │
│  │ └──┘[                    ] │  │
│  └───────────────────────────┘  │
│  ( ) 左侧                       │
└─────────────────────────────────┘
```

使用 `NRadioGroup` + 自定义卡片样式，每项包含：
- **示意图**：用 CSS/HTML 绘制的简化布局线框图（非图片），展示标签栏位置与网页内容的相对关系
- **标签文字**：「顶部」/「左侧」
- **说明文字**：简短描述该模式的特点

切换即时生效。

## CSS 变量

新增垂直标签栏专用 CSS 变量（在 `style.css` 的 `:root` 和 `[data-theme="dark"]` 中定义）：

```css
/* 垂直标签栏 */
--vtab-width-expanded: 220px;   /* 展开宽度 */
--vtab-width-collapsed: 48px;   /* 折叠宽度 */
--vtab-bg: var(--tabbar-bg);    /* 背景色，复用水平标签栏背景 */
--vtab-item-active-bg: var(--bg-tab-hover); /* active 标签背景 */
--vtab-indicator-width: 3px;    /* active 指示器宽度 */
```

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `apps/renderer/src/composables/useTabList.ts` | 新建 | 共享 tab 数据/事件逻辑 |
| `apps/renderer/src/components/VerticalTabBar.vue` | 新建 | 垂直标签栏组件 |
| `apps/renderer/src/components/ChromeUI.vue` | 修改 | 添加 v-if 布局切换 + vertical 模式 CSS |
| `apps/renderer/src/components/TabBar.vue` | 修改 | 迁移共享逻辑到 useTabList |
| `apps/main/src/settings-manager.ts` | 修改 | 新增 tabBarPosition 字段 |
| `packages/ipc-contract/src/channels.ts` | 修改 | SettingsSchema 新增 tabBarPosition |
| `apps/renderer/src/views/SettingsView.vue` | 修改 | 新增标签栏位置选项 |
| `apps/renderer/src/style.css` | 修改 | 新增垂直标签栏 CSS 变量 |
| `packages/shared/src/i18n/messages.ts` | 修改 | 新增 i18n key |

## 测试

- E2E：切换标签栏位置，验证标签创建/关闭/激活/拖拽在两种模式下均正常
- E2E：垂直模式下自动折叠/展开行为
- E2E：垂直模式下悬停缩略图弹出方向
- 单元：useTabList composable 的数据同步逻辑
