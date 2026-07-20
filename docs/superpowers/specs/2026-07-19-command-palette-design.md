# 命令面板 (Cmd+K) — 设计规范

> **状态**: 草稿
> **日期**: 2026-07-19
> **作者**: opencode

## 概述

通过 Cmd/Ctrl+K 触发的全能搜索与命令入口。搜索标签页、历史记录、书签，并执行浏览器操作——全部在一个浮层中完成。灵感来自 VS Code、Raycast 和 Arc Command Bar。

## 目标

1. **速度**: 打开 → 搜索 → 执行 < 3 秒
2. **全能性**: 所有浏览器操作的单一入口
3. **可发现性**: 用户无需浏览菜单即可找到任何功能
4. **键盘优先**: 完整的键盘导航，鼠标可选

## 非目标

- 多步骤向导（使用设置页面）
- 超出基础操作的标签页管理
- 外部集成（API 调用、扩展）

## 架构

### 组件概览

```
Cmd+K → registerAppShortcut → IPC shell:openCommandPalette
                                    ↓
                            PopoverManager.open('command-palette', { mode: 'overlay' })
                                    ↓
                            PanelRoot.vue → CommandPalettePanel.vue
                                    ↓
                            onMounted: 一次性获取所有数据
                            用户输入 → 本地模糊匹配 → 渲染结果
                            Enter/单击 → 执行动作 IPC → 关闭面板
```

### 核心组件

| 组件 | 位置 | 职责 |
|------|------|------|
| `CommandPalettePanel.vue` | `apps/renderer/src/panel/` | UI 渲染、键盘导航、本地过滤 |
| `useCommandPalette.ts` | `apps/renderer/src/panel/composables/` | 数据获取、模糊匹配、动作执行（面板 Vue 上下文内） |
| `fuzzyMatch.ts` | `apps/renderer/src/panel/lib/` | 通用模糊匹配工具函数 |
| `command-registry.ts` | `apps/renderer/src/panel/lib/` | 静态命令定义 |

### 为什么用 PopoverManager（而非 renderer DOM）

Electron 的 `WebContentsView` 位于 renderer DOM 之上。在主 renderer 中渲染的命令面板会被活跃标签页的网页内容遮挡。PopoverManager 的 overlay WebContentsView 解决了这个问题，它渲染在所有标签视图之上。

**性能保障**: 仅需 2 次 IPC 调用——打开时获取数据一次，执行选中动作一次。所有搜索/过滤都在面板的 Vue 上下文中本地完成。

## 数据模型

### 命令注册表

在 `command-registry.ts` 中静态定义：

```ts
interface Command {
  id: string                    // 唯一标识符（如 'tab.newTab'）
  category: CommandCategory     // 'tab' | 'navigation' | 'view' | 'settings' | 'page' | 'window'
  label: string                 // i18n key，显示文本
  description?: string          // i18n key，描述
  icon: string                  // Iconify 图标名
  keywords: string[]            // 搜索关键词，用于模糊匹配
  shortcuts?: string            // 快捷键显示文本（如 '⌘T'）
  action: () => void | Promise<void>  // 执行函数
}
```

### 数据源

面板打开时通过 `commandPalette:getData` IPC 一次性获取：

```ts
interface CommandPaletteData {
  tabs: TabState[]              // 所有打开的标签页
  history: HistoryItem[]        // 最近 200 条历史记录
  bookmarks: BookmarkItem[]     // 所有书签
  recentActions: string[]       // 最近执行的命令 ID 列表（持久化）
}
```

### 搜索结果项

```ts
interface CommandPaletteItem {
  id: string
  type: 'command' | 'tab' | 'history' | 'bookmark'
  icon: string
  title: string
  subtitle?: string            // URL / 路径 / 描述
  category: string             // 分组标题文本
  action: () => void | Promise<void>
  score: number                // 模糊匹配分数
}
```

## 命令列表

### 标签页操作

