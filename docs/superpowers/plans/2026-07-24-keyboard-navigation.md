# 键盘导航系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为浏览器实现完整的键盘导航系统，支持 GUI 模式和 VIM 模式两种操作方式。

**Architecture:** 集中式 `KeyboardManager` 在 renderer 进程监听全局 keydown 事件，根据当前模式分发给 `GuiModeHandler` 或 `VimStateMachine`。模式状态通过 `settings:set` IPC 持久化，重启后恢复。VIM 模式下通过 `executeJavaScript` 注入 content-vim.js 到 web 内容区。

**Tech Stack:** TypeScript, Vue 3, Electron IPC, `globalShortcut`

## Global Constraints

- 使用 `bun` 包管理器
- IPC 通道定义在 `packages/ipc-contract/src/channels.ts`
- 设置存储在 main process 的 `SettingsManager`（`electron-store`）
- 渲染进程通过 `window.browserAPI` 访问 IPC
- 快捷键优先级：全局快捷键（Electron `globalShortcut`）> renderer keydown > content keydown
- 日志：`console.debug` 用于调试，`console.info` 用于关键路径

## 文件结构

### 新增文件

| 文件 | 职责 |
|------|------|
| `apps/renderer/src/keyboard/types.ts` | 类型定义（KeyboardMode, VimMode, KeyboardState 等） |
| `apps/renderer/src/keyboard/KeyboardManager.ts` | 核心管理器：模式状态、事件分发、IPC 通信 |
| `apps/renderer/src/keyboard/GuiMode.ts` | GUI 模式处理：Tab 切换、焦点导航 |
| `apps/renderer/src/keyboard/VimStateMachine.ts` | VIM 状态机：模式切换、按键解析、命令执行 |
| `apps/renderer/src/keyboard/VimCommands.ts` | VIM 命令定义和执行逻辑 |
| `apps/main/src/content/content-vim.js` | 注入到 web 页面的 VIM 控制器 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `apps/main/src/settings-manager.ts` | 添加 `keyboardMode` 到 schema、defaults、validation |
| `packages/ipc-contract/src/channels.ts` | 添加 `SettingsSnapshot.keyboardMode`，添加3个新 IPC 通道 |
| `apps/main/src/ipc/register.ts` | 注册 `keyboard:set-mode`、`keyboard:mode-changed` 处理 |
| `apps/main/src/tab-manager.ts` | 注入 content-vim.js，转发 mode 变化 |
| `apps/renderer/src/App.vue` | 初始化 KeyboardManager |
| `apps/renderer/src/views/settings/SettingsView.vue` | 添加键盘模式切换 UI |

---

## Task 1: 设置基础设施 — 添加 keyboardMode 设置

**Files:**
- Modify: `apps/main/src/settings-manager.ts:13-44,46-77,201-302`
- Modify: `packages/ipc-contract/src/channels.ts:568-587`

**Interfaces:**
- Produces: `SettingsSchema.keyboardMode: 'gui' | 'vim'`, `SettingsSnapshot.keyboardMode`

- [ ] **Step 1: 添加 keyboardMode 到 SettingsSchema 和 defaultSettings**

在 `apps/main/src/settings-manager.ts` 的 `SettingsSchema` 接口中添加：

```ts
keyboardMode: 'gui' | 'vim'
```

在 `defaultSettings` 对象中添加：

```ts
keyboardMode: 'gui',
```

- [ ] **Step 2: 添加 validation case**

在 `validateValue` 的 switch 语句中添加：

```ts
case 'keyboardMode': {
  if (['gui', 'vim'].includes(value as string)) return value as SettingsSchema[K]
  return defaultSettings.keyboardMode as SettingsSchema[K]
}
```

- [ ] **Step 3: 添加到 SettingsSnapshot**

在 `packages/ipc-contract/src/channels.ts` 的 `SettingsSnapshot` 接口中添加：

```ts
/** 键盘模式：GUI 或 VIM */
keyboardMode: 'gui' | 'vim'
```

- [ ] **Step 4: 验证 TypeScript 编译**

Run: `bun run lint:ts`
Expected: 无新增错误

- [ ] **Step 5: Commit**

```bash
git add apps/main/src/settings-manager.ts packages/ipc-contract/src/channels.ts
git commit -m "feat(keyboard): add keyboardMode setting infrastructure"
```

---

## Task 2: IPC 通道 — 添加 keyboard 相关 IPC

**Files:**
- Modify: `packages/ipc-contract/src/channels.ts:595-710`
- Modify: `apps/main/src/ipc/register.ts:754-771`
- Modify: `apps/main/src/preload.ts` (添加3个方法)
- Modify: `apps/renderer/src/env.d.ts` (添加类型声明)

**Interfaces:**
- Consumes: `SettingsSnapshot.keyboardMode`（Task 1）
- Produces: `keyboard:set-mode`, `keyboard:mode-changed`, `keyboard:vim-event` IPC 通道

- [ ] **Step 1: 添加 IPC 通道到 IpcContract**

在 `packages/ipc-contract/src/channels.ts` 的 `IpcContract` 接口中添加：

```ts
// Keyboard
'keyboard:set-mode': (mode: 'gui' | 'vim') => void
'keyboard:mode-changed': (mode: 'gui' | 'vim') => void
```

- [ ] **Step 2: 在 preload.ts 暴露方法**

在 `apps/main/src/preload.ts` 的 `api` 对象中添加：

```ts
setKeyboardMode: (mode: 'gui' | 'vim') => ipcRenderer.invoke('keyboard:set-mode', mode),
onKeyboardModeChanged: (cb: (mode: 'gui' | 'vim') => void) =>
  ipcRenderer.on('keyboard:mode-changed', (_e, mode) => cb(mode)),
```

- [ ] **Step 3: 在 env.d.ts 添加类型声明**

在 `apps/renderer/src/env.d.ts` 的 `window.browserAPI` 中添加：

```ts
setKeyboardMode: IpcInvoke['keyboard:set-mode']
onKeyboardModeChanged: (handler: (mode: 'gui' | 'vim') => void) => void
```

- [ ] **Step 4: 注册 IPC handler（main process）**

在 `apps/main/src/ipc/register.ts` 的 `registerIpcHandlers()` 中添加：

```ts
handle('keyboard:set-mode', (_event, mode) => {
  console.info('[IPC] keyboard:set-mode: mode=%s', mode)
  SettingsManager.getInstance().set('keyboardMode', mode)
  // 广播给所有窗口
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('keyboard:mode-changed', mode)
  }
})
```

- [ ] **Step 5: 验证 TypeScript 编译**

Run: `bun run lint:ts`
Expected: 无新增错误

- [ ] **Step 6: Commit**

```bash
git add packages/ipc-contract/src/channels.ts apps/main/src/ipc/register.ts apps/main/src/preload.ts apps/renderer/src/env.d.ts
git commit -m "feat(keyboard): add keyboard IPC channels"
```

---

## Task 3: KeyboardManager 骨架 + 模式管理

**Files:**
- Create: `apps/renderer/src/keyboard/types.ts`
- Create: `apps/renderer/src/keyboard/KeyboardManager.ts`
- Modify: `apps/renderer/src/App.vue`

