# M1 基础浏览实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现单窗口多标签浏览器核心：TabManager（WebContentsView）+ NavigationManager + 布局协调 + 浏览器 UI 外壳

**Architecture:** 主进程 TabManager 管理 WebContentsView 生命周期，通过 IPC 与渲染进程通信；渲染进程用 ResizeObserver 监听 Viewport div 位置，通过 IPC 设置 setBounds；NavigationManager 持有 WebContentsView Map，转发导航操作

**Tech Stack:** Electron 43 + Vue 3.5 + TypeScript 5.9 + Vite 8 + bun

## Global Constraints

- Electron sandbox: true, contextIsolation: true, nodeIntegration: false
- 渲染进程不持有 view 引用，全部通过 IPC 操作
- IPC 通道在 packages/ipc-contract 中类型安全定义
- 标签页 tabId 格式：`tab-{uuid}`
- 默认 URL：`https://www.google.com`（可配置）
- 多窗口：每个 BrowserWindow 独立 TabManager 实例

---

### Task 1: IPC 契约扩展

**Files:**
- Modify: `packages/ipc-contract/src/channels.ts`
- Modify: `packages/ipc-contract/src/index.ts`

**Interfaces:**
- 新增 TabState, BrowserViewBounds 类型
- 扩展 IpcContract 包含 tab:*, nav:*, session:* 通道
- 扩展 IPC_CHANNELS 数组

- [ ] **Step 1: 扩展 channels.ts**

在 `packages/ipc-contract/src/channels.ts` 中添加：

```typescript
/** 标签页状态（渲染进程可见，不含 view 引用） */
export interface TabState {
  id: string;
  windowId: string;
  url: string;
  title: string;
  favicon: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  zoomFactor: number;
  isMuted: boolean;
  isPinned: boolean;
  active: boolean;
}

/** WebContentsView 在窗口中的位置/尺寸 */
export interface BrowserViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 标签创建参数 */
export interface CreateTabOptions {
  url?: string;
  sessionId?: string;
}
```

扩展 IpcContract：

```typescript
export interface IpcContract {
  'app:ping': (message: string) => string;
  // Tab
  'tab:create': (opts: CreateTabOptions) => TabState;
  'tab:close': (tabId: string) => void;
  'tab:activate': (tabId: string) => void;
  'tab:getState': (tabId: string) => TabState;
  'tab:getList': () => TabState[];
  'tab:setViewportBounds': (tabId: string, bounds: BrowserViewBounds) => void;
  // Navigation
  'nav:goBack': (tabId: string) => void;
  'nav:goForward': (tabId: string) => void;
  'nav:reload': (tabId: string) => void;
  'nav:stop': (tabId: string) => void;
  'nav:loadURL': (tabId: string, url: string) => void;
  // Session
  'session:getPartitions': () => string[];
}
```

- [ ] **Step 2: 扩展 index.ts**

在 `packages/ipc-contract/src/index.ts` 中导出新增类型：

```typescript
export { IPC_CHANNELS, isIpcChannel } from './channels'
export type { IpcContract, IpcChannel, IpcInvoke, TabState, BrowserViewBounds, CreateTabOptions } from './channels'
```

- [ ] **Step 3: 运行类型检查**

```bash
bun run build:ipc && bun run typecheck
```

Expected: PASS（ipc-contract 包类型检查通过）

- [ ] **Step 4: 提交**

```bash
git add packages/ipc-contract/src/channels.ts packages/ipc-contract/src/index.ts
git commit -m "feat(ipc-contract): extend with tab/nav/session channels"
```

---

### Task 2: SessionManager

**Files:**
- Create: `apps/main/src/session-manager.ts`

**Interfaces:**
- 管理 session/partition 隔离
- 支持 default（持久化）和 incognito（内存）

- [ ] **Step 1: 实现 SessionManager**

创建 `apps/main/src/session-manager.ts`：

```typescript
import { session } from 'electron'

export interface SessionConfig {
  name: string;
  partition: string;
  inMemory: boolean;
}

export class SessionManager {
  private sessions = new Map<string, SessionConfig>();

  constructor() {
    this.registerDefaultSession();
  }

  private registerDefaultSession(): void {
    this.sessions.set('default', {
      name: 'default',
      partition: 'persist:default',
      inMemory: false,
    });
    this.sessions.set('incognito', {
      name: 'incognito',
      partition: 'persist:incognito',
      inMemory: true,
    });
  }

  getSession(name: string): session.Session {
    const config = this.sessions.get(name);
    if (!config) {
      this.sessions.set(name, {
        name,
        partition: `persist:${name}`,
        inMemory: false,
      });
    }
    return session.fromPartition(config.partition, {
      cache: !config.inMemory,
    });
  }

  getPartitions(): string[] {
    return Array.from(this.sessions.keys());
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/main/src/session-manager.ts
git commit -m "feat(main): add SessionManager for partition isolation"
```

