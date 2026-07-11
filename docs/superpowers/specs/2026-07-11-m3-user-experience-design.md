# M3 — 用户体验增强 Design Spec

> Date: 2026-07-11
> Status: DRAFT

## Goal

补全日常浏览器体验中高频但缺失的功能，让 WMFX 从"能用的浏览器"变成"好用的浏览器"。

## 5 个功能及优先级

| # | 功能 | 理由 | 预估复杂度 |
|---|------|------|-----------|
| 1 | New Tab Page | 打开空白页体验差，最大痛点 | 中 |
| 2 | Find in Page UI | 快捷键已有但缺 UI | 中 |
| 3 | 地址栏智能补全 | 历史 + 书签搜索建议，高频 | 中高 |
| 4 | 书签操作（地址栏星标 + 右键） | 用户日常高频操作 | 低中 |
| 5 | 标签拖拽排序 | 提升多标签使用体验 | 中 |

---

## Feature 1: New Tab Page

### Problem
当前新标签页直接加载 Google，用户没有自己的首页体验，缺乏快捷入口。

### Design

**NewTab 组件** (`apps/renderer/src/views/NewTab.vue`)

核心元素：
- 顶部：搜索框（居中大输入框），聚焦后显示搜索引擎选择（Google/Baidu/Bing，可配置）
- 中部：快捷网站网格（可拖拽添加/删除/编辑，最多 16 个，存储到 SettingsManager）
- 底部：最近访问历史（Top 5，来自 HistoryManager）

**IPC 通道：**
- `settings:newTabQuickLinks` → 获取/设置快捷网站列表
- `history:getRecent` → 获取最近访问

**SettingsManager 新增字段：**
- `quickLinks`: Array<{ id, title, url }>

**交互细节：**
- 搜索框输入时显示下拉建议（地址栏补全功能，见 Feature 3）
- 快捷网站：点击直接在新标签页打开，长按/右键弹出编辑/删除菜单
- 最近访问：点击在新标签页打开

**文件：**
- Create: `apps/renderer/src/views/NewTab.vue`
- Modify: `apps/main/src/index.ts`（新标签创建时加载 NewTab）
- Modify: `apps/main/src/tab-manager.ts`（新标签创建时默认加载 NewTab）
- Modify: `apps/main/src/settings-manager.ts`（quickLinks 字段）
- Modify: `apps/main/src/ipc/register.ts`（新通道 handlers）
- Modify: `packages/ipc-contract/src/channels.ts`
- Modify: `apps/main/src/preload.ts`
- Modify: `apps/renderer/src/env.d.ts`
- Modify: `ChromeUI.vue`（新标签时渲染 NewTab 而非 Viewport）

---

## Feature 2: Find in Page UI

### Problem
F12/Cmd+F 快捷键已有，但页面上没有任何 UI 提示搜索结果或操作控制。

### Design

**FindBar 组件** (`apps/renderer/src/components/FindBar.vue`)

显示位置：从地址栏下方滑出，与地址栏右侧对齐（类似 Chrome 行为）。FindBar 是一个固定宽度的浮动条（约 320px），绝对定位在 ChromeUI 容器中，right: 8px，从 AddressBar 底部向下弹出。

核心元素：
- 搜索输入框（左侧）
- 显示 "匹配数 X/Y" 计数器（中间）
- 上/下翻页按钮（右侧）
- 大小写敏感选项
- 关闭按钮

**IPC 通道：**
- `page:startFind` / `page:endFind` / `page:findNext` / `page:findPrevious` — 但实际 `webContents.findInPage()` API 返回匹配信息，需要主进程透传

**实现方式：**
- 渲染进程调用 `webContents.findInPage` 通过 IPC
- 主进程接收 `found-in-page` 事件后广播给渲染进程
- FindBar 根据匹配数更新显示

**文件：**
- Create: `apps/renderer/src/components/FindBar.vue`
- Modify: `ChromeUI.vue`（挂载 FindBar，absolute 定位，right: 8px）
- Modify: `apps/main/src/ipc/register.ts`（find 相关 handlers）
- Modify: `packages/ipc-contract/src/channels.ts`
- Modify: `apps/main/src/preload.ts`
- Modify: `apps/renderer/src/env.d.ts`

**交互细节：**
- 用户按 Ctrl+F / Cmd+F 触发（已有快捷键，但当前无效果）
- 显示 FindBar（从 AddressBar 下方滑出，右对齐），聚焦搜索框
- 输入后实时搜索，显示匹配数
- 点击上/下按钮翻页
- 按 Esc 或关闭按钮关闭 FindBar，调用 `endFind`

---

## Feature 3: 地址栏智能补全

### Problem
地址栏只支持 URL 输入和回车跳转，没有搜索建议或历史补全。