**Interfaces:**
- Consumes: `SettingsSnapshot.keyboardMode`（Task 1）, `keyboard:set-mode` IPC（Task 2）
- Produces: `KeyboardManager.getInstance()`, `KeyboardManager.mode`, `KeyboardManager.on()`

- [ ] **Step 1: 创建 types.ts**

```ts
export type KeyboardMode = 'gui' | 'vim'
export type VimMode = 'normal' | 'insert' | 'visual' | 'command'

export interface KeyboardState {
  mode: KeyboardMode
  vimMode: VimMode
  count: number
  registers: Record<string, string>
}

export type KeyboardEventAction =
  | { type: 'handled' }
  | { type: 'pass-through' }
  | { type: 'execute'; command: string; args?: unknown }
```

- [ ] **Step 2: 创建 KeyboardManager.ts 骨架**

```ts
import type { KeyboardMode, KeyboardState, VimMode } from './types'

type ModeListener = (mode: KeyboardMode) => void

export class KeyboardManager {
  private static instance: KeyboardManager
  private state: KeyboardState = {
    mode: 'gui',
    vimMode: 'normal',
    count: 0,
    registers: {},
  }
  private listeners: ModeListener[] = []
  private initialized = false

  static getInstance(): KeyboardManager {
    if (!KeyboardManager.instance) {
      KeyboardManager.instance = new KeyboardManager()
    }
    return KeyboardManager.instance
  }

  get mode(): KeyboardMode {
    return this.state.mode
  }

  get vimMode(): VimMode {
    return this.state.vimMode
  }

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    // 从 settings 读取初始模式
    const saved = await window.browserAPI.getSetting('keyboardMode')
    this.state.mode = (saved as KeyboardMode) ?? 'gui'

    // 监听模式变化 IPC
    window.browserAPI.onKeyboardModeChanged((mode) => {
      console.info('[KeyboardManager] mode changed via IPC: %s', mode)
      this.setMode(mode)
    })

    // 注册全局 keydown 监听
    window.addEventListener('keydown', this.handleKeydown, true)

    console.info('[KeyboardManager] init: mode=%s', this.state.mode)
  }

  setMode(mode: KeyboardMode): void {
    if (this.state.mode === mode) return
    console.info('[KeyboardManager] setMode: %s → %s', this.state.mode, mode)
    this.state.mode = mode
    if (mode === 'vim') {
      this.state.vimMode = 'normal'
    }
    this.state.count = 0
    // 通知 UI 更新
    for (const listener of this.listeners) {
      listener(mode)
    }
  }

  async switchMode(mode: KeyboardMode): Promise<void> {
    // 持久化到 settings（触发 IPC → main → broadcast）
    await window.browserAPI.setKeyboardMode(mode)
  }

  onModeChange(listener: ModeListener): () => void {
    this.listeners.push(listener)
    return () => {
      const idx = this.listeners.indexOf(listener)
      if (idx >= 0) this.listeners.splice(idx, 1)
    }
  }

  setVimMode(vimMode: VimMode): void {
    console.debug('[KeyboardManager] setVimMode: %s', vimMode)
    this.state.vimMode = vimMode
    this.state.count = 0
  }

  appendCount(digit: number): void {
    this.state.count = this.state.count * 10 + digit
  }

  getCount(): number {
    const c = this.state.count
    this.state.count = 0
    return c || 1
  }

  resetCount(): void {
    this.state.count = 0
  }

  private handleKeydown = (e: KeyboardEvent): void => {
    // 1. 检查 focus 是否在输入框
    const target = e.target as HTMLElement
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

    // 2. 根据 mode 分发（GUI 模式下输入框内的快捷键由组件自己处理）
    if (this.state.mode === 'gui') {
      // GUI 模式：检查是否是 GUI 专用快捷键
      // 目前不拦截任何按键，让组件自己处理
      return
    }

    // VIM 模式：输入框内只响应 Esc（回到 Normal）和 Ctrl+C
    if (isInput && this.state.vimMode !== 'insert') {
      // Insert 模式下输入框内透传
    }

    if (this.state.mode === 'vim') {
      // 委托给 VimStateMachine（Task 4）
      // 目前只处理 Esc
      if (e.key === 'Escape') {
        this.setVimMode('normal')
        e.preventDefault()
      }
    }
  }
}
```

- [ ] **Step 3: 在 App.vue 初始化 KeyboardManager**

在 `apps/renderer/src/App.vue` 的 `<script setup>` 中添加：

```ts
import { KeyboardManager } from '@/keyboard/KeyboardManager'
import { onMounted } from 'vue'

onMounted(() => {
  KeyboardManager.getInstance().init()
})
```

- [ ] **Step 4: 验证编译**

Run: `bun run lint:ts && bun run lint:vue`
Expected: 无新增错误

- [ ] **Step 5: Commit**

```bash
git add apps/renderer/src/keyboard/ apps/renderer/src/App.vue
git commit -m "feat(keyboard): add KeyboardManager skeleton with mode management"
```

---

## Task 4: GUI 模式外壳导航

**Files:**
- Create: `apps/renderer/src/keyboard/GuiMode.ts`
- Modify: `apps/renderer/src/keyboard/KeyboardManager.ts`

**Interfaces:**
- Consumes: `KeyboardManager.mode`, `window.browserAPI`（tab 操作）
- Produces: `GuiMode.handleKeydown(e)`

- [ ] **Step 1: 创建 GuiMode.ts**

```ts
import { KeyboardManager } from './KeyboardManager'

/**
 * GUI 模式下的外壳导航：Tab 切换、焦点导航等
 * 参考 qutebrowser 的 normal mode 快捷键设计
 */
export class GuiMode {
  private km: KeyboardManager

  constructor(km: KeyboardManager) {
    this.km = km
  }

  handleKeydown(e: KeyboardEvent): boolean {
    // 检查 focus 是否在输入框
    const target = e.target as HTMLElement
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

    // 输入框内：不拦截任何按键（由组件自己处理）
    if (isInput) return false

    // Ctrl+Tab / Ctrl+Shift+Tab — 标签切换（通过 IPC）
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        window.browserAPI.send?.('shell:prevTab')
      } else {
        window.browserAPI.send?.('shell:nextTab')
      }
      return true
    }

    // Cmd+1-8 — 跳转到第 N 个标签
    if (e.metaKey && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      const num = parseInt(e.key)
      if (num >= 1 && num <= 8) {
        e.preventDefault()
        window.browserAPI.send?.('shell:switchTab', num - 1)
        return true
      }
      if (e.key === '9') {
        e.preventDefault()
        window.browserAPI.send?.('shell:lastTab')
        return true
      }
    }

    // F6 / Ctrl+F6 — 地址栏 ↔ 内容区焦点切换
    if (e.key === 'F6' || (e.ctrlKey && e.key === 'F6')) {
      e.preventDefault()
      window.browserAPI.send?.('shell:toggleFocus')
      return true
    }

    // Space — 向下滚动一屏
    if (e.key === ' ') {
      e.preventDefault()
      window.browserAPI.send?.('shell:scrollPageDown')
      return true
    }

    // Shift+Space — 向上滚动一屏
    if (e.shiftKey && e.key === ' ') {
      e.preventDefault()
      window.browserAPI.send?.('shell:scrollPageUp')
      return true
    }

    // Home / End — 页面顶部/底部
    if (e.key === 'Home') {
      e.preventDefault()
      window.browserAPI.send?.('shell:scrollTop')
      return true
    }
    if (e.key === 'End') {
      e.preventDefault()
      window.browserAPI.send?.('shell:scrollBottom')
      return true
    }

    // Ctrl+Home / Ctrl+End — 聚焦到页面顶部/底部
    if (e.ctrlKey && e.key === 'Home') {
      e.preventDefault()
      window.browserAPI.send?.('shell:focusTop')
      return true
    }
    if (e.ctrlKey && e.key === 'End') {
      e.preventDefault()
      window.browserAPI.send?.('shell:focusBottom')
      return true
    }

    return false
  }
}
```