---

### Task 3: TabManager（核心）

**Files:**
- Create: `apps/main/src/tab-manager.ts`

**Interfaces:**
- 消费：SessionManager
- 产生：TabManager（提供 tab CRUD + state 广播）

- [ ] **Step 1: 实现 TabManager**

创建 `apps/main/src/tab-manager.ts`：

```typescript
import { BrowserWindow, WebContentsView } from 'electron'
import type { SessionConfig } from './session-manager'
import type { TabState, BrowserViewBounds } from '@browser/ipc-contract'

/** 完整的标签页信息（主进程私有，不含 view 暴露给渲染） */
interface Tab {
  id: string;
  windowId: string;
  view: WebContentsView;
  sessionId: string;
  state: Omit<TabState, 'active'>;
}

export class TabManager {
  private tabs = new Map<string, Tab>();
  private activeTabId: string | null = null;
  private tabCounter = 0;

  constructor(
    private window: BrowserWindow,
    private getSession: (name: string) => any,
    private defaultSessionName: string = 'default'
  ) {
    window.on('close', () => this.destroy());
  }

  /** 创建新标签页 */
  create(opts?: { url?: string; sessionId?: string }): TabState {
    const tabId = `tab-${++this.tabCounter}-${crypto.randomUUID().slice(0, 8)}`;
    const sessionId = opts?.sessionId || this.defaultSessionName;
    const tabSession = this.getSession(sessionId);

    const webContents = new WebContentsView({
      webPreferences: {
        session: tabSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const webContentsObj = webContents.webContents;

    // 监听导航事件
    webContentsObj.on('did-navigate', (_e, url) => {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.state.url = url || '';
        tab.state.canGoBack = webContentsObj.canGoBack();
        tab.state.canGoForward = webContentsObj.canGoForward();
        this.broadcastState(tab);
      }
    });

    webContentsObj.on('did-navigate-in-page', (_e, url) => {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.state.url = url || '';
        this.broadcastState(tab);
      }
    });

    webContentsObj.on('page-title-updated', (_e, _changed, title) => {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.state.title = title;
        this.broadcastState(tab);
      }
    });

    webContentsObj.on('page-favicon-updated', (_e, favicons) => {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.state.favicon = favicons[0] || null;
        this.broadcastState(tab);
      }
    });

    webContentsObj.on('did-start-loading', () => {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.state.isLoading = true;
        this.broadcastState(tab);
      }
    });

    webContentsObj.on('did-finish-load', () => {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.state.isLoading = false;
        this.broadcastState(tab);
      }
    });

    webContentsObj.on('did-fail-load', () => {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.state.isLoading = false;
        this.broadcastState(tab);
      }
    });

    const initialState: Omit<TabState, 'active'> = {
      id: tabId,
      windowId: String(this.window.id),
      url: opts?.url || '',
      title: '',
      favicon: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      zoomFactor: 1,
      isMuted: false,
      isPinned: false,
    };

    const tab: Tab = {
      id: tabId,
      windowId: String(this.window.id),
      view: webContents,
      sessionId,
      state: initialState,
    };

    this.tabs.set(tabId, tab);

    // 加载 URL
    if (opts?.url) {
      webContentsObj.loadURL(opts.url);
    }

    // 自动激活（第一个标签）
    if (!this.activeTabId) {
      this.activate(tabId);
    }

    this.window.webContents.send('tab:created', { ...initialState, active: false });

    return { ...initialState, active: this.activeTabId === tabId };
  }

  /** 关闭标签页 */
  close(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    const isActive = this.activeTabId === tabId;
    tab.view.webContents.destroy();
    this.tabs.delete(tabId);

    if (isActive) {
      // 激活下一个标签
      const remaining = Array.from(this.tabs.keys());
      if (remaining.length > 0) {
        this.activate(remaining[0]);
      } else {
        this.activeTabId = null;
        // 隐藏所有视图
        this.window.removeBrowserView(tab.view);
      }
    } else {
      // 非激活标签的 view 可能还在 window 中
      this.window.removeBrowserView(tab.view);
    }

    this.window.webContents.send('tab:removed', tabId);
  }

  /** 激活标签页 */
  activate(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    // 移除之前的激活视图
    if (this.activeTabId && this.activeTabId !== tabId) {
      const prev = this.tabs.get(this.activeTabId);
      if (prev) {
        this.window.removeBrowserView(prev.view);
      }
    }

    // 加入新视图
    this.window.addBrowserView(tab.view);
    this.activeTabId = tabId;

    // 更新 active 状态并广播
    for (const [id, t] of this.tabs) {
      const isActive = id === tabId;
      t.state.active = isActive;
      this.broadcastState(t);
    }
  }

  /** 设置标签页 view 的 bounds */
  setViewportBounds(tabId: string, bounds: BrowserViewBounds): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    tab.view.setBounds(bounds);
  }

  /** 获取标签页状态 */
  getState(tabId: string): TabState | null {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;
    return { ...tab.state, active: this.activeTabId === tabId };
  }

  /** 获取所有标签页状态 */
  getList(): TabState[] {
    return Array.from(this.tabs.values()).map(tab => ({
      ...tab.state,
      active: this.activeTabId === tab.id,
    }));
  }

  /** 获取激活的标签页 ID */
  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  /** 获取标签页的 webContents（供 NavigationManager 使用） */
  getWebContents(tabId: string): Electron.WebContents | null {
    const tab = this.tabs.get(tabId);
    return tab?.view.webContents || null;
  }

  /** 广播标签页状态到渲染进程 */
  private broadcastState(tab: Tab): void {
    const state: TabState = {
      ...tab.state,
      active: this.activeTabId === tab.id,
    };
    this.window.webContents.send('tab:state-change', state);
  }

  /** 销毁所有标签 */
  destroy(): void {
    for (const [tabId, tab] of this.tabs) {
      tab.view.webContents.destroy();
      this.window.removeBrowserView(tab.view);
    }
    this.tabs.clear();
    this.activeTabId = null;
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/main/src/tab-manager.ts
git commit -m "feat(main): add TabManager with WebContentsView lifecycle"
```

