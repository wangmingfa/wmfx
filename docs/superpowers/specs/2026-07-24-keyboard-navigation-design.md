# 键盘导航系统设计

## 概述

为浏览器支持完备的键盘操作，支持两种模式：常规 GUI 键盘模式和 VIM 模式。用户可在设置中全局切换模式，模式状态持久化，重启后恢复。

## 架构：集中式键盘管理器

```
KeyboardManager（renderer 进程）
  ├─ ModeStore（GUI / VIM，Normal/Insert/Visual/Command）
  ├─ GuiModeHandler（外壳导航：Tab 切换、焦点导航等）
  ├─ VimStateMachine（模式状态机 + 命令解析）
  └─ ContentBridge（IPC → web content 的 VIM 控制）
```

**核心流程**：
```
keydown 事件
  → KeyboardManager.handleKeydown(event)
    → 1. 检查是否是全局快捷键（Cmd+F 等）→ 执行并拦截
    → 2. 根据 mode 分发：
       ├─ GUI 模式 → GuiModeHandler
       └─ VIM 模式 → VimStateMachine.handleKey(event)
            → 根据 vimMode 分发：
               ├─ Normal → 解析 motion/command（hjkl, w, dd, yy 等）
               ├─ Insert → 透传给网页（或地址栏）
               ├─ Visual → 选择 + motion
               └─ Command → 地址栏输入
```

## 模式管理

### 全局状态

```ts
interface KeyboardState {
  mode: 'gui' | 'vim'
  vimMode: 'normal' | 'insert' | 'visual' | 'command'
  count: number        // VIM 计数器（如 3j 中的 3）
  registers: Record<string, string>  // VIM 寄存器
}
```

- `keyboardMode` 存储到 settings，重启后恢复
- 默认进入 GUI 模式
- 切换到 VIM 后默认进入 Normal 模式

### 模式切换

- GUI → VIM：设置页切换，或 `Cmd+Shift+V`
- VIM → GUI：`:set gui`（Command 模式）
- VIM 内部模式切换：标准 VIM（`Esc`=Normal, `i`=Insert, `v`=Visual, `:`=Command）

## 快捷键优先级

### 始终生效（通用快捷键）

两种模式都工作，不受模式影响：

| 快捷键 | 功能 |
|--------|------|
| `Cmd+F` | 搜索 |
| `Cmd+L` | 地址栏 |
| `Cmd+K` | 命令面板 |
| `Cmd+W` | 关闭标签 |
| `Cmd+T` | 新建标签 |
| `Cmd+Shift+T` | 恢复标签 |
| `Cmd+N` | 新窗口 |
| `Cmd+Shift+N` | 无痕窗口 |
| `Cmd+,` | 设置 |
| `F12` | DevTools |
| `Cmd+Shift+B` | 书签栏 |
| `Cmd+Shift+L` | 标签栏位置 |

### GUI 模式专用

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Tab` | 下一个标签 |
| `Ctrl+Shift+Tab` | 上一个标签 |
| `Cmd+1-8` | 跳转到第 N 个标签 |
| `Cmd+9` | 跳转到最后一个标签 |
| `F6` / `Ctrl+F6` | 地址栏 ↔ 内容区焦点切换 |
| `Tab` | 下一个可交互元素 |
| `Shift+Tab` | 上一个可交互元素 |
| `Space` | 向下滚动一屏 |
| `Shift+Space` | 向上滚动一屏 |
| `Home` | 页面顶部 |
| `End` | 页面底部 |
| `Ctrl+Home` | 聚焦到页面顶部 |
| `Ctrl+End` | 聚焦到页面底部 |

### VIM 模式专用

#### Normal 模式

**移动**：
- `h/j/k/l` — 左/下/上/右
- `w` — 下一个词头
- `b` — 上一个词头
- `e` — 当前/下一个词尾
- `0` — 行首
- `$` — 行尾
- `^` — 行首非空字符
- `gg` — 页面顶部
- `G` — 页面底部
- `f{char}` — 向右跳到字符
- `F{char}` — 向左跳到字符
- `t{char}` — 向右跳到字符前
- `T{char}` — 向左跳到字符前

**编辑**：
- `i` — 光标前插入
- `I` — 行首插入
- `a` — 光标后插入
- `A` — 行尾插入
- `o` — 下方新建行并插入
- `O` — 上方新建行并插入
- `s` — 删除当前字符并插入
- `S` — 删除整行并插入
- `x` — 删除当前字符
- `dd` — 删除行
- `yy` — 复制行
- `p` — 粘贴
- `P` — 前方粘贴
- `u` — 撤销
- `Ctrl+r` — 重做
- `cw` — 修改到词尾
- `ciw` — 修改整个词
- `ci"` — 修改引号内内容
- `ci(` — 修改括号内内容
- `ci<` — 修改尖括号内内容
- `dw` — 删除到词尾
- `diw` — 删除整个词
- `di"` — 删除引号内内容
- `di(` — 删除括号内内容
- `di<` — 删除尖括号内内容
- `d$` / `D` — 删除到行尾
- `d0` — 删除到行首

**搜索**：
- `/pattern` — 向前搜索
- `?pattern` — 向后搜索
- `n` — 下一个匹配
- `N` — 上一个匹配
- `*` — 搜索当前单词（向下）
- `#` — 搜索当前单词（向上）