- [ ] **Step 2: 注册 GUI 处理到 KeyboardManager**

在 `apps/renderer/src/keyboard/KeyboardManager.ts` 的 `handleKeydown` 中，GUI 模式下委托给 `GuiMode`：

```ts
import { GuiMode } from './GuiMode'

// 在 class 内添加字段
private guiMode: GuiMode

// 在 init() 中初始化
this.guiMode = new GuiMode(this)

// 在 handleKeydown 的 GUI 模式分支中替换为：
if (this.state.mode === 'gui') {
  if (this.guiMode.handleKeydown(e)) return
  return
}
```

- [ ] **Step 3: 添加 shell IPC 通道（main process 侧）**

在 `apps/main/src/ipc/register.ts` 中添加 shell 转发通道：

```ts
// Shell navigation commands from GUI mode
ipcMain.on('shell:nextTab', (event) => {
  const inst = getInstance(event)
  if (!inst) return
  const tabs = inst.tabManager.getList()
  const activeIdx = tabs.findIndex((t) => t.id === inst.tabManager.getActiveTabId())
  if (activeIdx >= 0 && activeIdx < tabs.length - 1) {
    inst.tabManager.activate(tabs[activeIdx + 1].id)
  }
})

ipcMain.on('shell:prevTab', (event) => {
  const inst = getInstance(event)
  if (!inst) return
  const tabs = inst.tabManager.getList()
  const activeIdx = tabs.findIndex((t) => t.id === inst.tabManager.getActiveTabId())
  if (activeIdx > 0) {
    inst.tabManager.activate(tabs[activeIdx - 1].id)
  }
})

ipcMain.on('shell:switchTab', (event, index: number) => {
  const inst = getInstance(event)
  if (!inst) return
  const tabs = inst.tabManager.getList()
  if (index >= 0 && index < tabs.length) {
    inst.tabManager.activate(tabs[index].id)
  }
})

ipcMain.on('shell:lastTab', (event) => {
  const inst = getInstance(event)
  if (!inst) return
  const tabs = inst.tabManager.getList()
  if (tabs.length > 0) {
    inst.tabManager.activate(tabs[tabs.length - 1].id)
  }
})

ipcMain.on('shell:toggleFocus', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.webContents.send('shell:focusAddressBar')
})

ipcMain.on('shell:scrollPageDown', (event) => {
  const inst = getInstance(event)
  if (!inst) return
  const activeTab = inst.tabManager.getActiveTab()
  if (activeTab) activeTab.webContents.send('content:scrollPageDown')
})

ipcMain.on('shell:scrollPageUp', (event) => {
  const inst = getInstance(event)
  if (!inst) return
  const activeTab = inst.tabManager.getActiveTab()
  if (activeTab) activeTab.webContents.send('content:scrollPageUp')
})

ipcMain.on('shell:scrollTop', (event) => {
  const inst = getInstance(event)
  if (!inst) return
  const activeTab = inst.tabManager.getActiveTab()
  if (activeTab) activeTab.webContents.send('content:scrollTop')
})

ipcMain.on('shell:scrollBottom', (event) => {
  const inst = getInstance(event)
  if (!inst) return
  const activeTab = inst.tabManager.getActiveTab()
  if (activeTab) activeTab.webContents.send('content:scrollBottom')
})

ipcMain.on('shell:focusTop', (event) => {
  const inst = getInstance(event)
  if (!inst) return
  const activeTab = inst.tabManager.getActiveTab()
  if (activeTab) activeTab.webContents.send('content:focusTop')
})

ipcMain.on('shell:focusBottom', (event) => {
  const inst = getInstance(event)
  if (!inst) return
  const activeTab = inst.tabManager.getActiveTab()
  if (activeTab) activeTab.webContents.send('content:focusBottom')
})
```

- [ ] **Step 4: 在 preload.ts 暴露 send 方法（如尚未存在）**

在 `apps/main/src/preload.ts` 的 `api` 对象中添加：

```ts
send: (channel: string, ...args: unknown[]) => ipcRenderer.send(channel, ...args),
```

在 `apps/renderer/src/env.d.ts` 中添加：

```ts
send: (channel: string, ...args: unknown[]) => void
```

- [ ] **Step 5: 验证编译**

Run: `bun run lint:ts && bun run lint:vue`
Expected: 无新增错误

- [ ] **Step 6: Commit**

```bash
git add apps/renderer/src/keyboard/GuiMode.ts apps/renderer/src/keyboard/KeyboardManager.ts apps/main/src/ipc/register.ts apps/main/src/preload.ts apps/renderer/src/env.d.ts
git commit -m "feat(keyboard): add GUI mode navigation (tab switching, scrolling, focus)"
```

---

## Task 5: VIM 状态机 — 基础按键处理

**Files:**
- Create: `apps/renderer/src/keyboard/VimStateMachine.ts`
- Modify: `apps/renderer/src/keyboard/KeyboardManager.ts`

**Interfaces:**
- Consumes: `KeyboardManager.setVimMode()`, `KeyboardManager.getCount()`, `KeyboardManager.appendCount()`
- Produces: `VimStateMachine.handleKeydown(e)`

- [ ] **Step 1: 创建 VimStateMachine.ts**