---

### Task 4: NavigationManager

**Files:**
- Create: `apps/main/src/navigation-manager.ts`

**Interfaces:**
- 消费：TabManager（getWebContents）
- 产生：NavigationManager

- [ ] **Step 1: 实现 NavigationManager**

创建 `apps/main/src/navigation-manager.ts`：

```typescript
import type { TabManager } from './tab-manager'

export class NavigationManager {
  constructor(private tabManager: TabManager) {}

  goBack(tabId: string): void {
    const wc = this.tabManager.getWebContents(tabId);
    wc?.goBack();
  }

  goForward(tabId: string): void {
    const wc = this.tabManager.getWebContents(tabId);
    wc?.goForward();
  }

  reload(tabId: string): void {
    const wc = this.tabManager.getWebContents(tabId);
    wc?.reload();
  }

  stop(tabId: string): void {
    const wc = this.tabManager.getWebContents(tabId);
    wc?.stop();
  }

  loadURL(tabId: string, url: string): void {
    const wc = this.tabManager.getWebContents(tabId);
    if (wc) {
      const normalized = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://') || url.startsWith('about:')
        ? url
        : `https://${url}`;
      wc.loadURL(normalized);
    }
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/main/src/navigation-manager.ts
git commit -m "feat(main): add NavigationManager for tab navigation"
```

---

### Task 5: IPC Handler 注册

**Files:**
- Modify: `apps/main/src/ipc/register.ts`
- Modify: `apps/main/src/index.ts`
- Modify: `apps/main/src/window-manager.ts`

**Interfaces:**
- 消费：TabManager, NavigationManager, SessionManager
- 产生：注册后的 IPC handlers

- [ ] **Step 1: 改造 window-manager.ts**

修改 `apps/main/src/window-manager.ts`：

```typescript
import { BrowserWindow } from 'electron'
import { getPreloadPath, getRendererDevServerUrl, getRendererIndexHtml } from './paths'
import { SessionManager } from './session-manager'
import { TabManager } from './tab-manager'
import { NavigationManager } from './navigation-manager'

export interface BrowserWindowInstance {
  window: BrowserWindow;
  tabManager: TabManager;
  navigationManager: NavigationManager;
}

export function createMainWindow(): BrowserWindowInstance {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const sessionManager = new SessionManager();
  const tabManager = new TabManager(win, (name) => sessionManager.getSession(name));
  const navigationManager = new NavigationManager(tabManager);

  win.once('ready-to-show', () => win.show());

  const devUrl = getRendererDevServerUrl();
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(getRendererIndexHtml());
  }

  return { window: win, tabManager, navigationManager };
}
```

- [ ] **Step 2: 扩展 ipc/register.ts**

修改 `apps/main/src/ipc/register.ts`：

```typescript
import type { IpcContract } from '@browser/ipc-contract'
import { ipcMain, BrowserWindow } from 'electron'