**标签切换**：
- `gt` — 下一个标签
- `gT` — 上一个标签
- `g{N}` — 跳转到第 N 个标签（如 `g3` = 第 3 个）
- `{N}gt` — 跳转到第 N 个标签（如 `3gt` = 第 3 个）

**数字前缀**：
- `3j` — 向下 3 行
- `5x` — 删除 5 字符
- `10G` — 跳转到第 10 行

#### Visual 模式

- `v` — 字符选择
- `V` — 行选择
- 选择后可执行 `d`（删除）、`y`（复制）、`c`（修改）

#### Insert 模式

- 透传所有按键给焦点元素
- `Esc` 返回 Normal

#### Command 模式

按 `:` 激活地址栏，前缀 `:`：

| 命令 | 功能 |
|------|------|
| `:open {url}` / `:o {url}` | 打开 URL |
| `:tabnew` | 新建标签 |
| `:tabclose` / `:tabc` | 关闭标签 |
| `:tabnext` | 下一个标签 |
| `:tabprev` / `:tabp` | 上一个标签 |
| `:tabfirst` / `:tabfir` | 跳转到第一个标签 |
| `:tablast` | 跳转到最后一个标签 |
| `:set gui` | 切换到 GUI 模式 |
| `:nohlsearch` / `:noh` | 取消搜索高亮 |

## 内容区 VIM 实现

### 注入机制

通过 preload 脚本注入 VIM 控制器到每个 web 页面：

```
Main Process
  ├─ TabManager.webContents.on('did-finish-load')
  │    → 注入 content-vim.js（通过 executeJavaScript）
  └─ IPC: vim-mode-changed → 通知 content 切换模式

Renderer Process
  └─ KeyboardManager.mode 变化时 → 通知 main → 转发到所有 tab 的 content
```

### Content VIM 控制器

```ts
// content-vim.js
class ContentVim {
  mode: 'normal' | 'insert' | 'visual'
  
  handleKeydown(e: KeyboardEvent) {
    if (this.mode === 'normal') {
      // hjkl → 滚动/移动
      // dd → 删除行（如果有可编辑元素）
      // / → 聚焦到页面搜索
      e.preventDefault()
    }
    // Insert 模式：透传
  }
}
```

### 通信机制

- Main → Content：`webContents.send('vim-mode-change', mode)`
- Content → Main：`ipcRenderer.send('vim-key-event', keyData)`（仅在需要外壳响应时）

## 设置 UI

### 布局

```
┌─────────────────────────────────────┐
│  通用快捷键                          │
├─────────────────────────────────────┤
│  导航                                │
│  ├─ Cmd+F    搜索                    │
│  ├─ Cmd+L    地址栏                  │
│  └─ Cmd+K    命令面板                │
│                                      │
│  标签页                              │
│  ├─ Cmd+T    新建标签                │
│  ├─ Cmd+W    关闭标签                │
│  └─ Cmd+Shift+T  恢复标签            │
│                                      │
│  窗口                                │
│  ├─ Cmd+N    新窗口                  │
│  └─ F12      DevTools                │
├─────────────────────────────────────┤
│  模式快捷键  [GUI 模式 ▾]            │
├─────────────────────────────────────┤
│  （根据模式动态显示对应 section）      │
│                                      │
│  标签切换                            │
│  ├─ Ctrl+Tab    下一个标签            │
│  └─ Ctrl+Shift+Tab  上一个标签        │
│                                      │
│  焦点导航                            │
│  ├─ F6      地址栏 ↔ 内容区          │
│  └─ Tab     下一个元素               │
└─────────────────────────────────────┘
```

### 交互

- 切换模式时立即生效（不需重启）
- 设置持久化到 `settings.json` 的 `keyboardMode` 字段
- 重启后恢复上次选择的模式

## 文件结构

### 新增文件

```
apps/renderer/src/keyboard/
  ├─ KeyboardManager.ts      # 核心管理器，模式状态，事件分发
  ├─ modes/
  │    ├─ GuiMode.ts         # GUI 模式处理（Tab 切换、焦点导航等）
  │    └─ VimMode.ts         # VIM 状态机 + 命令解析
  ├─ commands/
  │    ├─ ShellCommands.ts   # 外壳命令（Tab 切换、地址栏等）
  │    ├─ ContentCommands.ts # 内容区命令（滚动、选择等）
  │    └─ VimCommands.ts     # VIM 特定命令（dd/yy/p 等）
  └─ types.ts                # 类型定义

apps/main/src/content/
  └─ content-vim.js          # 注入到 web 页面的 VIM 控制器
```

### 修改文件

- `apps/main/src/index.ts` — 添加 `Ctrl+Tab` / `Ctrl+Shift+Tab` 快捷键
- `apps/main/src/shortcut-registry.ts` — 添加新快捷键定义
- `apps/main/src/tab-manager.ts` — 注入 content-vim.js，转发模式变化
- `apps/renderer/src/App.vue` — 初始化 KeyboardManager
- `apps/renderer/src/views/settings/SettingsView.vue` — 添加键盘模式设置项

## 实现顺序

1. 模式管理 + 状态存储（settings）
2. GUI 模式外壳导航（Tab 切换、焦点导航）
3. VIM 状态机 + Normal 模式基础命令
4. VIM Visual 模式
5. VIM Command 模式（: 命令）
6. 内容区 VIM 注入
7. 设置 UI