```ts
import { KeyboardManager } from './KeyboardManager'
import type { VimMode } from './types'

/**
 * VIM 状态机：处理 Normal/Insert/Visual/Command 模式的按键分发
 * 按键解析参考 qutebrowser 的 keyinput 模块
 */
export class VimStateMachine {
  private km: KeyboardManager
  /** Normal 模式下待匹配的前缀序列（如 'g' 等待下一个键） */
  private pendingKeys = ''

  constructor(km: KeyboardManager) {
    this.km = km
  }

  handleKeydown(e: KeyboardEvent): boolean {
    const mode = this.km.vimMode

    switch (mode) {
      case 'normal':
        return this.handleNormal(e)
      case 'insert':
        return this.handleInsert(e)
      case 'visual':
        return this.handleVisual(e)
      case 'command':
        return this.handleCommand(e)
      default:
        return false
    }
  }

  private handleNormal(e: KeyboardEvent): boolean {
    const key = e.key
    const ctrl = e.ctrlKey
    const shift = e.shiftKey

    // Esc — 清除 pending 状态
    if (key === 'Escape') {
      this.pendingKeys = ''
      this.km.resetCount()
      return true
    }

    // Ctrl+[ — 等同 Esc
    if (ctrl && key === '[') {
      this.pendingKeys = ''
      this.km.resetCount()
      return true
    }

    // 数字 0-9 — 计数器（0 特殊：行首）
    if (!ctrl && !shift && key >= '0' && key <= '9') {
      if (key === '0' && this.km.getCount() === 0) {
        // 0 = 行首
        return this.executeCommand('moveToLineStart')
      }
      this.km.appendCount(parseInt(key))
      return true
    }

    // 处理待匹配前缀
    if (this.pendingKeys) {
      const full = this.pendingKeys + key
      this.pendingKeys = ''
      return this.dispatchKey(full, e)
    }

    // 单键命令
    return this.dispatchKey(key, e)
  }

  private dispatchKey(key: string, e: KeyboardEvent): boolean {
    const count = this.km.getCount()

    // --- 移动 ---
    if (key === 'h') return this.executeCommand('moveLeft', count)
    if (key === 'j') return this.executeCommand('moveDown', count)
    if (key === 'k') return this.executeCommand('moveUp', count)
    if (key === 'l') return this.executeCommand('moveRight', count)
    if (key === 'w') return this.executeCommand('moveWordForward', count)
    if (key === 'b') return this.executeCommand('moveWordBackward', count)
    if (key === 'e') return this.executeCommand('moveWordEnd', count)
    if (key === '0') return this.executeCommand('moveToLineStart')
    if (key === '$') return this.executeCommand('moveToLineEnd')
    if (key === '^') return this.executeCommand('moveToFirstNonBlank')
    if (key === 'G') return count > 1 ? this.executeCommand('moveToLine', count) : this.executeCommand('moveToEnd')
    if (key === 'gg') return this.executeCommand('moveToTop')

    // --- 前缀命令 ---
    if (key === 'g') {
      this.pendingKeys = 'g'
      return true
    }
    if (key === 'd') {
      this.pendingKeys = 'd'
      return true
    }
    if (key === 'y') {
      this.pendingKeys = 'y'
      return true
    }
    if (key === 'c') {
      this.pendingKeys = 'c'
      return true
    }
    if (key === 'D') return this.executeCommand('deleteToLineEnd', count)
    if (key === 'C') return this.executeCommand('changeToLineEnd', count)

    // --- 编辑 ---
    if (key === 'x') return this.executeCommand('deleteChar', count)
    if (key === 'p') return this.executeCommand('paste')
    if (key === 'P') return this.executeCommand('pasteBefore')
    if (key === 'u') return this.executeCommand('undo')
    if (key === 'r' && e.ctrlKey) return this.executeCommand('redo')
    if (key === 's') return this.executeCommand('substituteChar')
    if (key === 'S') return this.executeCommand('substituteLine')

    // --- 模式切换 ---
    if (key === 'i') {
      this.km.setVimMode('insert')
      return true
    }
    if (key === 'I') {
      this.km.setVimMode('insert')
      return this.executeCommand('moveToFirstNonBlank')
    }
    if (key === 'a') {
      this.km.setVimMode('insert')
      return this.executeCommand('moveRight')
    }
    if (key === 'A') {
      this.km.setVimMode('insert')
      return this.executeCommand('moveToLineEnd')
    }
    if (key === 'o') {
      this.km.setVimMode('insert')
      return this.executeCommand('openLineBelow')
    }
    if (key === 'O') {
      this.km.setVimMode('insert')
      return this.executeCommand('openLineAbove')
    }
    if (key === 'v') {
      this.km.setVimMode('visual')
      return true
    }
    if (key === 'V') {
      this.km.setVimMode('visual')
      return this.executeCommand('selectLine')
    }
    if (key === ':') {
      this.km.setVimMode('command')
      return this.executeCommand('openCommandLine')
    }

    // --- 搜索 ---
    if (key === '/') return this.executeCommand('searchForward')
    if (key === '?') return this.executeCommand('searchBackward')
    if (key === 'n') return this.executeCommand('searchNext')
    if (key === 'N') return this.executeCommand('searchPrev')
    if (key === '*') return this.executeCommand('searchWordUnderCursor')
    if (key === '#') return this.executeCommand('searchWordUnderCursorReverse')

    // --- 标签切换 ---
    if (key === 'gt') return this.executeCommand('tabNext')
    if (key === 'gT') return this.executeCommand('tabPrev')
    if (key === 'tabFirst') return this.executeCommand('tabFirst')
    if (key === 'tabLast') return this.executeCommand('tabLast')

    // 未识别的按键
    return false
  }

  private handleInsert(e: KeyboardEvent): boolean {
    // Esc — 回到 Normal
    if (e.key === 'Escape') {
      this.km.setVimMode('normal')
      return true
    }
    // Ctrl+[ — 等同 Esc
    if (e.ctrlKey && e.key === '[') {
      this.km.setVimMode('normal')
      return true
    }
    // 其他按键透传给网页
    return false
  }

  private handleVisual(e: KeyboardEvent): boolean {
    // Esc — 回到 Normal
    if (e.key === 'Escape') {
      this.km.setVimMode('normal')
      return true
    }
    // d — 删除选区
    if (e.key === 'd') {
      this.km.setVimMode('normal')
      return this.executeCommand('deleteSelection')
    }
    // y — 复制选区
    if (e.key === 'y') {
      this.km.setVimMode('normal')
      return this.executeCommand('copySelection')
    }
    // c — 修改选区
    if (e.key === 'c') {
      this.km.setVimMode('insert')
      return this.executeCommand('changeSelection')
    }
    return false
  }

  private handleCommand(e: KeyboardEvent): boolean {
    // Command 模式在地址栏中处理，这里只处理 Esc
    if (e.key === 'Escape') {
      this.km.setVimMode('normal')
      return true
    }
    return false
  }

  private executeCommand(command: string, count = 1): boolean {
    console.debug('[VimStateMachine] executeCommand: %s count=%d', command, count)
    // 通过 IPC 发送到 main process → 当前活跃 tab 的 web content
    window.browserAPI.send?.('keyboard:vim-command', { command, count })
    return true
  }
}
```

- [ ] **Step 2: 集成 VimStateMachine 到 KeyboardManager**

在 `apps/renderer/src/keyboard/KeyboardManager.ts` 中：

```ts
import { VimStateMachine } from './VimStateMachine'

// 添加字段
private vimState: VimStateMachine

// 在 init() 中初始化
this.vimState = new VimStateMachine(this)

// 在 handleKeydown 的 VIM 模式分支中替换为：
if (this.state.mode === 'vim') {
  // Insert 模式下输入框内透传，非输入框内仍由 VIM 处理
  if (this.state.vimMode === 'insert') {
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
    if (isInput) return
  }
  if (this.vimState.handleKeydown(e)) {
    e.preventDefault()
    e.stopPropagation()
  }
  return
}
```

- [ ] **Step 3: 验证编译**