/** 类型安全的 handle 包装：约束通道名与处理函数签名一致。 */
function handle<K extends keyof IpcContract>(
  channel: K,
  handler: (
    ...args: Parameters<IpcContract[K]>
  ) => ReturnType<IpcContract[K]> | Promise<ReturnType<IpcContract[K]>>
): void {
  ipcMain.handle(channel, (_event, ...args) => handler(...(args as Parameters<IpcContract[K]>)))
}

/** 全局状态：存储所有窗口实例，IPC handler 通过它访问 */
declare global {
  var browserInstances: Map<string, { tabManager: any; navigationManager: any; window: BrowserWindow }>;
}
globalThis.browserInstances = new Map();

export function registerIpcHandlers(): void {
  handle('app:ping', (message) => `pong: ${message}`);

  handle('tab:create', (opts) => {
    const sender = BrowserWindow.getFocusedWindow();
    if (!sender) throw new Error('No focused window');
    const winId = String(sender.id);
    const inst = globalThis.browserInstances.get(winId);
    if (!inst) throw new Error(`No instance for window ${winId}`);
    return inst.tabManager.create(opts);
  });

  handle('tab:close', (tabId) => {
    const sender = BrowserWindow.getFocusedWindow();
    if (!sender) throw new Error('No focused window');
    const winId = String(sender.id);
    const inst = globalThis.browserInstances.get(winId);
    if (!inst) throw new Error(`No instance for window ${winId}`);
    inst.tabManager.close(tabId);
  });

  handle('tab:activate', (tabId) => {
    const sender = BrowserWindow.getFocusedWindow();
    if (!sender) throw new Error('No focused window');
    const winId = String(sender.id);
    const inst = globalThis.browserInstances.get(winId);
    if (!inst) throw new Error(`No instance for window ${winId}`);
    inst.tabManager.activate(tabId);
  });

  handle('tab:getState', (tabId) => {
    const sender = BrowserWindow.getFocusedWindow();
    if (!sender) throw new Error('No focused window');
    const winId = String(sender.id);
    const inst = globalThis.browserInstances.get(winId);
    if (!inst) throw new Error(`No instance for window ${winId}`);
    const state = inst.tabManager.getState(tabId);
    if (!state) throw new Error(`Tab ${tabId} not found`);
    return state;
  });

  handle('tab:getList', () => {
    const sender = BrowserWindow.getFocusedWindow();
    if (!sender) throw new Error('No focused window');
    const winId = String(sender.id);
    const inst = globalThis.browserInstances.get(winId);
    if (!inst) throw new Error(`No instance for window ${winId}`);
    return inst.tabManager.getList();
  });

  handle('tab:setViewportBounds', (tabId, bounds) => {
    const sender = BrowserWindow.getFocusedWindow();
    if (!sender) throw new Error('No focused window');
    const winId = String(sender.id);
    const inst = globalThis.browserInstances.get(winId);
    if (!inst) throw new Error(`No instance for window ${winId}`);
    inst.tabManager.setViewportBounds(tabId, bounds);
  });

  handle('nav:goBack', (tabId) => {
    const sender = BrowserWindow.getFocusedWindow();
    if (!sender) throw new Error('No focused window');
    const winId = String(sender.id);
    const inst = globalThis.browserInstances.get(winId);
    if (!inst) throw new Error(`No instance for window ${winId}`);
    inst.navigationManager.goBack(tabId);
  });

  handle('nav:goForward', (tabId) => {
    const sender = BrowserWindow.getFocusedWindow();
    if (!sender) throw new Error('No focused window');
    const winId = String(sender.id);
    const inst = globalThis.browserInstances.get(winId);
    if (!inst) throw new Error(`No instance for window ${winId}`);
    inst.navigationManager.goForward(tabId);
  });

  handle('nav:reload', (tabId) => {
    const sender = BrowserWindow.getFocusedWindow();
    if (!sender) throw new Error('No focused window');
    const winId = String(sender.id);
    const inst = globalThis.browserInstances.get(winId);
    if (!inst) throw new Error(`No instance for window ${winId}`);
    inst.navigationManager.reload(tabId);
  });

  handle('nav:stop', (tabId) => {
    const sender = BrowserWindow.getFocusedWindow();
    if (!sender) throw new Error('No focused window');
    const winId = String(sender.id);
    const inst = globalThis.browserInstances.get(winId);
    if (!inst) throw new Error(`No instance for window ${winId}`);
    inst.navigationManager.stop(tabId);
  });

  handle('nav:loadURL', (tabId, url) => {
    const sender = BrowserWindow.getFocusedWindow();
    if (!sender) throw new Error('No focused window');
    const winId = String(sender.id);
    const inst = globalThis.browserInstances.get(winId);
    if (!inst) throw new Error(`No instance for window ${winId}`);
    inst.navigationManager.loadURL(tabId, url);
  });

  handle('session:getPartitions', () => {
    return ['default', 'incognito'];
  });
}
```

- [ ] **Step 3: 改造 index.ts**

修改 `apps/main/src/index.ts`：

```typescript
import { app, BrowserWindow } from 'electron'
import { registerIpcHandlers } from './ipc/register'
import { createMainWindow } from './window-manager'

