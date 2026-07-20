# Workspace（工作区）设计文档

> Arc 浏览器风格的 Space 功能：同窗口内切换不同标签集合，每个 Space 拥有独立的标签、书签和会话上下文。

## 目标

在同一个浏览器窗口内支持多个「工作区」（Space），每个 Space 是一个独立的浏览上下文，包含：

- 独立的标签页集合
- 独立的书签
- 独立的 Cookie / 缓存 / localStorage（通过 Electron session partition 隔离）

切换 Space 时，当前 Space 的标签隐藏，目标 Space 的标签显示，无需打开新窗口。

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 隔离方式 | 独立 Electron session partition | 真正的 Cookie/缓存/localStorage 隔离，最接近 Arc |
| 切换方式 | 同窗口隐藏/显示标签视图 | 符合用户选择，单窗口体验 |
| 历史记录 | 全局共享 | 浏览日志是全局的，不需要按 Space 隔离 |
| 书签 | 按 Space 隔离 + 可切换查看全部 | 每个 Space 有自己的书签，但提供全局视图 |
| UI 入口 | 标签栏左侧图标 + Popover 弹出面板 | 不占常驻空间，复用现有 Popover 系统 |
| 数据库存储 | SQLite workspace 表 + bookmark 表新增 workspace_id 列 | 与现有 DatabaseManager 一致 |

## 数据模型

### 新增 SQLite 表 `workspace`

```sql
CREATE TABLE IF NOT EXISTS workspace (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#636e72',
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PRIMARY KEY | UUID |
| `name` | TEXT NOT NULL | 显示名（如「工作」「私人」） |
| `color` | TEXT NOT NULL | 主题色 hex（如 `#ff6b6b`） |
| `position` | INTEGER NOT NULL | 排序序号（0-based） |
| `created_at` | INTEGER | 创建时间戳 |
| `updated_at` | INTEGER | 更新时间戳 |

### Session 分区映射

- 每个 workspace 的 Electron session partition = `persist:space-{workspaceId}`
- 默认/初始 workspace（第一个）partition = `persist:default`（向后兼容）
- 无痕模式不参与 workspace，保持现有 `incognito` 逻辑不变

### bookmark 表改动

```sql
ALTER TABLE bookmark ADD COLUMN workspace_id TEXT;
```

- `workspace_id` 为 NULL 时属于默认 workspace
- 全局书签视图：`SELECT * FROM bookmark`（不过滤 workspace_id）
- Space 书签视图：`WHERE workspace_id = ? OR workspace_id IS NULL`（含默认）

### 标签状态持久化

标签状态从 SettingsManager（electron-store `openTabs`/`activeTabIndex`）迁移到 SQLite：

- 新增 `workspace_tabs` 表（或复用 JSON 字段）存储每个 workspace 的标签 URL 列表和活跃索引
- TabManager.destroy() 时写入当前 workspace 的标签状态到 DB（而非 electron-store）
- 启动时根据当前 workspace 从 DB 恢复标签

### 向后兼容

升级时（由 `WorkspaceManager` 初始化时执行）：

1. 创建 `workspace` 表（如不存在）
2. 检查是否有 workspace 记录；若无，创建「默认」workspace（id='default'，partition='persist:default'）
3. 将现有 `openTabs`（SettingsManager electron-store）数据写入默认 workspace 的标签状态
4. 将现有书签的 `workspace_id` 设为 NULL（属于默认 workspace）
5. session partition 保持 `persist:default` 不变
6. 迁移完成后，后续启动不再读取 electron-store 的 openTabs

## 主进程架构

### WorkspaceManager（新模块）

**职责：** workspace CRUD + 切换逻辑 + 标签状态持久化

**位置：** `apps/main/src/workspace-manager.ts`

**依赖：** DatabaseManager、SessionManager、TabManager

```ts
class WorkspaceManager {
  /** 列出所有 workspace（按 position 排序） */
  list(): Workspace[]

  /** 创建新 workspace，自动分配 position */
  create(name: string, color: string): Workspace

  /** 更新 workspace 属性 */
  update(id: string, patch: { name?: string; color?: string; position?: number }): Workspace

  /** 删除 workspace：关闭标签、清理 session partition。删除活跃 workspace 时自动切换到列表中第一个 workspace。 */
  delete(id: string): void

  /** 切换到目标 workspace（核心方法） */
  switchTo(id: string): void

  /** 保存当前 workspace 的标签状态到 DB */
  saveTabs(workspaceId: string): void

  /** 从 DB 恢复标签到 TabManager */
  restoreTabs(workspaceId: string): void

  /** 获取当前活跃 workspace */
  getActive(): Workspace | null
}
```

### TabManager 改动

TabManager 不变接口签名，内部增加 workspace 维度：

- 构造函数新增可选参数 `workspaceId?: string`（默认 'default'）
- 新增私有字段 `workspaceId: string`，标识当前管理的 workspace
- `create()` / `close()` / `serializeTabs()` / `restoreTabs()` 内部自动关联当前 workspaceId
- 标签状态持久化从 SettingsManager（electron-store）迁移到 SQLite

### 切换流程 `switchTo(workspaceId)`

1. `saveTabs(currentWorkspaceId)` — 把当前 workspace 的标签状态写入 DB
2. 隐藏当前 workspace 所有标签视图（`setVisible(false)`）
3. 从 DB 读取目标 workspace 的标签状态
4. `restoreTabs(targetWorkspaceId)` — 在 TabManager 中重建目标标签
5. 显示目标标签视图
6. 通过 `webContents.send('workspace:switched', workspace)` 广播事件给渲染进程
7. 书签 sidebar 切换过滤

