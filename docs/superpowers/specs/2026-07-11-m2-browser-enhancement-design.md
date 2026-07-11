# M2 — 浏览增强（Phase 2）

> 状态：已定稿（待用户最终 review）
> 日期：2026-07-11
> 依赖：M1 基础浏览已完成

## 1. 目标

在 M1 基础上增加下载管理、历史记录、书签管理、隐身模式、打印/PDF/缩放、设置界面和浅/深色主题适配，让浏览器具备完整日常使用能力。

## 2. 范围

### 做
- **DownloadManager**：下载队列/暂停/续传/进度实时推送
- **HistoryManager**：SQLite 历史记录（增删改查/搜索）
- **BookmarkManager**：书签文件夹层级/搜索/导入导出 HTML
- **隐身模式**：TabBar UI 支持新建隐身标签页
- **打印/PDF/缩放**：页面打印、导出 PDF、缩放级别控制
- **SettingsManager + 设置界面**：全局设置 KV 存储 + SettingsView
- **浅色/深色主题适配**：CSS variables 两套配色，theme 设置驱动

### 不做（M3+）
- Mihomo 代理面板
- AI 功能

## 3. 模块设计

### 3.1 DownloadManager

**职责**：管理下载任务队列，支持暂停/续传/进度更新，SQLite 持久化。

**数据库表**：
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 下载 ID |
| url | TEXT | 下载地址 |
| filename | TEXT | 文件名 |
| path | TEXT | 保存路径 |
| state | TEXT | 'pending' / 'downloading' / 'paused' / 'completed' / 'cancelled' / 'error' |
| received_bytes | INTEGER | 已下载字节 |
| total_bytes | INTEGER | 总字节数 |
| created_at | INTEGER | 创建时间戳 |
| error_msg | TEXT | 错误信息 |

**IPC 通道**：
| 通道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `download:create` | invoke | `{ url, filename?, path? }` | `{ id: string }` |
| `download:pause` | invoke | `id: string` | void |
| `download:resume` | invoke | `id: string` | void |
| `download:cancel` | invoke | `id: string` | void |
| `download:get` | invoke | `id: string` | DownloadState |
| `download:getList` | invoke | `{ state?, limit?, offset? }` | DownloadState[] |
| `download:setPath` | invoke | `path: string` | void |

**广播**：`download:progress` — 实时推送 `{ id, state, receivedBytes, totalBytes }`

**渲染进程**：`apps/renderer/src/views/DownloadsView.vue` — 下载列表 + 操作按钮 + 进度条

### 3.2 HistoryManager

**职责**：管理浏览历史记录，SQLite 持久化，自动记录。

**数据库表**：
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 历史记录 ID |
| url | TEXT | 访问 URL |
| title | TEXT | 页面标题 |
| favicon | TEXT | 图标 URL |
| visit_time | INTEGER | 访问时间戳 |
| visit_count | INTEGER | 访问次数 |

**IPC 通道**：
| 通道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `history:add` | invoke | `{ url, title?, favicon? }` | void |
| `history:delete` | invoke | `id: string` | void |
| `history:search` | invoke | `{ query: string, limit?, offset? }` | HistoryItem[] |
| `history:getList` | invoke | `{ limit?, offset? }` | HistoryItem[] |
| `history:clear` | invoke | void | void |

**自动记录**：TabManager 的 `did-navigate` 事件触发 `history.add()`

**渲染进程**：`apps/renderer/src/views/HistoryView.vue` — 列表 + 搜索框 + 右键菜单（打开/删除）

### 3.3 BookmarkManager

**职责**：书签管理，支持文件夹层级、搜索、HTML 导入导出。

**数据库表**：
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 书签 ID |
| parent_id | TEXT | 父文件夹 ID（null 表示根目录） |
| title | TEXT | 标题 |
| url | TEXT | URL（null 表示文件夹） |
| favicon | TEXT | favicon URL |
| position | INTEGER | 排序位置 |
| created_at | INTEGER | 创建时间戳 |

**IPC 通道**：
| 通道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `bookmark:add` | invoke | `{ title, url, parentId? }` | `{ id: string }` |
| `bookmark:delete` | invoke | `id: string` | void |
| `bookmark:rename` | invoke | `{ id, title }` | void |
| `bookmark:getList` | invoke | `parentId?: string` | Bookmark[] |
| `bookmark:search` | invoke | `{ query: string }` | Bookmark[] |
| `bookmark:import` | invoke | `html: string` | void |
| `bookmark:export` | invoke | void | `{ html: string }` |

**渲染进程**：`apps/renderer/src/views/BookmarkView.vue` — 树形列表 + 搜索 + 右键菜单

### 3.4 隐身模式（Incognito）

**已有基础**：SessionManager 已有 `incognito` partition。

**新增**：
- TabManager `create` 支持 `sessionId: 'incognito'`
- TabState 增加 `isIncognito` 标识
- TabBar 右键菜单增加"新建隐身标签页"
- 隐身标签页视觉区分（深色图标/标题）

### 3.5 打印 / PDF / 缩放

**IPC 通道**：
| 通道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `page:print` | invoke | `tabId: string, options?` | void |
| `page:printToPDF` | invoke | `tabId: string, options?` | `{ path: string }` |
| `page:setZoom` | invoke | `{ tabId, factor }` | void |
| `page:getZoom` | invoke | `tabId: string` | `{ factor: number }` |