Run: `bun run lint:ts`
Expected: 无新增错误

- [ ] **Step 4: Commit**

```bash
git add apps/renderer/src/keyboard/VimStateMachine.ts apps/renderer/src/keyboard/KeyboardManager.ts
git commit -m "feat(keyboard): add VIM state machine with Normal/Insert/Visual/Command modes"
```

---

## Task 6: VIM Command 模式（: 命令）

**Files:**
- Modify: `apps/renderer/src/keyboard/VimCommands.ts`（新建）
- Modify: `apps/renderer/src/keyboard/VimStateMachine.ts`

**Interfaces:**
- Consumes: `window.browserAPI`（tab 操作、导航）
- Produces: `VimCommands.execute(command, args)`

- [ ] **Step 1: 创建 VimCommands.ts**

```ts
/**
 * VIM 命令定义和执行
 * : 命令在地址栏中输入，前缀 ':' 表示 VIM 命令
 */
export interface VimCommand {
  names: string[]
  description: string
  execute: (args: string) => void
}

export class VimCommands {
  private commands: VimCommand[] = [
    {
      names: ['open', 'o'],
      description: '打开 URL',
      execute: (url) => {
        if (url.trim()) {
          window.browserAPI.loadURL(url.trim())
        }
      },
    },
    {
      names: ['tabnew'],
      description: '新建标签',
      execute: () => {
        window.browserAPI.createNewTab()
      },
    },
    {
      names: ['tabclose', 'tabc'],
      description: '关闭标签',
      execute: () => {
        window.browserAPI.send?.('shell:closeCurrentTab')
      },
    },
    {
      names: ['tabnext'],
      description: '下一个标签',
      execute: () => {
        window.browserAPI.send?.('shell:nextTab')
      },
    },
    {
      names: ['tabprev', 'tabp'],
      description: '上一个标签',
      execute: () => {
        window.browserAPI.send?.('shell:prevTab')
      },
    },
    {
      names: ['tabfirst', 'tabfir'],
      description: '第一个标签',
      execute: () => {
        window.browserAPI.send?.('shell:switchTab', 0)
      },
    },
    {
      names: ['tablast'],
      description: '最后一个标签',
      execute: () => {
        window.browserAPI.send?.('shell:lastTab')
      },
    },
    {
      names: ['set', 'se'],
      description: '设置选项',
      execute: (args) => {
        if (args.trim() === 'gui') {
          window.browserAPI.setKeyboardMode('gui')
        }
      },
    },
    {
      names: ['nohlsearch', 'noh'],
      description: '取消搜索高亮',
      execute: () => {
        window.browserAPI.send?.('content:nohlsearch')
      },
    },
  ]

  execute(input: string): boolean {
    const trimmed = input.trim()
    if (!trimmed) return false

    const spaceIdx = trimmed.indexOf(' ')
    const cmdName = spaceIdx >= 0 ? trimmed.slice(0, spaceIdx) : trimmed
    const args = spaceIdx >= 0 ? trimmed.slice(spaceIdx + 1) : ''

    // 精确匹配
    const cmd = this.commands.find((c) => c.names.includes(cmdName))
    if (cmd) {
      console.info('[VimCommands] execute: %s %s', cmdName, args)
      cmd.execute(args)
      return true
    }

    console.debug('[VimCommands] unknown command: %s', cmdName)
    return false
  }

  getCompletions(partial: string): string[] {
    const results: string[] = []
    for (const cmd of this.commands) {
      for (const name of cmd.names) {
        if (name.startsWith(partial)) {
          results.push(name)
        }
      }
    }
    return results
  }
}
```

- [ ] **Step 2: 在 VimCommands 中添加 shell:closeCurrentTab**

在 `apps/main/src/ipc/register.ts` 中添加：

```ts
ipcMain.on('shell:closeCurrentTab', (event) => {
  const inst = getInstance(event)
  if (!inst) return
  const activeTabId = inst.tabManager.getActiveTabId()
  if (activeTabId) inst.tabManager.close(activeTabId)
})
```

- [ ] **Step 3: 验证编译**

Run: `bun run lint:ts`
Expected: 无新增错误

- [ ] **Step 4: Commit**

```bash
git add apps/renderer/src/keyboard/VimCommands.ts apps/main/src/ipc/register.ts
git commit -m "feat(keyboard): add VIM command mode (: commands)"
```

---

## Task 7: 内容区 VIM 注入

**Files:**
- Create: `apps/main/src/content/content-vim.js`
- Modify: `apps/main/src/tab-manager.ts`（注入脚本）
- Modify: `apps/main/src/ipc/register.ts`（转发命令到 tab）

**Interfaces:**
- Consumes: `keyboard:vim-command` IPC（来自 renderer）
- Produces: content-vim.js 注入到 web 页面

- [ ] **Step 1: 创建 content-vim.js**

```js
/**
 * 注入到 web 页面的 VIM 控制器
 * 通过 executeJavaScript 在 did-finish-load 时注入
 */
;(() => {
  if (window.__wmfxVim) return

  const state = {
    mode: 'normal', // normal | insert | visual
  }

  function handleKeydown(e) {
    if (state.mode === 'normal') {
      // 拦截字母键（除 input/textarea/contentEditable 内）
      const target = e.target
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      if (isInput) return

      const key = e.key.toLowerCase()

      // 滚动命令
      if (key === 'j') {
        window.scrollBy(0, 60)
        e.preventDefault()
        return
      }
      if (key === 'k') {
        window.scrollBy(0, -60)
        e.preventDefault()
        return
      }
      if (key === 'h') {
        window.scrollBy(-60, 0)
        e.preventDefault()
        return
      }
      if (key === 'l') {
        window.scrollBy(60, 0)
        e.preventDefault()
        return
      }
      if (key === 'g' && !e.ctrlKey && !e.metaKey) {
        // gg — 页面顶部（简化版：只处理单 g，双击由外部状态管理）
        return
      }
      if (key === 'g' && e.shiftKey) {
        // G — 页面底部
        window.scrollTo(0, document.body.scrollHeight)
        e.preventDefault()
        return
      }

      // Ctrl+D / Ctrl+U — 半屏滚动
      if (e.ctrlKey && key === 'd') {
        window.scrollBy(0, window.innerHeight / 2)
        e.preventDefault()
        return
      }
      if (e.ctrlKey && key === 'u') {
        window.scrollBy(0, -window.innerHeight / 2)
        e.preventDefault()
        return
      }

      // f — hint 模式（标记链接）
      if (key === 'f' && !e.ctrlKey && !e.metaKey) {
        startHints()
        e.preventDefault()
        return
      }
    }
  }

  // --- Hint 模式 ---
  let hintOverlay = null
  let hintLabels = []

  function startHints() {
    const links = document.querySelectorAll('a[href], button, input[type="submit"], [role="button"]')
    if (links.length === 0) return

    hintOverlay = document.createElement('div')
    hintOverlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none;'

    const labels = 'asdfghjklqwertyuiop'
    hintLabels = []

    links.forEach((el, i) => {
      if (i >= labels.length) return
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const label = document.createElement('span')
      label.textContent = labels[i].toUpperCase()
      label.style.cssText = `
        position:fixed;
        left:${rect.left + 2}px;
        top:${rect.top + 2}px;
        background:#ff6600;
        color:#fff;
        font-size:12px;
        font-weight:bold;
        padding:1px 4px;
        border-radius:2px;
        z-index:2147483647;
        pointer-events:none;
        font-family:monospace;
      `
      hintOverlay.appendChild(label)
      hintLabels.push({ el, label: labels[i] })
    })

    document.body.appendChild(hintOverlay)

    const handler = (ke) => {
      const ch = ke.key.toLowerCase()
      const match = hintLabels.find((h) => h.label === ch)
      if (match) {
        match.el.click()
      }
      stopHints()
      ke.preventDefault()
      ke.stopPropagation()
    }

    document.addEventListener('keydown', handler, { once: true, capture: true })
  }

  function stopHints() {
    if (hintOverlay) {
      hintOverlay.remove()
      hintOverlay = null
    }
    hintLabels = []
  }

  // 监听来自 main process 的模式变化
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'wmfx-vim-mode') {
      state.mode = e.data.mode
    }
  })

  window.addEventListener('keydown', handleKeydown, true)
  window.__wmfxVim = { state }
})()
```