> 注意：`workspace:switched` 是主进程→渲染进程的单向推送事件（`webContents.send`），不是 IPC handle/invoke 通道。

### 多窗口

- 每个窗口独立管理自己的 workspace 状态
- 切换 workspace 是窗口级操作，不影响其他窗口
- 同一个 workspace 可以在多个窗口打开（各自有独立 TabManager 实例）

## IPC 通道

### 新增通道

在 `IpcContract` 中新增：

```ts
'workspace:list': () => Workspace[]
'workspace:create': (name: string, color: string) => Workspace
'workspace:update': (id: string, patch: { name?: string; color?: string; position?: number }) => Workspace
'workspace:delete': (id: string) => void
'workspace:switchTo': (id: string) => void
'workspace:getActive': () => Workspace | null
'workspace:reorder': (ids: string[]) => void
```

### 新增类型

```ts
interface Workspace {
  id: string
  name: string
  color: string
  position: number
  tabCount: number  // 实时计算，非持久化
  createdAt: number
  updatedAt: number
}
```

### PopoverType 扩展

在 `PopoverType` 联合类型中新增 `'workspace'`：

```ts
export type PopoverType =
  | 'menu'
  | 'addressbar'
  | 'find'
  | 'downloads'
  | 'bookmark-folder'
  | 'tab-thumbnail'
  | 'command-palette'
  | 'workspace'  // 新增
```

## 渲染进程 UI

### TabBar Workspace 按钮

按钮位置根据 `tabBarPosition` 设置自适应：

| 模式 | 按钮位置 | 面板锚点 |
|------|----------|----------|
| 水平标签栏（`top`） | 标签栏最左侧，固定 32px 宽 | 按钮下方（`bottom-start`） |
| 垂直标签栏（`left`） | 标签栏最顶部（`.vtab-list` 上方），固定 32px 高 | 按钮右侧（`right-start`） |

**样式：** 当前 workspace 主题色圆角方块，显示名称首字（如「工」），hover 显示完整名称 tooltip

**交互：** 点击弹出 WorkspacePanel（通过 `Popover` 组件，type='workspace'）

**无 workspace 时：** 不显示按钮（backward compatible，首次使用时引导创建）

### WorkspacePanel 面板

通过 Popover 系统渲染，复用现有 `Popover` 类：

```ts
new Popover({
  type: 'workspace',
  anchor: { type: 'rect', rect: buttonRect },
  data: { workspaces: list, activeId: current.id },
  onEvent: (eventName, eventData) => { /* 处理切换/新建/编辑/删除 */ },
  onDismiss: () => { /* 清理 */ },
})
```

**面板内容：**

- 宽度 240px
- 顶部：当前 workspace 名称 + 颜色指示
- 列表：每个 workspace 项 = 彩色圆点 + 名称 + 标签数量 + 右侧小菜单（编辑/删除）
- 底部：「+ 新建 Space」按钮
- 编辑：点击名称进入 inline 编辑，点击颜色圆点弹出颜色选择器
- 删除：确认弹窗，删除后标签全部关闭
- 拖拽排序：列表项可拖拽调整顺序

**颜色预设（11 色）：**

```ts
const WORKSPACE_COLORS = [
  '#ff6b6b', // 红
  '#ff9f43', // 橙
  '#feca57', // 黄
  '#48dbfb', // 蓝
  '#4ecdc4', // 青
  '#45b7d1', // 天蓝
  '#6c5ce7', // 紫
  '#a29bfe', // 淡紫
  '#fd79a8', // 粉
  '#00b894', // 绿
  '#636e72', // 灰
]
```

### Sidebar 书签过滤

- 书签侧边栏：显示当前 workspace 的书签 + 「所有书签」切换开关
- 历史侧边栏：全局历史不变
- 书签栏（地址栏下方常驻）：跟随当前 workspace 过滤

### 新标签页

- 切换 workspace 后，Cmd+T 新建标签走当前 workspace 的 session partition
- Quick Links 按 workspace 隔离

### 命令面板

在 `CommandPalettePanel` 中新增命令类别：

- 「切换到 XXX」— 列出所有 workspace，点击切换
- 「新建 workspace」— 创建新 workspace
- 「管理工作区」— 打开 WorkspacePanel

## 文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `apps/main/src/workspace-manager.ts` | 主进程 WorkspaceManager |
| `apps/renderer/src/panel/WorkspacePanel.vue` | Popover 面板组件 |
| `packages/shared/src/database/workspace-repository.ts` | SQLite workspace 仓库 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `packages/shared/src/database/schema.sql` | 新增 workspace 表 + bookmark.workspace_id 列 |
| `packages/shared/src/database/index.ts` | 导出 WorkspaceRepository |
| `packages/ipc-contract/src/channels.ts` | 新增 workspace 通道 + Workspace 类型 + PopoverType 扩展 |
| `apps/main/src/index.ts` | 注册 workspace IPC handler |
| `apps/main/src/tab-manager.ts` | 新增 workspaceId 字段，serializeTabs/restoreTabs 关联 workspace |
| `apps/main/src/window-manager.ts` | 创建 WorkspaceManager 实例，注入 TabManager |
| `apps/renderer/src/panel/PanelRoot.vue` | 新增 WorkspacePanel 分支 |
| `apps/renderer/src/components/TabBar.vue` | 新增 workspace 按钮 |
| `apps/renderer/src/preload.ts` | 暴露 workspace IPC 方法 |
| `apps/renderer/src/components/BookmarkSidebar.vue` | 书签按 workspace 过滤 |
| `apps/renderer/src/components/BookmarkBar.vue` | 书签栏按 workspace 过滤 |