### Design

**Autocomplete 下拉组件** (`apps/renderer/src/components/Autocomplete.vue`)

显示位置：地址栏下方，绝对定位。

核心元素：
- 最多显示 6 条建议
- 每条建议包含：标题（或 URL）、URL、类型图标（历史/书签/搜索）
- 键盘上下选择，Enter 跳转，Esc 关闭
- 鼠标悬停高亮，点击跳转

**补全来源：**
1. **历史记录** — 按访问频率排序，匹配用户输入
2. **书签** — 匹配标题或 URL
3. **搜索引擎查询** — 当输入不符合 URL 格式时，显示搜索引擎建议（如 "google search: [用户输入]"）

**IPC 通道：**
- `autocomplete:suggestions` — 传入 query，返回建议列表

**实现方式：**
- 用户输入时防抖（200ms）发送 IPC 请求
- 主进程同时查询 HistoryManager 和 BookmarkManager
- 合并结果，排序后返回

**文件：**
- Create: `apps/renderer/src/components/Autocomplete.vue`
- Modify: `AddressBar.vue`（集成 Autocomplete）
- Modify: `apps/main/src/ipc/register.ts`
- Modify: `packages/ipc-contract/src/channels.ts`
- Modify: `apps/main/src/preload.ts`
- Modify: `apps/renderer/src/env.d.ts`

---

## Feature 4: 书签操作

### Problem
书签只能从侧边栏添加/管理，日常浏览时没有快捷方式收藏当前页面。

### Design

**地址栏书签星标按钮：**
- 在地址栏 URL 输入框右侧添加一个星标按钮
- 当前页面已收藏时显示填充星标（黄色），未收藏时显示空心星标
- 点击切换收藏状态

**右键菜单"添加书签"：**
- 在网页内容区域右键时，菜单第一项为"添加书签"
- 点击后使用当前 URL + 页面标题创建书签

**IPC 通道：**
- `bookmark:isBookmarked` — 传入 URL，返回是否已收藏
- 现有 `bookmark:add` / `bookmark:delete` 已支持

**文件：**
- Modify: `AddressBar.vue`（添加星标按钮）
- Modify: `apps/main/src/ipc/register.ts`
- Modify: `packages/ipc-contract/src/channels.ts`
- Modify: `apps/main/src/preload.ts`
- Modify: `apps/renderer/src/env.d.ts`

---

## Feature 5: 标签拖拽排序

### Problem
标签页顺序固定，无法重新排列。

### Design

**TabBar 拖拽支持：**
- 使用 HTML5 Drag and Drop API
- 拖拽标签时显示拖拽中的视觉反馈（半透明、缩略图）
- 拖到目标位置时显示插入指示线
- 松手后更新 TabManager 中的标签顺序
- 标签顺序持久化到 SettingsManager（重启后恢复）

**IPC 通道：**
- `tab:reorder` — 传入新的标签 ID 顺序

**实现细节：**
- TabBar.vue 添加 `@dragstart` / `@dragover` / `@drop` 事件
- 拖拽时禁用 TabManager 的 create/remove 事件，避免冲突
- 主进程 `TabManager.reorder(ids: string[])` 方法更新标签顺序和 BrowserView 布局
- 顺序存到 SettingsManager 的 `tabOrder` 字段

**文件：**
- Modify: `TabBar.vue`（拖拽支持）
- Modify: `apps/main/src/tab-manager.ts`（reorder 方法）
- Modify: `apps/main/src/settings-manager.ts`（tabOrder 字段）
- Modify: `apps/main/src/ipc/register.ts`
- Modify: `packages/ipc-contract/src/channels.ts`
- Modify: `apps/main/src/preload.ts`
- Modify: `apps/renderer/src/env.d.ts`

---

## Architecture Overview

```
New Tab Page → SettingsManager.quickLinks + HistoryManager.getRecent
Find in Page → webContents.findInPage() + found-in-page event
Autocomplete → HistoryManager.search + BookmarkManager.search
Bookmark Star → BookmarkManager.isBookmarked + add/delete
Tab Reorder  → TabManager.reorder() + SettingsManager.tabOrder
```

所有 IPC 通道遵循现有模式：
- 渲染进程通过 `browserAPI.*` 调用
- 主进程通过 `getInstance()` 获取当前窗口 Manager
- 类型定义在 `packages/ipc-contract` 中

## Dependencies

- Feature 1 依赖 Feature 3（搜索建议可复用）
- Feature 4 依赖 Feature 3（地址栏改动能协同）
- Feature 5 独立，可并行开发

## Testing

- 每个 Feature 完成后运行 `bun run lint` 验证
- E2E 测试更新：New Tab 可见性、Find Bar 交互、Autocomplete 显示、书签星标、标签拖拽