- [ ] **Step 2: 在 tab-manager.ts 注入 content-vim.js**

在 `apps/main/src/tab-manager.ts` 中，在 `did-finish-load` 事件处理中注入：

```ts
// 在 did-finish-load handler 中添加（在现有的 did-finish-load 逻辑之后）
const keyboardMode = SettingsManager.getInstance().get('keyboardMode')
if (keyboardMode === 'vim') {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const vimScriptPath = path.join(process.resourcesPath, 'content', 'content-vim.js')
  const vimScript = fs.readFileSync(vimScriptPath, 'utf-8')
  tab.webContents.executeJavaScript(vimScript)
}
```

- [ ] **Step 3: 在 main process 转发 vim 命令到 tab**

在 `apps/main/src/ipc/register.ts` 中添加：

```ts
ipcMain.on('keyboard:vim-command', (event, data: { command: string; count: number }) => {
  const inst = getInstance(event)
  if (!inst) return
  const activeTab = inst.tabManager.getActiveTab()
  if (activeTab) {
    activeTab.webContents.send('content:vim-command', data)
  }
})
```

- [ ] **Step 4: 在 preload.ts 暴露 keyboard:vim-command**

在 `apps/main/src/preload.ts` 的 `api` 对象中添加：

```ts
sendVimCommand: (data: { command: string; count: number }) =>
  ipcRenderer.send('keyboard:vim-command', data),
```

- [ ] **Step 5: 在 electron-builder 配置中打包 content-vim.js**

检查 `package.json` 或 `electron-builder` 配置，确保 `apps/main/src/content/content-vim.js` 被打包到 resources 目录。

- [ ] **Step 6: 验证编译**

Run: `bun run lint:ts`
Expected: 无新增错误

- [ ] **Step 7: Commit**

```bash
git add apps/main/src/content/ apps/main/src/tab-manager.ts apps/main/src/ipc/register.ts apps/main/src/preload.ts
git commit -m "feat(keyboard): add content VIM injection (hjkl, hints, scroll)"
```

---

## Task 8: 设置 UI — 键盘模式切换 + 快捷键展示

**Files:**
- Modify: `apps/renderer/src/views/settings/SettingsView.vue`

**Interfaces:**
- Consumes: `KeyboardManager.mode`, `KeyboardManager.switchMode()`, `SHORTCUT_REGISTRY`（通过 IPC 获取）

**快捷键分层说明：**
- **全局（Global）**：Electron `globalShortcut` 注册，无论焦点在哪都生效（Cmd+F、Cmd+W 等）
- **外壳级（Shell）**：renderer 进程 KeyboardManager 拦截，操作浏览器外壳（Ctrl+Tab、Space 翻页等）
- **页面级（Page）**：注入到 web 内容区，操作当前网页（hjkl 滚动、f 提示等）

- [ ] **Step 1: 创建快捷键数据定义文件**

创建 `apps/renderer/src/keyboard/keybindings.ts`：