| 命令 | ID | 快捷键 |
|------|-----|--------|
| 新建标签页 | `tab.newTab` | ⌘T |
| 关闭标签页 | `tab.closeTab` | ⌘W |
| 关闭其他标签页 | `tab.closeOtherTabs` | — |
| 重新打开已关闭标签页 | `tab.reopenClosed` | ⌘⇧T |
| 固定/取消固定标签页 | `tab.togglePin` | — |
| 静音/取消静音标签页 | `tab.toggleMute` | — |

### 导航

| 命令 | ID | 快捷键 |
|------|-----|--------|
| 后退 | `nav.goBack` | — |
| 前进 | `nav.goForward` | — |
| 刷新 | `nav.reload` | F5 |
| 停止 | `nav.stop` | — |

### 视图操作

| 命令 | ID | 快捷键 |
|------|-----|--------|
| 在页面中查找 | `view.find` | ⌘F |
| 放大 | `view.zoomIn` | ⌘+ |
| 缩小 | `view.zoomOut` | ⌘- |
| 重置缩放 | `view.resetZoom` | ⌘0 |
| 切换全屏 | `view.fullscreen` | ⌘⇧F |
| 打印 | `view.print` | ⌘P |
| 保存为 PDF | `view.savePdf` | — |
| 切换阅读模式 | `view.readerMode` | — |
| 切换暗色模式 | `view.darkMode` | — |

### 设置切换

| 命令 | ID |
|------|-----|
| 打开设置 | `settings.open` |
| 切换书签栏 | `settings.bookmarkBar` |
| 切换标签栏位置 | `settings.tabBarPosition` |
| 切换广告拦截 | `settings.adBlock` |
| 设置代理模式: 规则 | `settings.proxyRule` |
| 设置代理模式: 全局 | `settings.proxyGlobal` |
| 设置代理模式: 直连 | `settings.proxyDirect` |

### 内部页面

| 命令 | ID | 路由 |
|------|-----|------|
| 打开历史记录 | `page.history` | `/history` |
| 打开书签 | `page.bookmarks` | `/bookmarks` |
| 打开密码管理 | `page.passwords` | `/passwords` |
| 打开下载 | `page.downloads` | `/downloads` |
| 打开代理设置 | `page.proxy` | `/proxy` |
| 打开文件管理 | `page.files` | `/files` |

### 窗口操作

| 命令 | ID | 快捷键 |
|------|-----|--------|
| 新建窗口 | `window.new` | ⌘N |
| 新建无痕窗口 | `window.incognito` | ⌘⇧N |

## UI 设计

### 布局（顶部下拉风格）