app.whenReady().then(() => {
  registerIpcHandlers()

  // 初始化管理器实例
  const mainWindow = createMainWindow();
  globalThis.browserInstances.set(String(mainWindow.window.id), mainWindow);

  // 打开默认标签页
  mainWindow.tabManager.create({ url: 'https://www.google.com' });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createMainWindow();
      globalThis.browserInstances.set(String(win.window.id), win);
      win.tabManager.create({ url: 'https://www.google.com' });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

- [ ] **Step 4: 提交**

```bash
git add apps/main/src/ipc/register.ts apps/main/src/index.ts apps/main/src/window-manager.ts
git commit -m "feat(main): wire up TabManager/NavigationManager with IPC handlers"
```

---

### Task 6: preload.ts 扩展

**Files:**
- Modify: `apps/main/src/preload.ts`

**Interfaces:**
- 产生：扩展后的 window.browserAPI

- [ ] **Step 1: 扩展 preload.ts**

修改 `apps/main/src/preload.ts`：

```typescript
import type { IpcInvoke, TabState, CreateTabOptions, BrowserViewBounds } from '@browser/ipc-contract'
import { contextBridge, ipcRenderer } from 'electron'

const api: IpcInvoke & {
  // Tab
  createTab: (opts: CreateTabOptions) => Promise<TabState>;
  closeTab: (tabId: string) => Promise<void>;
  activateTab: (tabId: string) => Promise<void>;
  getState: (tabId: string) => Promise<TabState>;
  getList: () => Promise<TabState[]>;
  setViewportBounds: (tabId: string, bounds: BrowserViewBounds) => void;
  // Navigation
  goBack: (tabId: string) => Promise<void>;
  goForward: (tabId: string) => Promise<void>;
  reload: (tabId: string) => Promise<void>;
  stop: (tabId: string) => Promise<void>;
  loadURL: (tabId: string, url: string) => Promise<void>;
  // Session
  getPartitions: () => Promise<string[]>;
  // 事件监听（非类型安全，用 Function 替代）
  onTabStateChange: (cb: (state: TabState) => void) => void;
  onTabCreated: (cb: (state: TabState) => void) => void;
  onTabRemoved: (cb: (tabId: string) => void) => void;
  removeListener: (channel: string, cb: (channel: string, ...args: any[]) => void) => void;
} = {
  ping: (message) => ipcRenderer.invoke('app:ping', message),
  createTab: (opts) => ipcRenderer.invoke('tab:create', opts),
  closeTab: (tabId) => ipcRenderer.invoke('tab:close', tabId),
  activateTab: (tabId) => ipcRenderer.invoke('tab:activate', tabId),
  getState: (tabId) => ipcRenderer.invoke('tab:getState', tabId),
  getList: () => ipcRenderer.invoke('tab:getList'),
  setViewportBounds: (tabId, bounds) => ipcRenderer.send('tab:setViewportBounds', tabId, bounds),
  goBack: (tabId) => ipcRenderer.invoke('nav:goBack', tabId),
  goForward: (tabId) => ipcRenderer.invoke('nav:goForward', tabId),
  reload: (tabId) => ipcRenderer.invoke('nav:reload', tabId),
  stop: (tabId) => ipcRenderer.invoke('nav:stop', tabId),
  loadURL: (tabId, url) => ipcRenderer.invoke('nav:loadURL', tabId, url),
  getPartitions: () => ipcRenderer.invoke('session:getPartitions'),
  onTabStateChange: (cb) => ipcRenderer.on('tab:state-change', (_e, state) => cb(state as TabState)),
  onTabCreated: (cb) => ipcRenderer.on('tab:created', (_e, state) => cb(state as TabState)),
  onTabRemoved: (cb) => ipcRenderer.on('tab:removed', (_e, tabId) => cb(tabId as string)),
  removeListener: (channel, cb) => ipcRenderer.removeListener(channel, cb),
};

contextBridge.exposeInMainWorld('browserAPI', api);
```

- [ ] **Step 2: 提交**

```bash
git add apps/main/src/preload.ts
git commit -m "feat(main): extend preload with tab/nav/session browserAPI"
```

---

### Task 7: Vue 组件 — Viewport

**Files:**
- Create: `apps/renderer/src/components/Viewport.vue`

**Interfaces:**
- 消费：window.browserAPI.setViewportBounds, ResizeObserver

- [ ] **Step 1: 实现 Viewport.vue**

创建 `apps/renderer/src/components/Viewport.vue`：

```vue
<template>
  <div
    ref="viewportRef"
    id="browser-viewport"
    style="flex: 1; min-height: 0; width: 100%; height: 100%"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  tabId: string;
}>()

const viewportRef = ref<HTMLElement>()
let resizeObserver: ResizeObserver | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function sendBounds(): void {
  if (!viewportRef.value) return
  const rect = viewportRef.value.getBoundingClientRect()
  const winRect = window.getBoundingClientRect()

  window.browserAPI.setViewportBounds(props.tabId, {
    x: rect.left - winRect.left,
    y: rect.top - winRect.top,
    width: rect.width,
    height: rect.height,
  })
}

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(sendBounds, 30)
  })
  resizeObserver.observe(viewportRef.value!)
  sendBounds()
})

onUnmounted(() => {
  if (resizeObserver && viewportRef.value) {
    resizeObserver.unobserve(viewportRef.value)
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
})
</script>
```

- [ ] **Step 2: 提交**

```bash
git add apps/renderer/src/components/Viewport.vue
git commit -m "feat(renderer): add Viewport component with ResizeObserver"
```

---

### Task 8: Vue 组件 — TabBar

**Files:**
- Create: `apps/renderer/src/components/TabBar.vue`

**Interfaces:**
- 消费：window.browserAPI (activateTab, closeTab, createTab, getList, onTabStateChange, onTabCreated, onTabRemoved)

- [ ] **Step 1: 实现 TabBar.vue**

创建 `apps/renderer/src/components/TabBar.vue`：

```vue
<template>
  <div class="tab-bar">
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="tab-item"
      :class="{ active: tab.active }"
      @click="activateTab(tab.id)"
    >
      <span v-if="tab.favicon" class="tab-favicon">
        <img :src="tab.favicon" :alt="tab.title" />
      </span>
      <span class="tab-title">{{ tab.title || 'New Tab' }}</span>
      <span class="tab-loading" v-if="tab.isLoading">●</span>
      <button class="tab-close" @click.stop="closeTab(tab.id)">×</button>
    </div>
    <button class="tab-new" @click="createTab">+</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { TabState } from '@browser/ipc-contract'

const tabs = ref<TabState[]>([])

async function loadTabs(): Promise<void> {
  tabs.value = await window.browserAPI.getList()
}

function activateTab(tabId: string): void {
  window.browserAPI.activateTab(tabId)
}

function closeTab(tabId: string): void {
  window.browserAPI.closeTab(tabId)
}

function createTab(): void {
  window.browserAPI.createTab({ url: 'https://www.google.com' })
}

let stateChangeHandler: (state: TabState) => void
let createdHandler: (state: TabState) => void
let removedHandler: (tabId: string) => void

onMounted(() => {
  loadTabs()

  stateChangeHandler = (state: TabState) => {
    const idx = tabs.value.findIndex((t) => t.id === state.id)
    if (idx >= 0) {
      tabs.value[idx] = state
    } else {
      tabs.value.push(state)
    }
  }

  createdHandler = (state: TabState) => {
    if (!tabs.value.find((t) => t.id === state.id)) {
      tabs.value.push(state)
    }
  }

  removedHandler = (tabId: string) => {
    tabs.value = tabs.value.filter((t) => t.id !== tabId)
  }

  window.browserAPI.onTabStateChange(stateChangeHandler)
  window.browserAPI.onTabCreated(createdHandler)
  window.browserAPI.onTabRemoved(removedHandler)
})

onUnmounted(() => {
  window.browserAPI.removeListener('tab:state-change', stateChangeHandler)
  window.browserAPI.removeListener('tab:created', createdHandler)
  window.browserAPI.removeListener('tab:removed', removedHandler)
})
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  height: 32px;
  background: #2d2d2d;
  border-bottom: 1px solid #1a1a1a;
  padding: 0 8px;
}

.tab-item {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  margin-right: 2px;
  background: #3d3d3d;
  border-radius: 6px;
  cursor: pointer;
  min-width: 120px;
  max-width: 200px;
}

.tab-item.active {
  background: #4a4a4a;
}

.tab-favicon img {
  width: 16px;
  height: 16px;
  margin-right: 6px;
}

.tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: #e0e0e0;
}

.tab-loading {
  color: #4fc3f7;
  margin-left: 4px;
  font-size: 10px;
}

.tab-close {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  margin-left: 4px;
}

.tab-close:hover {
  color: #ff5555;
}

.tab-new {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  font-size: 18px;
  padding: 0 8px;
  margin-left: 4px;
}

.tab-new:hover {
  color: #4fc3f7;
}
</style>
```

- [ ] **Step 2: 提交**

```bash
git add apps/renderer/src/components/TabBar.vue
git commit -m "feat(renderer): add TabBar component"
```

---

### Task 9: Vue 组件 — AddressBar

**Files:**
- Create: `apps/renderer/src/components/AddressBar.vue`

**Interfaces:**
- 消费：window.browserAPI (goBack, goForward, reload, stop, loadURL)

- [ ] **Step 1: 实现 AddressBar.vue**

创建 `apps/renderer/src/components/AddressBar.vue`：

```vue
<template>
  <div class="address-bar">
    <button class="nav-btn" :disabled="!canGoBack" @click="goBack">←</button>
    <button class="nav-btn" :disabled="!canGoForward" @click="goForward">→</button>
    <button class="nav-btn" @click="isLoading ? stop : reload">{{ isLoading ? '■' : '↻' }}</button>
    <input
      ref="inputRef"
      v-model="urlInput"
      class="url-input"
      placeholder="Enter URL"
      @keydown.enter="navigate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  tabId: string;
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}>()

const emit = defineEmits<{
  navigate: [url: string];
}>()

const urlInput = ref(props.url)

watch(
  () => props.url,
  (newUrl) => {
    if (newUrl !== urlInput.value) {
      urlInput.value = newUrl
    }
  }
)

function goBack(): void {
  window.browserAPI.goBack(props.tabId)
}

function goForward(): void {
  window.browserAPI.goForward(props.tabId)
}

function reload(): void {
  window.browserAPI.reload(props.tabId)
}

function stop(): void {
  window.browserAPI.stop(props.tabId)
}

function navigate(): void {
  const url = urlInput.value.trim()
  if (url) {
    window.browserAPI.loadURL(props.tabId, url)
    emit('navigate', url)
  }
}
</script>

<style scoped>
.address-bar {
  display: flex;
  align-items: center;
  height: 40px;
  background: #2d2d2d;
  border-bottom: 1px solid #1a1a1a;
  padding: 0 8px;
  gap: 4px;
}

.nav-btn {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 4px;
}

.nav-btn:disabled {
  color: #555;
  cursor: default;
}

.nav-btn:not(:disabled):hover {
  background: #3d3d3d;
  color: #4fc3f7;
}

.url-input {
  flex: 1;
  height: 28px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 14px;
  padding: 0 12px;
  color: #e0e0e0;
  font-size: 13px;
  outline: none;
}

.url-input:focus {
  border-color: #4fc3f7;
}

.url-input::placeholder {
  color: #666;
}
</style>
```

- [ ] **Step 2: 提交**

```bash
git add apps/renderer/src/components/AddressBar.vue
git commit -m "feat(renderer): add AddressBar component"
```

---

### Task 10: Vue 组件 — ChromeUI + App.vue 改造

**Files:**
- Create: `apps/renderer/src/components/ChromeUI.vue`
- Modify: `apps/renderer/src/App.vue`

**Interfaces:**
- 合并 TabBar + AddressBar + Viewport

- [ ] **Step 1: 实现 ChromeUI.vue**

创建 `apps/renderer/src/components/ChromeUI.vue`：

```vue
<template>
  <div class="chrome-ui">
    <TabBar />
    <AddressBar
      v-if="activeTab"
      :tab-id="activeTab.id"
      :url="activeTab.url"
      :can-go-back="activeTab.canGoBack"
      :can-go-forward="activeTab.canGoForward"
      :is-loading="activeTab.isLoading"
    />
    <Viewport v-if="activeTab" :tab-id="activeTab.id" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { TabState } from '@browser/ipc-contract'
import TabBar from './TabBar.vue'
import AddressBar from './AddressBar.vue'
import Viewport from './Viewport.vue'

const activeTab = ref<TabState | null>(null)

async function syncActiveTab(): Promise<void> {
  const tabs = await window.browserAPI.getList()
  const active = tabs.find((t) => t.active)
  if (active) {
    activeTab.value = active
  }
}

let stateChangeHandler: (state: TabState) => void

onMounted(() => {
  syncActiveTab()

  stateChangeHandler = (state: TabState) => {
    if (state.active) {
      activeTab.value = state
    }
  }

  window.browserAPI.onTabStateChange(stateChangeHandler)
})

onUnmounted(() => {
  window.browserAPI.removeListener('tab:state-change', stateChangeHandler)
})
</script>

<style scoped>
.chrome-ui {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1e1e1e;
}
</style>
```

- [ ] **Step 2: 改造 App.vue**

修改 `apps/renderer/src/App.vue`：

```vue
<template>
  <ChromeUI />
</template>

<script setup lang="ts">
import ChromeUI from './components/ChromeUI.vue'
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
  width: 100%;
  background: #1e1e1e;
  color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
</style>
```

- [ ] **Step 3: 提交**

```bash
git add apps/renderer/src/components/ChromeUI.vue apps/renderer/src/App.vue
git commit -m "feat(renderer): add ChromeUI and wire up tab navigation"
```

---

### Task 11: 构建验证 + E2E

**Files:**
- Modify: `e2e/app.spec.ts`

**Interfaces:**
- 验证整套流程

- [ ] **Step 1: 构建所有包**

```bash
bun run build
```

Expected: 所有包构建通过

- [ ] **Step 2: 类型检查**

```bash
bun run typecheck
```

Expected: PASS

- [ ] **Step 3: 更新 E2E 测试**

修改 `e2e/app.spec.ts`，将 ping 测试改为标签页测试（保留 ping 作为基本连通性测试）：

```typescript
import { test, expect } from '@playwright/test'

test('app launches and creates tabs', async ({ page }) => {
  // 验证页面加载
  await expect(page).toHaveTitle(/WMFX/)

  // 验证标签栏存在
  const tabBar = page.locator('.tab-bar')
  await expect(tabBar).toBeVisible()

  // 验证默认标签页存在
  const tabs = page.locator('.tab-item')
  await expect(tabs).toHaveCount(1)
})

test('ping main process', async ({ page }) => {
  await expect(page).toHaveTitle(/WMFX/)

  const pingBtn = page.locator('[data-testid="ping-btn"]')
  await expect(pingBtn).toBeVisible()

  await pingBtn.click()

  const pong = page.locator('[data-testid="pong"]')
  await expect(pong).toHaveText('pong: hello from renderer')
})
```

- [ ] **Step 4: 运行 E2E**

```bash
bun run test:e2e
```

Expected: 测试通过（应用启动 + 标签页可见 + ping 连通）

- [ ] **Step 5: 提交**

```bash
git add e2e/app.spec.ts
git commit -m "test(e2e): add tab and ping tests"
```

---

### Task 12: lint + 最终验证

**Files:**

- [ ] **Step 1: lint**

```bash
bun run lint
```

Expected: PASS（如有错误修复）

- [ ] **Step 2: 最终构建**

```bash
bun run build
```

Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "chore: fix lint issues before M1 merge"
```

---

## 总结

M1 共 12 个任务：

| Task | 组件 | 说明 |
|------|------|------|
| 1 | ipc-contract | 扩展 TabState / BrowserViewBounds / IpcContract |
| 2 | session-manager | SessionManager（partition 隔离） |
| 3 | tab-manager | TabManager（WebContentsView 生命周期） |
| 4 | navigation-manager | NavigationManager（导航操作） |
| 5 | ipc register + window-manager + index | 注册 handler，改造入口 |
| 6 | preload | 扩展 browserAPI |
| 7 | Viewport | ResizeObserver → setBounds |
| 8 | TabBar | 标签栏 UI |
| 9 | AddressBar | 地址栏 UI |
| 10 | ChromeUI + App.vue | 合并容器 + 改造入口 |
| 11 | E2E 测试 | 构建 + 测试 |
| 12 | lint + 验证 | 最终检查 |

## 验收标准

- [ ] 应用启动后显示 TabBar + AddressBar + Viewport（ChromeUI）
- [ ] 默认打开一个标签，加载 https://www.google.com
- [ ] 可以新建标签，标签栏显示
- [ ] 点击标签切换，WebContentsView 正确叠加显示
- [ ] 地址栏输入 URL 并回车，标签页加载页面
- [ ] 前进/后退按钮正常工作
- [ ] 刷新/停止按钮正常工作
- [ ] 标签页 title/favicon 随导航更新
- [ ] 标签页关闭后正确销毁
- [ ] 可以创建第二个浏览器窗口
- [ ] 所有 lint/typecheck 通过
- [ ] E2E 测试通过