```ts
/**
 * 快捷键定义数据，用于设置页展示
 * scope: 'global' = Electron globalShortcut，始终生效
 *        'shell'  = renderer KeyboardManager 拦截，操作浏览器外壳
 *        'page'   = content-vim.js 注入，操作当前网页
 */
export interface KeybindingEntry {
  key: string
  description: string
  scope: 'global' | 'shell' | 'page'
}

export interface KeybindingSection {
  title: string
  entries: KeybindingEntry[]
}

export interface KeybindingModeConfig {
  label: string
  value: 'gui' | 'vim'
  sections: KeybindingSection[]
}

export const keybindingModes: KeybindingModeConfig[] = [
  {
    label: 'GUI 模式',
    value: 'gui',
    sections: [
      {
        title: '导航',
        entries: [
          { key: 'Cmd+F', description: '搜索', scope: 'global' },
          { key: 'Cmd+L', description: '地址栏', scope: 'global' },
          { key: 'Cmd+K', description: '命令面板', scope: 'global' },
        ],
      },
      {
        title: '标签页',
        entries: [
          { key: 'Cmd+T', description: '新建标签', scope: 'global' },
          { key: 'Cmd+W', description: '关闭标签', scope: 'global' },
          { key: 'Cmd+Shift+T', description: '恢复标签', scope: 'global' },
          { key: 'Ctrl+Tab', description: '下一个标签', scope: 'shell' },
          { key: 'Ctrl+Shift+Tab', description: '上一个标签', scope: 'shell' },
          { key: 'Cmd+1-8', description: '跳转到第 N 个标签', scope: 'shell' },
          { key: 'Cmd+9', description: '跳转到最后一个标签', scope: 'shell' },
        ],
      },
      {
        title: '窗口',
        entries: [
          { key: 'Cmd+N', description: '新建窗口', scope: 'global' },
          { key: 'Cmd+Shift+N', description: '无痕窗口', scope: 'global' },
          { key: 'Cmd+,', description: '设置', scope: 'global' },
          { key: 'F12', description: 'DevTools', scope: 'global' },
          { key: 'Cmd+Shift+B', description: '书签栏', scope: 'global' },
          { key: 'Cmd+Shift+L', description: '标签栏位置', scope: 'global' },
        ],
      },
      {
        title: '焦点与滚动',
        entries: [
          { key: 'F6', description: '地址栏 ↔ 内容区焦点切换', scope: 'shell' },
          { key: 'Tab', description: '下一个可交互元素', scope: 'shell' },
          { key: 'Shift+Tab', description: '上一个可交互元素', scope: 'shell' },
          { key: 'Space', description: '向下滚动一屏', scope: 'page' },
          { key: 'Shift+Space', description: '向上滚动一屏', scope: 'page' },
          { key: 'Home', description: '页面顶部', scope: 'page' },
          { key: 'End', description: '页面底部', scope: 'page' },
          { key: 'Ctrl+Home', description: '聚焦到页面顶部', scope: 'page' },
          { key: 'Ctrl+End', description: '聚焦到页面底部', scope: 'page' },
        ],
      },
    ],
  },
  {
    label: 'VIM 模式',
    value: 'vim',
    sections: [
      {
        title: '导航（始终生效）',
        entries: [
          { key: 'Cmd+F', description: '搜索', scope: 'global' },
          { key: 'Cmd+L', description: '地址栏', scope: 'global' },
          { key: 'Cmd+K', description: '命令面板', scope: 'global' },
          { key: 'Cmd+T', description: '新建标签', scope: 'global' },
          { key: 'Cmd+W', description: '关闭标签', scope: 'global' },
          { key: 'Cmd+Shift+T', description: '恢复标签', scope: 'global' },
          { key: 'Cmd+N', description: '新建窗口', scope: 'global' },
          { key: 'Cmd+,', description: '设置', scope: 'global' },
          { key: 'F12', description: 'DevTools', scope: 'global' },
        ],
      },
      {
        title: '模式切换',
        entries: [
          { key: 'Esc', description: '回到 Normal 模式', scope: 'shell' },
          { key: 'Ctrl+[', description: '回到 Normal 模式（等同 Esc）', scope: 'shell' },
          { key: 'i', description: '进入 Insert 模式（光标前）', scope: 'shell' },
          { key: 'I', description: '进入 Insert 模式（行首）', scope: 'shell' },
          { key: 'a', description: '进入 Insert 模式（光标后）', scope: 'shell' },
          { key: 'A', description: '进入 Insert 模式（行尾）', scope: 'shell' },
          { key: 'o', description: '下方新建行并进入 Insert', scope: 'shell' },
          { key: 'O', description: '上方新建行并进入 Insert', scope: 'shell' },
          { key: 'v', description: '进入 Visual 模式', scope: 'shell' },
          { key: 'V', description: '进入 Visual 行选择模式', scope: 'shell' },
          { key: ':', description: '进入 Command 模式（地址栏）', scope: 'shell' },
        ],
      },
      {
        title: '光标移动（页面级）',
        entries: [
          { key: 'h', description: '左', scope: 'page' },
          { key: 'j', description: '下', scope: 'page' },
          { key: 'k', description: '上', scope: 'page' },
          { key: 'l', description: '右', scope: 'page' },
          { key: 'w', description: '下一个词头', scope: 'page' },
          { key: 'b', description: '上一个词头', scope: 'page' },
          { key: 'e', description: '当前/下一个词尾', scope: 'page' },
          { key: '0', description: '行首', scope: 'page' },
          { key: '$', description: '行尾', scope: 'page' },
          { key: '^', description: '行首非空字符', scope: 'page' },
          { key: 'gg', description: '页面顶部', scope: 'page' },
          { key: 'G', description: '页面底部', scope: 'page' },
        ],
      },
      {
        title: '跳转（页面级）',
        entries: [
          { key: 'f{char}', description: '向右跳到字符', scope: 'page' },
          { key: 'F{char}', description: '向左跳到字符', scope: 'page' },
          { key: 't{char}', description: '向右跳到字符前', scope: 'page' },
          { key: 'T{char}', description: '向左跳到字符前', scope: 'page' },
        ],
      },
      {
        title: '数字前缀',
        entries: [
          { key: '{N}j / {N}k', description: '向下/上 N 行', scope: 'page' },
          { key: '{N}x', description: '删除 N 个字符', scope: 'shell' },
          { key: '{N}dd', description: '删除 N 行', scope: 'shell' },
          { key: '10G', description: '跳转到第 10 行', scope: 'page' },
        ],
      },
      {
        title: '编辑（外壳级）',
        entries: [
          { key: 'x', description: '删除当前字符', scope: 'shell' },
          { key: 'dd', description: '删除行', scope: 'shell' },
          { key: 'yy', description: '复制行', scope: 'shell' },
          { key: 'p', description: '粘贴', scope: 'shell' },
          { key: 'P', description: '前方粘贴', scope: 'shell' },
          { key: 'u', description: '撤销', scope: 'shell' },
          { key: 'Ctrl+r', description: '重做', scope: 'shell' },
          { key: 's', description: '删除当前字符并插入', scope: 'shell' },
          { key: 'S', description: '删除整行并插入', scope: 'shell' },
          { key: 'D', description: '删除到行尾', scope: 'shell' },
          { key: 'C', description: '修改到行尾', scope: 'shell' },
          { key: 'cw', description: '修改到词尾', scope: 'shell' },
          { key: 'ci"', description: '修改引号内内容', scope: 'shell' },
          { key: 'ci(', description: '修改括号内内容', scope: 'shell' },
          { key: 'dw', description: '删除到词尾', scope: 'shell' },
          { key: 'di"', description: '删除引号内内容', scope: 'shell' },
          { key: 'di(', description: '删除括号内内容', scope: 'shell' },
        ],
      },
      {
        title: '搜索（页面级）',
        entries: [
          { key: '/pattern', description: '向前搜索', scope: 'page' },
          { key: '?pattern', description: '向后搜索', scope: 'page' },
          { key: 'n', description: '下一个匹配', scope: 'page' },
          { key: 'N', description: '上一个匹配', scope: 'page' },
          { key: '*', description: '搜索当前单词（向下）', scope: 'page' },
          { key: '#', description: '搜索当前单词（向上）', scope: 'page' },
        ],
      },
      {
        title: '标签切换',
        entries: [
          { key: 'gt', description: '下一个标签', scope: 'shell' },
          { key: 'gT', description: '上一个标签', scope: 'shell' },
          { key: '{N}gt', description: '跳转到第 N 个标签', scope: 'shell' },
        ],
      },
      {
        title: '提示模式（页面级）',
        entries: [
          { key: 'f', description: '标记页面上的链接/按钮', scope: 'page' },
          { key: 'F', description: '同 f（在新标签打开）', scope: 'page' },
        ],
      },
      {
        title: 'Command 模式',
        entries: [
          { key: ':open {url}', description: '打开 URL', scope: 'shell' },
          { key: ':tabnew', description: '新建标签', scope: 'shell' },
          { key: ':tabclose', description: '关闭标签', scope: 'shell' },
          { key: ':tabnext', description: '下一个标签', scope: 'shell' },
          { key: ':tabprev', description: '上一个标签', scope: 'shell' },
          { key: ':tabfirst', description: '第一个标签', scope: 'shell' },
          { key: ':tablast', description: '最后一个标签', scope: 'shell' },
          { key: ':set gui', description: '切换到 GUI 模式', scope: 'shell' },
          { key: ':nohlsearch', description: '取消搜索高亮', scope: 'page' },
        ],
      },
    ],
  },
]
```

- [ ] **Step 2: 在 SettingsView.vue 添加完整的快捷键展示**

在 `SettingsView.vue` 的 template 中，在合适的位置添加：