```
┌─────────────────────────────────────────┐
│  ┌─────────────────────────────────┐    │ ← 搜索框（居中，宽度 560px）
│  │ 🔍 搜索命令、标签页、历史、书签... │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │ ← 结果列表（最多 8 项）
│  │ 📂 标签页                        │    │
│  │   GitHub - wangmingfa/wmfx      │    │ ← 选中态高亮
│  │   油猴脚本管理器 - Tampermonkey  │    │
│  │ ─────────────────────────────── │    │ ← 分隔线
│  │ 📜 历史记录                      │    │
│  │   Google                       │    │
│  │   GitHub                       │    │
│  │ ─────────────────────────────── │    │
│  │ ⭐ 书签                         │    │
│  │   技术文档                      │    │
│  │ ─────────────────────────────── │    │
│  │ ⚡ 命令                         │    │
│  │   新建标签页        ⌘T          │    │
│  │   关闭当前标签页    ⌘W          │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### 视觉细节

- **搜索框**: `NInput` 组件，`border-radius: 8px`，`font-size: 15px`，`padding: 12px 16px`
- **结果列表**: 固定宽度 560px，最大高度 400px，`overflow-y: auto`
- **结果项**: 高度 36px，左侧 padding 16px，图标 16px + 间距 12px + 标题
- **选中态**: `background: var(--bg-hover)`，左侧 3px accent 色指示器
- **分类标题**: `font-size: 11px`，`color: var(--text-secondary)`，`text-transform: uppercase`
- **分隔线**: 1px `var(--border-color)`，上下各 4px margin
- **背景遮罩**: 半透明 `rgba(0,0,0,0.3)`，点击关闭
- **动画**: 从顶部滑入 150ms `ease-out`，关闭时滑出 100ms `ease-in`

### 键盘导航

| 按键 | 行为 |
|------|------|
| `↑` / `↓` | 移动选中项 |
| `Enter` | 执行选中项 |
| `Esc` | 关闭面板 |
| `Tab` | 跳转到下一个分类的第一个项 |

## 搜索算法

### 模糊匹配 (`fuzzyMatch.ts`)

简化版 fzf 算法：

**匹配规则：**
1. 连续匹配字符得分更高
2. 在单词边界（空格、连字符、下划线、驼峰）处匹配得分更高
3. 在标题开头处匹配得分最高
4. 不区分大小写

**评分因素：**
- 匹配连续性：连续匹配 > 分散匹配
- 位置权重：标题开头 > 单词边界 > 其他位置
- 类型权重：标签页（最近活跃）> 命令 > 历史 > 书签
- 最近使用加权：最近执行过的命令额外 +10 分

**示例：**
```
输入 "yts" → "YouTube" (85) > "yts.com" (72) > "My Tasks" (45)
输入 "gb"  → "Go Back" (90) > "GitHub" (65) > "Google Bookmark" (50)
输入 "设置" → "设置" (100) > "打开设置" (80) > "设置标签栏位置" (70)
```

### 结果排序策略

1. **精确匹配**优先
2. **前缀匹配**次之
3. **模糊匹配**按分数排序
4. 同分时：命令 > 标签页 > 历史 > 书签
5. 最近使用的命令额外 +10 分

## IPC 通道

### 新增通道

```ts
// 添加到 IpcContract
'shell:openCommandPalette': () => void
'commandPalette:getData': () => CommandPaletteData
'commandPalette:execute': (opts: { type: string; id: string; data?: unknown }) => void
'commandPalette:saveRecent': (actionId: string) => void
```

### 修改的通道

无。所有现有数据通道（`tab:getList`、`history:search`、`bookmark:search` 等）直接复用。

## 数据流

### 打开流程

```
1. 用户按 Cmd+K
2. 主进程 wireWindowShortcuts → IPC shell:openCommandPalette
3. 渲染进程 ChromeUI 收到事件 → 创建 Popover('command-palette', { mode: 'overlay' })
4. PopoverManager 打开 overlay WebContentsView
5. PanelRoot 渲染 CommandPalettePanel
6. CommandPalettePanel onMounted → IPC commandPalette:getData
7. 主进程并行返回 { tabs, history, bookmarks, recentActions }
8. 面板存储数据到本地 reactive state，显示最近使用的命令
```

### 搜索流程

```
1. 用户输入 "yts"
2. CommandPalettePanel 调用 fuzzyMatch 本地过滤
3. 20ms 内渲染匹配结果（标签页 + 历史 + 书签 + 命令）
4. 用户按 ↓ 选中 "YouTube" 标签页
5. 用户按 Enter → IPC commandPalette:execute({ type: 'tab', id: 'xxx' })
6. 主进程 TabManager.activateTab(id) → 切换到该标签
7. 面板关闭
```

### 关闭流程

```
- Esc 键 → Popover.close()
- 点击遮罩 → Popover.close()
- 执行动作后 → Popover.close()
- 失去焦点 → Popover.close()
```

## 国际化

### 新增命名空间: `commandPalette`

```ts
// zh-CN
commandPalette: {
  placeholder: '搜索命令、标签页、历史、书签...',
  noResults: '未找到匹配结果',
  recentCommands: '最近使用',
  tabs: '标签页',
  history: '历史记录',
  bookmarks: '书签',
  commands: '命令',
  viewAll: '查看全部...',
  actions: {
    newTab: '新建标签页',
    closeTab: '关闭当前标签页',
    closeOtherTabs: '关闭其他标签页',
    reopenClosed: '重新打开已关闭的标签页',
    goBack: '后退',
    goForward: '前进',
    reload: '刷新',
    stop: '停止加载',
    findInPage: '在页面中查找',
    zoomIn: '放大',
    zoomOut: '缩小',
    resetZoom: '重置缩放',
    toggleFullscreen: '切换全屏',
    print: '打印',
    saveAsPdf: '保存为 PDF',
    toggleReaderMode: '切换阅读模式',
    toggleDarkMode: '切换暗色模式',
    openSettings: '打开设置',
    openHistory: '打开历史记录',
    openBookmarks: '打开书签',
    openPasswords: '打开密码管理',
    openDownloads: '打开下载',
    openProxy: '打开代理设置',
    openFiles: '打开文件管理',
    newWindow: '新建窗口',
    newIncognitoWindow: '新建无痕窗口',
  }
}
```

```ts
// en-US
commandPalette: {
  placeholder: 'Search commands, tabs, history, bookmarks...',
  noResults: 'No matching results',
  recentCommands: 'Recent',
  tabs: 'Tabs',
  history: 'History',
  bookmarks: 'Bookmarks',
  commands: 'Commands',
  viewAll: 'View all...',
  actions: {
    newTab: 'New Tab',
    closeTab: 'Close Tab',
    closeOtherTabs: 'Close Other Tabs',
    reopenClosed: 'Reopen Closed Tab',
    goBack: 'Go Back',
    goForward: 'Go Forward',
    reload: 'Reload',
    stop: 'Stop',
    findInPage: 'Find in Page',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    resetZoom: 'Reset Zoom',
    toggleFullscreen: 'Toggle Fullscreen',
    print: 'Print',
    saveAsPdf: 'Save as PDF',
    toggleReaderMode: 'Toggle Reader Mode',
    toggleDarkMode: 'Toggle Dark Mode',
    openSettings: 'Open Settings',
    openHistory: 'Open History',
    openBookmarks: 'Open Bookmarks',
    openPasswords: 'Open Passwords',
    openDownloads: 'Open Downloads',
    openProxy: 'Open Proxy',
    openFiles: 'Open Files',
    newWindow: 'New Window',
    newIncognitoWindow: 'New Incognito Window',
  }
}
```

## 错误处理

### 数据加载失败

- `commandPalette:getData` IPC 失败 → 显示"加载失败，请重试"
- 3 秒后自动重试一次
- 重试仍失败 → 仅显示静态命令（不依赖远程数据）

### 搜索无结果

- 显示"未找到匹配结果"提示
- 建议用户尝试更短的关键词或检查拼写

### 快捷键冲突

- Cmd+K 在某些网页中可能被占用（如 Gmail 快捷键）
- 解决方案：命令面板在 `overlay` 模式下捕获所有键盘事件，网页无法拦截
- 命令面板始终优先于页面快捷键

### 性能

- 数据获取：tabs/history/bookmarks 通过 `Promise.allSettled` 并行请求
- 搜索防抖：无（即时响应，模糊匹配足够快）
- 结果渲染：不需要虚拟滚动（最多 8 项）
- 内存：面板关闭时释放搜索数据

### 大数据量处理

- 历史记录限制最近 200 条
- 书签全量加载（通常 < 1000 条）
- 标签页全量加载（通常 < 50 个）

## 测试策略

### 单元测试

- `fuzzyMatch.ts`：匹配准确性、评分、边界情况（空输入、特殊字符）
- `command-registry.ts`：所有命令包含必要字段、无重复 ID

### E2E 测试

- Cmd+K 打开命令面板
- 输入过滤结果
- 方向键导航结果
- Enter 执行选中项
- Esc 关闭面板
- 点击遮罩关闭面板
- 跨标签页、历史、书签搜索
- 命令执行（新建标签页、关闭标签页等）

### 手动测试

- 1000+ 条历史记录时的性能
- 快捷键不与网页冲突
- 主题切换（浅色/深色）正常工作
- 双语 i18n 显示正确
