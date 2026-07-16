# 设计文档：书签栏常驻（BookmarkBar）

> 日期：2026-07-16
> 状态：已评审，待实现
> 关联 Roadmap：Phase 3.5 — 浏览器可用性补全 / 书签栏常驻

## 目标

在浏览器外壳实现一条常驻书签栏（对齐 Chrome），位于地址栏下方、视口上方，展示顶层书签与文件夹，支持点击打开、文件夹下拉、右键菜单、跨窗口精确拖拽排序与分类，并可通过三点菜单与设置项控制显隐与打开方式。

### 范围（来自澄清）

- 书签栏展示**顶层**节点（`parentId = null`）；文件夹点击/悬停下拉展示子项。
- 三点菜单新增「书签」二级菜单：互斥的「显示书签栏 / 隐藏书签栏」+「所有书签」（跳转 BookmarkView）。
- 书签管理页（BookmarkView）改为**两层分类**交互（顶层 + 文件夹），支持手动归类与拖拽；**HTML 导入拍平问题不动**。
- 共享状态：`useBookmarks` 单例 + main→renderer `bookmarks:changed` 广播，彻底解决跨组件同步。
- 新增设置项 `openBookmarkInNewTab`（当前页 / 新标签页打开书签栏书签）。
- 拖拽采用**精确放置**（方案 X）：拖入文件夹下拉可放到指定位置，主进程中转 dragId。
- 右键菜单与文件夹下拉**必须使用主进程级 popover（`popover.ts`）**，不能用 `NDropdown`/`NPopover`（会被 WebContentsView 遮挡）。
- 显隐状态 `showBookmarkBar` 存 `SettingsManager`（持久化，不进设置 UI）。

### 非目标（YAGNI）

- 不修复 `importHTML` 的层级解析（导入书签仍拍平到顶层）。
- 书签栏不做搜索框、不做「其它书签」根目录树。
- 不做书签同步/账号。

---

## 架构概览

```
renderer (ChromeUI)
  └─ BookmarkBar.vue
       ├─ 读取 useBookmarks() 顶层列表（本地建树）
       ├─ 点击/右键/拖拽 → browserAPI.*
       └─ 悬停文件夹 → 主进程 openBookmarkFolderPopover(folderId)

主进程
  ├─ BookmarkManager.move(id, parentId, position)   // 新增
  ├─ IPC: bookmark:move / bookmark:drag-start / bookmark:drag-drop
  ├─ 广播: bookmarks:changed  (add/delete/rename/import/move 末尾)
  ├─ dragState: currentDragBookmark  (内存暂存)
  └─ popover.ts: 渲染文件夹下拉 + 右键菜单（独立窗口，不被遮挡）
        └─ 下拉面板内部 DnD 放置区 → IPC bookmark:drag-drop

renderer (BookmarkView)
  └─ 复用 useBookmarks.moveBookmark 实现两层拖拽分类
```

---

## 第 1 节：数据层与 IPC 变更

### 1.1 `BookmarkManager.move`（新增，`apps/main/src/bookmark-manager.ts`）

```ts
move(id: string, newParentId: string | null, newPosition: number): void
```

- 校验：`newParentId` 不能是 `id` 自身，也不能是 `id` 的子孙（防循环）——通过 `repo` 查询后代。
- 将目标节点 `parent_id` 更新为 `newParentId`。
- 对 `newParentId` 下所有兄弟按 `position` 重排：把目标插入到 `newPosition`，其余顺移（复用 `create` 的 `position = max+1` 思路并做整体 compact）。

### 1.2 新增 IPC（`apps/main/src/ipc/register.ts`）

| Channel | 模式 | 作用 |
|---------|------|------|
| `bookmark:move` | handle | `{id, parentId, position}` → `BookmarkManager.move` |
| `bookmark:drag-start` | handle | `{id}` → `dragState.setDragBookmark(id)` |
| `bookmark:drag-drop` | handle | `{targetParentId, targetPosition}` → 读 `dragState.getDragBookmark()` 取 id → `move` → 清 dragState → 广播 |

预加载（`apps/main/src/preload.ts`）新增：`moveBookmark`、`onBookmarksChanged`、`dragBookmarkStart`、`dragBookmarkDrop`。

### 1.3 `bookmarks:changed` 广播（仿 `theme:change`）