**渲染进程**：
- AddressBar 右侧增加打印/缩放按钮
- 右键菜单增加"打印"、"另存为 PDF"

### 3.6 SettingsManager + 设置界面

**职责**：全局设置 KV 存储（electron-store）。

**设置项**：
| 键 | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `theme` | `'light' \| 'dark' \| 'system'` | `'dark'` | 主题模式 |
| `downloadPath` | string | 默认下载目录 | 下载保存路径 |
| `defaultSearch` | `'google' \| 'baidu' \| 'bing'` | `'google'` | 默认搜索引擎 |
| `newTabUrl` | string | `'https://www.google.com'` | 新标签页 URL |
| `zoomFactor` | number | `1` | 默认缩放级别 |

**IPC 通道**：
| 通道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `settings:get` | invoke | `key: string` | any |
| `settings:set` | invoke | `{ key, value }` | void |
| `settings:getAll` | invoke | void | Record<string, any> |

**渲染进程**：`apps/renderer/src/views/SettingsView.vue` — 设置表单页面

### 3.7 浅色/深色主题适配

**CSS variables 方案**：
```css
/* 默认深色 */
:root {
  --bg-primary: #1e1e1e;
  --bg-secondary: #2d2d2d;
  --text-primary: #e0e0e0;
  --text-secondary: #888;
  --border-color: #1a1a1a;
  --accent-color: #4fc3f7;
  /* ... */
}

/* 浅色 */
[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --text-primary: #1a1a1a;
  --text-secondary: #666;
  --border-color: #e0e0e0;
  --accent-color: #1976d2;
  /* ... */
}
```

**主题切换**：
- `SettingsManager` `theme` 设置驱动
- `system` 模式监听 `window.matchMedia('prefers-color-scheme')`
- 切换时设置 `document.documentElement.dataset.theme`（浏览器 UI）
- **标签页主题**：通过 `nativeTheme.themeSource = 'dark' | 'light'` 设置 Chromium 原生主题，触发所有标签页的 `prefers-color-scheme` 媒体查询变化，支持该查询的第三方网站自动跟随
- **标签页背景色**：同步更新 `webContents.setBackgroundColor()`，使不支持 `prefers-color-scheme` 的网站背景与浏览器主题一致
- `system` 模式：`nativeTheme.themeSource = 'system'`，跟随系统主题

**nativeTheme 切换示例**：
```typescript
import { nativeTheme } from 'electron'

// 深色
nativeTheme.themeSource = 'dark'
// 浅色
nativeTheme.themeSource = 'light'
// 跟随系统
nativeTheme.themeSource = 'system'
```

**注意**：第三方网站的深色/浅色模式由网站自身实现控制，浏览器通过 `nativeTheme.themeSource` 间接影响：
1. 支持 `@media (prefers-color-scheme: dark)` 的网站会自动跟随切换
2. 不支持该媒体查询的网站不会自动切换，只能通过标签页背景色间接改善视觉效果
3. 无法强制不支持该查询的网站切换主题

**IPC 通道**：
| 通道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `theme:get` | invoke | void | `TabState['theme']` |
| `theme:set` | invoke | `{ theme }` | void |

### 3.8 侧边栏导航

ChromeUI 增加侧边栏区域，通过按钮切换：
- 历史记录
- 书签
- 下载
- 设置

侧边栏采用固定宽度（280px），从右侧滑出。

## 4. 数据流

```
渲染进程                              主进程
┌──────────────────┐                ┌──────────────────────────────┐
│ DownloadsView    │                │ DownloadManager              │
│ HistoryView      │────invoke─────→│   └─ downloads table         │
│ BookmarkView     │                │   └─ progress → broadcast    │
│ SettingsView     │                │                               │
│                  │                │ HistoryManager               │
│                  │                │   └─ history table            │
│                  │                │   └─ auto-add via TabManager  │
│                  │                │                               │
│                  │                │ BookmarkManager              │
│                  │                │   └─ bookmarks table          │
│                  │                │   └─ import/export HTML       │
│                  │                │                               │
│                  │                │ SettingsManager              │
│                  │                │   └─ electron-store KV       │
└──────────────────┘                └──────────────────────────────┘
```

## 5. 安全

- 继承 M1 安全基线
- 下载目录只允许用户通过 Settings 修改
- 书签导入 HTML 需要沙箱解析（不执行脚本）

## 6. 测试策略

- 单元测试：DownloadManager CRUD、HistoryManager 查询、BookmarkManager 导入导出、SettingsManager KV
- E2E：下载暂停/恢复、历史记录搜索/删除、书签文件夹创建、主题切换

## 7. 验收标准

- [ ] 下载管理：能创建下载、暂停、恢复、取消，进度实时更新
- [ ] 历史记录：自动记录、搜索、删除、清空
- [ ] 书签：添加、删除、重命名、文件夹、搜索、导入导出 HTML
- [ ] 隐身模式：TabBar 右键新建隐身标签页，正确使用 incognito partition
- [ ] 打印/PDF：能打印页面、导出 PDF
- [ ] 缩放：能设置缩放级别，设置存储到 SettingsManager
- [ ] 设置界面：能修改主题、下载路径、默认搜索、新标签页 URL
- [ ] 主题：浅色/深色/system 三模式正常切换，CSS variables 覆盖生效
- [ ] 侧边栏：能切换历史记录/书签/下载/设置视图
- [ ] 所有 lint/typecheck/build 通过