```vue
<!-- 键盘模式选择 -->
<div class="keyboard-mode-section">
  <div class="keyboard-mode-header">
    <span class="keyboard-mode-title">键盘模式</span>
    <n-select
      :value="keyboardMode"
      :options="keyboardModeOptions"
      @update:value="onKeyboardModeChange"
      style="width: 140px"
    />
  </div>

  <!-- 快捷键展示 -->
  <div class="keybindings">
    <div class="keybinding-scope-legend">
      <span class="scope-tag scope-global">全局</span>
      <span class="scope-tag scope-shell">外壳级</span>
      <span class="scope-tag scope-page">页面级</span>
    </div>

    <div
      v-for="section in currentKeybindingSections"
      :key="section.title"
      class="keybinding-group"
    >
      <div class="keybinding-group-title">{{ section.title }}</div>
      <div
        v-for="entry in section.entries"
        :key="entry.key"
        class="keybinding-row"
      >
        <div class="keybinding-left">
          <kbd class="keybinding-key">{{ entry.key }}</kbd>
          <span class="keybinding-desc">{{ entry.description }}</span>
        </div>
        <span
          class="scope-tag"
          :class="{
            'scope-global': entry.scope === 'global',
            'scope-shell': entry.scope === 'shell',
            'scope-page': entry.scope === 'page',
          }"
        >
          {{ scopeLabels[entry.scope] }}
        </span>
      </div>
    </div>
  </div>
</div>
```

在 script setup 中添加：

```ts
import { NSelect } from 'naive-ui'
import { KeyboardManager } from '@/keyboard/KeyboardManager'
import { keybindingModes, type KeybindingSection } from '@/keyboard/keybindings'

const keyboardMode = ref<'gui' | 'vim'>('gui')
const keyboardModeOptions = [
  { label: 'GUI 模式', value: 'gui' },
  { label: 'VIM 模式', value: 'vim' },
]

const scopeLabels: Record<string, string> = {
  global: '全局',
  shell: '外壳级',
  page: '页面级',
}

const currentKeybindingSections = computed<KeybindingSection[]>(() => {
  const config = keybindingModes.find((m) => m.value === keyboardMode.value)
  return config?.sections ?? []
})

onMounted(async () => {
  keyboardMode.value = KeyboardManager.getInstance().mode
})

const onKeyboardModeChange = async (value: 'gui' | 'vim') => {
  keyboardMode.value = value
  await KeyboardManager.getInstance().switchMode(value)
}
```

在 style 中添加（使用 LESS 嵌套）：

```less
.keyboard-mode-section {
  margin-bottom: 24px;
}

.keyboard-mode-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.keyboard-mode-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.keybinding-scope-legend {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.keybinding-group {
  margin-bottom: 16px;
}

.keybinding-group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding-left: 4px;
}

.keybinding-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 4px;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--bg-hover);
  }
}

.keybinding-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.keybinding-key {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 2px 6px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  min-width: 80px;
  text-align: center;
  color: var(--text-primary);
}

.keybinding-desc {
  font-size: 13px;
  color: var(--text-secondary);
}

.scope-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
  white-space: nowrap;

  &.scope-global {
    background: var(--primary-subtle);
    color: var(--primary);
  }

  &.scope-shell {
    background: var(--warning-subtle);
    color: var(--warning);
  }

  &.scope-page {
    background: var(--success-subtle);
    color: var(--success);
  }
}
```

- [ ] **Step 3: 验证编译**

Run: `bun run lint:ts && bun run lint:vue`
Expected: 无新增错误

- [ ] **Step 4: Commit**

```bash
git add apps/renderer/src/keyboard/keybindings.ts apps/renderer/src/views/settings/SettingsView.vue
git commit -m "feat(keyboard): add keybinding display with scope tags in settings"
```

---

## Task 9: GUI 模式快捷键注册（main process）

**Files:**
- Modify: `apps/main/src/shortcut-registry.ts`
- Modify: `apps/main/src/index.ts`

**Interfaces:**
- Consumes: `SHORTCUT_REGISTRY`（现有）
- Produces: Ctrl+Tab / Ctrl+Shift+Tab 快捷键

- [ ] **Step 1: 添加 Ctrl+Tab 快捷键到 SHORTCUT_REGISTRY**

在 `apps/main/src/shortcut-registry.ts` 中添加：

```ts
{
  id: 'next-tab',
  accelerator: 'Ctrl+Tab',
  scope: 'in-app',
  group: 'tab',
  description: { 'zh-CN': '下一个标签', 'en-US': 'Next Tab' },
},
{
  id: 'prev-tab',
  accelerator: 'Ctrl+Shift+Tab',
  scope: 'in-app',
  group: 'tab',
  description: { 'zh-CN': '上一个标签', 'en-US': 'Previous Tab' },
},
```

- [ ] **Step 2: 在 wireWindowShortcuts 中添加 action**

在 `apps/main/src/index.ts` 的 `wireWindowShortcuts` 函数的 `actions` 对象中添加：

```ts
'next-tab': () => {
  const focused = BrowserWindow.getFocusedWindow()
  if (!focused) return
  const inst = globalThis.browserInstances.get(String(focused.id))
  if (!inst) return
  const tabs = inst.tabManager.getList()
  const activeIdx = tabs.findIndex((t) => t.id === inst.tabManager.getActiveTabId())
  if (activeIdx >= 0 && activeIdx < tabs.length - 1) {
    inst.tabManager.activate(tabs[activeIdx + 1].id)
  }
},
'prev-tab': () => {
  const focused = BrowserWindow.getFocusedWindow()
  if (!focused) return
  const inst = globalThis.browserInstances.get(String(focused.id))
  if (!inst) return
  const tabs = inst.tabManager.getList()
  const activeIdx = tabs.findIndex((t) => t.id === inst.tabManager.getActiveTabId())
  if (activeIdx > 0) {
    inst.tabManager.activate(tabs[activeIdx - 1].id)
  }
},
```

- [ ] **Step 3: 验证编译**

Run: `bun run lint:ts`
Expected: 无新增错误

- [ ] **Step 4: Commit**

```bash
git add apps/main/src/shortcut-registry.ts apps/main/src/index.ts
git commit -m "feat(keyboard): register Ctrl+Tab/Shift+Tab shortcuts"
```

---

## Task 10: 集成测试与验证

- [ ] **Step 1: 启动开发环境**

Run: `bun run dev`

- [ ] **Step 2: 验证设置持久化**

- 打开设置 → 切换键盘模式为 VIM → 刷新 → 确认模式保持 VIM
- 切换回 GUI → 刷新 → 确认模式保持 GUI

- [ ] **Step 3: 验证 GUI 模式导航**

- Ctrl+Tab / Ctrl+Shift+Tab → 标签切换
- Space / Shift+Space → 页面滚动
- F6 → 焦点切换到地址栏

- [ ] **Step 4: 验证 VIM 模式**

- 切换到 VIM 模式
- hjkl → 页面滚动（content-vim.js 注入生效）
- i → 进入 Insert 模式
- Esc → 回到 Normal 模式
- : → 地址栏显示 VIM 命令前缀

- [ ] **Step 5: 验证 IPC 通信**

- 检查 console 中的 `[KeyboardManager]` 和 `[VimStateMachine]` 日志

- [ ] **Step 6: 运行全量 lint**

Run: `bun run lint`
Expected: 无新增错误