在 `bookmark:add` / `delete` / `rename` / `import` / `move` 各 handler 末尾，向所有 webContents `send('bookmarks:changed')`（含主窗口与 popover 窗口）。`preload.ts` 增加 `onBookmarksChanged(cb)` → `ipcRenderer.on('bookmarks:changed', ...)`。

### 1.4 `useBookmarks` composable（新增，`apps/renderer/src/composables/useBookmarks.ts`）

模块级单例模式（仿 `useTheme.ts`）：

```ts
const bookmarks = ref<BookmarkItemDto[]>([])   // 全量节点
const byParent = computed(() => buildIndex(bookmarks.value)) // parentId -> 子节点[]

export function useBookmarks() {
  async function load() { bookmarks.value = await getBookmarks() }       // 拉全量
  async function reload() { await load() }                              // 响应 bookmarks:changed
  async function moveBookmark(id, parentId, position) { await moveBookmark(id, parentId, position) }
  // 启动 load() 一次；onBookmarksChanged(reload) 注册一次（模块级）
  return { bookmarks, byParent, load, reload, moveBookmark }
}
```

- 书签栏只渲染 `byParent.value.get(null)`（顶层），文件夹展开时取 `byParent.value.get(folderId)`。
- **拉全量本地建树**（非展开时按需拉），避免下拉异步闪烁、便于拖拽即时更新。

---

## 第 2 节：书签栏组件（BookmarkBar.vue）

### 2.1 接入点

`apps/renderer/src/components/ChromeUI.vue` 的 `.chrome-content` 中，`<AddressBar>` 之后、`<Viewport>` 之前插入：

```html
<BookmarkBar v-if="showBookmarkBar" />
```

`showBookmarkBar` 读 `getSetting('showBookmarkBar')`，由三点菜单写入。

### 2.2 渲染

- 横向 flex 列表，高度约 36px，底部细分割线，跟随 CSS 变量主题（浅/深）。
- 每项：favicon（`url` 非空）+ 标题；文件夹用文件夹图标（`ic:round-folder`）。
- 超出宽度显示「»」溢出菜单（用 popover 渲染剩余项）。

### 2.3 交互

- **点击书签**：按 `getSetting('openBookmarkInNewTab')` 决定 `createTab({url, active: !openInNewTab})`（当前页）或新标签页打开。
- **点击文件夹**：主进程 `openBookmarkFolderPopover(folderId)` 打开下拉（popover 渲染，见第 3 节）。
- **右键书签**：popover 渲染菜单 → 「新标签页打开」「删除」（`bookmark:delete` → 广播）。
- **拖拽**：见第 3 节。

---

## 第 3 节：跨窗口精确拖拽（方案 X）

HTML5 DnD 不能跨渲染进程/窗口传递，故由主进程中转 dragId。

### 3.1 主进程拖拽上下文（`dragState`，可并入 popover.ts 或独立 `drag-state.ts`）

内存变量 `currentDragBookmark: { id: string } | null` + `set/get/clear`。

### 3.2 外壳 BookmarkBar

- 项 `draggable=true`；`dragstart` → `dragBookmarkStart(id)`（主进程暂存）+ 记录本地 `dragId`。
- `dragover` 在文件夹项上 `dragenter` 后 ~300ms → 调 `openBookmarkFolderPopover(folderId, { dragMode: true })`（精确拖放模式，面板内启用放置区）。
- 栏内 `drop` 在两项之间 → 计算 `position` → `moveBookmark({id, parentId: null, position})`。
- 拖到文件夹项本身（未进下拉）→ 归该文件夹末尾（`parentId = folderId`）。

### 3.3 文件夹下拉 popover 面板（独立网页）

- 渲染 `byParent.value.get(folderId)` 子项列表，每项 + 文件夹项均为 **drop 放置区**。
- 内部 `dragover` 判定插入位置（每项上下半区 before/after）；`drop` → `dragBookmarkDrop({targetParentId, targetPosition})`。
- 主进程 `bookmark:drag-drop` 取 `currentDragBookmark.id` → `move` → 清 dragState → 广播。
- 文件夹拖入另一文件夹（成为子文件夹）：下拉内文件夹项也是放置区，`targetParentId = 该文件夹 id`。

### 3.4 落点位置计算

「两项之间插入」模型：每个子项上下半区判定 before/after，换算成 `position` 序号；`move()` 内部对兄弟重排。

### 3.5 防泄漏

`dragend` → `bookmark:drag-end`（清 dragState）；popover 关闭时也清。

---

## 第 4 节：三点菜单 + 设置项 + BookmarkView

### 4.1 三点菜单（AppMenuButton.vue）

- 新增「书签」二级菜单（用 popover 渲染，避免被 WebContentsView 遮挡）。
- 子项（互斥）：
  - 「显示书签栏」——当 `showBookmarkBar === false` 显示 → `setSetting('showBookmarkBar', true)`
  - 「隐藏书签栏」——当 `showBookmarkBar === true` 显示 → `setSetting('showBookmarkBar', false)`
  - 「所有书签」——打开 BookmarkView（现有书签管理路由）

### 4.2 设置项 `openBookmarkInNewTab`

- `apps/main/src/settings-manager.ts`：`SettingsSchema` + `defaultSettings`（默认 `false`）+ `validateValue` 加 `validateBoolean` 分支。
- `packages/ipc-contract/src/channels.ts`：`SettingsSnapshot` 加 `openBookmarkInNewTab: boolean`。
- UI：`apps/renderer/src/views/settings/GeneralView.vue`，仿 `openInNewTab` 的 `<SettingsItem>` + `<NSwitch>`，读 `getSetting`、写 `setSetting`。
- i18n：`settings.openBookmarkInNewTab`。

### 4.3 BookmarkView 两层分类（仅交互层）

- 保留现有树形展示（`buildTree`），增强：
  - 拖拽书签到文件夹 / 文件夹到文件夹 → 复用 `useBookmarks.moveBookmark`（打通主进程 `bookmark:move`）。
  - 「新建文件夹」按钮、「移动到文件夹」右键项。
  - 不分类书签自然落顶层（`parentId = null`）。
- `importHTML` 拍平逻辑**不动**。

### 4.4 i18n 新增 key

`settings.openBookmarkInNewTab`、`menu.showBookmarkBar` / `menu.hideBookmarkBar` / `menu.allBookmarks`、`bookmark.newFolder` 等，补 zh-CN / en-US。

---

## 第 5 节：错误处理、测试、文件清单

### 5.1 错误处理

- `move` 祖先循环防护：目标为自身或子孙时拒绝并提示。
- 拖拽上下文泄漏：`dragend` / popover 关闭必清 `dragState`。
- 打开文件夹下拉时该书签已删：空列表优雅展示。

### 5.2 测试

- 单元（Vitest）：`BookmarkManager.move` 的 `position` 重排 + 循环防护。
- E2E（Playwright）：开启书签栏 → 点击打开 → 右键删除 → 拖拽排序 → 文件夹下拉打开子项 → 三点菜单显隐切换 → `openBookmarkInNewTab` 生效。
- IPC 契约：`channels.ts` 补 `bookmark:move` / `bookmark:drag-start` / `bookmark:drag-drop` / `bookmarks:changed` 类型。

### 5.3 涉及文件

**新增**
- `apps/renderer/src/components/BookmarkBar.vue`
- `apps/renderer/src/composables/useBookmarks.ts`
- `apps/main/src/drag-state.ts`（或并入 popover.ts）

**改 main**
- `bookmark-manager.ts`（+move）
- `ipc/register.ts`（+3 handler + 广播）
- `preload.ts`（+onBookmarksChanged / moveBookmark / drag*）
- `settings-manager.ts`（+2 键）
- `channels.ts`（+类型）

**改 renderer**
- `ChromeUI.vue`（插入 BookmarkBar）
- `AppMenuButton.vue`（二级菜单 + popover）
- `BookmarkView.vue`（两层拖拽）
- `GeneralView.vue`（+开关）
- `i18n/messages.ts`（+key）

**改 shared**
- i18n messages

---

## 验收标准

1. 三点菜单可显示/隐藏书签栏，状态重启保留。
2. 书签栏展示顶层书签与文件夹，favicon/图标正确。
3. 点击书签按 `openBookmarkInNewTab` 决定当前页/新标签打开。
4. 文件夹点击弹出下拉（popover，不被遮挡），子项可点击/新标签打开。
5. 右键书签：新标签页打开、删除可用。
6. 拖拽：书签间排序、拖入文件夹成子项、文件夹拖入文件夹成子文件夹、拖入下拉指定位置——均生效且实时刷新。
7. BookmarkView 可手动建立两层分类、拖拽归类，与书签栏状态同步。
8. 所有书签增删改后，书签栏与 BookmarkView 通过广播自动刷新，无状态分裂。
