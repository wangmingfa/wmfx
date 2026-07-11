# M1 — 基础浏览（Phase 1）

> 状态：已定稿（待用户最终 review）
> 日期：2026-07-11
> 依赖：M0 脚手架已完成

## 1. 目标

实现单窗口多标签浏览器核心功能：标签页管理（WebContentsView）、导航（前进/后退/刷新/停止/地址栏）、布局协调（div 占位 → setBounds），为 M2（下载/历史/书签）打下基础。

## 2. 范围

### 做
- **TabManager**：标签 CRUD，每个标签 = 一个 WebContentsView
- **SessionManager**：default / incognito partition 隔离
- **NavigationManager**：goBack / goForward / reload / stop / loadURL
- **布局协调**：Vue ResizeObserver → IPC → setBounds
- **TabBar / AddressBar / Viewport / ChromeUI** Vue 组件
- **IPC 契约扩展**：tab:*, nav:*, session:* 通道
- **TabState 同步**：主进程 → 渲染进程广播
- 多窗口（WindowManager 支持创建多个 BrowserWindow，每个独立 TabManager）

### 不做（M2+）
- 下载、历史、书签、DevTools、打印、PDF、缩放
- 代理面板
- 会话恢复

## 3. 模块设计

### 3.1 TabManager

**职责**：管理一个 BrowserWindow 内的多个标签页（WebContentsView）。

**数据结构**：
```typescript
interface Tab {
  id: string;
  windowId: string;
  view: WebContentsView;
  sessionId: string;
  state: {
    url: string;
    title: string;
    favicon: string | null;
    isLoading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    zoomFactor: number;
    isMuted: boolean;
    isPinned: boolean;
  };
}
```

**关键方法**：
| 方法 | 说明 |
|------|------|
| `createTab(opts?: { url?: string; sessionId?: string })` | 创建 WebContentsView，设置 session，监听事件，加载 URL，推送 tab:created |
| `closeTab(tabId)` | 销毁 view，移除 Map，推送 tab:removed |
| `activateTab(tabId)` | 将 view 加入 BrowserWindow，移除其他 view，更新 active 状态 |
| `getTab(tabId)` | 获取 Tab 对象 |
| `getTabs()` | 返回所有 Tab（仅 state 部分，不含 view 引用） |
| `getActiveTab()` | 返回当前激活的 Tab |
| `setViewportBounds(tabId, rect)` | 设置 view.setBounds |

**事件监听**（每个 view 挂载）：
- `did-navigate` → url / title 更新
- `did-finish-load` / `did-start-loading` → isLoading
- `page-title-updated` → title
- `page-favicon-updated` → favicon
- `did-navigate-in-page` → url 更新（SPA）

**状态广播**：每次 TabState 变化，通过 `win.webContents.send('tab:state-change', tabState)` 推送给渲染进程。

### 3.2 SessionManager

**职责**：管理浏览器 session/partition，支持 default 和 incognito。

```typescript
interface SessionConfig {
  name: string;          // 'default' | 'incognito' | custom
  partition: string;     // Electron session partition
  inMemory: boolean;     // true → 内存 partition，关闭即焚
}
```

**关键方法**：
| 方法 | 说明 |
|------|------|
| `createSession(name)` | 创建或获取 session |
| `getSession(name)` | 获取 session |
| `setProxy(sessionName, proxy)` | 为指定 session 设置代理（M3 预备） |

**默认配置**：
- `default`：partition='persist:default'，持久化
- `incognito`：partition='persist:incognito'，内存

### 3.3 NavigationManager

**职责**：封装 WebContents 的导航操作，通过 tabId 路由到对应 view。

```typescript
interface NavigationManager {
  goBack(tabId: string): void;
  goForward(tabId: string): void;
  reload(tabId: string): void;
  stop(tabId: string): void;
  loadURL(tabId: string, url: string): void;
}
```

内部持有 `Map<string, WebContentsView>`，转发到对应 view 的 webContents 方法。

### 3.4 WindowManager（改造）

当前 `window-manager.ts` 仅创建裸 BrowserWindow。改造为：

```typescript
interface BrowserWindowInstance {
  window: BrowserWindow;
  tabManager: TabManager;
  navigationManager: NavigationManager;
}

function createMainWindow(): BrowserWindowInstance {
  const win = new BrowserWindow({ /* 现有配置 */ });
  const tabManager = new TabManager(win);
  const navigationManager = new NavigationManager(tabManager);
  return { window: win, tabManager, navigationManager };
}
```

支持 `createNewWindow()` 创建新窗口，返回新的 BrowserWindowInstance。

### 3.5 IPC 契约扩展

在 `packages/ipc-contract/src/channels.ts` 中扩展：

```typescript
export interface IpcContract {
  // 已有
  'app:ping': (message: string) => string;
  // Tab
  'tab:create': (opts: { url?: string; sessionId?: string }) => { tabId: string };
  'tab:close': (tabId: string) => void;
  'tab:activate': (tabId: string) => void;
  'tab:getState': (tabId: string) => TabState;
  'tab:getList': () => TabState[];
  'tab:setViewportBounds': (tabId: string, rect: BrowserViewBounds) => void;
  // Navigation
  'nav:goBack': (tabId: string) => void;
  'nav:goForward': (tabId: string) => void;
  'nav:reload': (tabId: string) => void;
  'nav:stop': (tabId: string) => void;
  'nav:loadURL': (tabId: string, url: string) => void;
  // Session
  'session:getPartitions': () => string[];
}

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

export interface BrowserViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

### 3.6 渲染进程组件

**ChromeUI**（合并容器）：
```
┌─────────────────────────────────┐
│  TabBar                         │  ← 标签栏：标签列表 + 新建 + 标题/favicon
├─────────────────────────────────┤
│  AddressBar                     │  ← 地址栏：前进/后退/刷新/停止 + 输入框
├─────────────────────────────────┤
│  Viewport                       │  ← <div> 占位，ResizeObserver → setBounds
│  (WebContentsView 叠加)          │
│                                 │
│                                 │
│                                 │
│                                 │
│                                 │
│                                 │
└─────────────────────────────────┘
```

**TabBar.vue**：
- 显示 TabState 列表（id, title, favicon, active, isLoading, isPinned）
- 点击标签 → invoke tab:activate
- 双击关闭 / 右键菜单（关闭/关闭其他/关闭右侧）
- 新建标签 → invoke tab:create

**AddressBar.vue**：
- 输入框：Enter → invoke nav:loadURL
- 按钮：后退(goBack) / 前进(goForward) / 刷新(reload) / 停止(stop)
- 根据 canGoBack/canGoForward 禁用对应按钮
- isLoading → 刷新按钮变停止按钮

**Viewport.vue**：
- `<div id="browser-viewport" style="flex: 1; min-height: 0">` 占位
- ResizeObserver 监听 rect，通过 `window.browserAPI.setViewportBounds(activeTabId, rect)` 通知主进程
- 30ms debounce

### 3.7 preload.ts 扩展

```typescript
contextBridge.exposeInMainWorld('browserAPI', {
  // 已有
  ping: (message) => ipcRenderer.invoke('app:ping', message),
  // Tab
  createTab: (opts) => ipcRenderer.invoke('tab:create', opts),
  closeTab: (tabId) => ipcRenderer.invoke('tab:close', tabId),
  activateTab: (tabId) => ipcRenderer.invoke('tab:activate', tabId),
  getState: (tabId) => ipcRenderer.invoke('tab:getState', tabId),
  getList: () => ipcRenderer.invoke('tab:getList'),
  setViewportBounds: (tabId, rect) => ipcRenderer.send('tab:setViewportBounds', tabId, rect),
  // Navigation
  goBack: (tabId) => ipcRenderer.invoke('nav:goBack', tabId),
  goForward: (tabId) => ipcRenderer.invoke('nav:goForward', tabId),
  reload: (tabId) => ipcRenderer.invoke('nav:reload', tabId),
  stop: (tabId) => ipcRenderer.invoke('nav:stop', tabId),
  loadURL: (tabId, url) => ipcRenderer.invoke('nav:loadURL', tabId, url),
  // Session
  getPartitions: () => ipcRenderer.invoke('session:getPartitions'),
  // 事件监听
  onTabStateChange: (cb) => ipcRenderer.on('tab:state-change', (_, tabState) => cb(tabState)),
  onTabCreated: (cb) => ipcRenderer.on('tab:created', (_, tabState) => cb(tabState)),
  onTabRemoved: (cb) => ipcRenderer.on('tab:removed', (_, tabId) => cb(tabId)),
  // 事件移除
  removeListener: (channel, cb) => ipcRenderer.removeListener(channel, cb),
});
```

## 4. 数据流

```
渲染进程                              主进程
┌──────────────┐                    ┌──────────────────────────┐
│ TabBar       │                    │ TabManager               │
│ AddressBar   │────invoke─────→    │   ├─ Map<string, Tab>   │
│ Viewport     │────send(view)────→  │   ├─ createTab()        │
│              │                    │   ├─ closeTab()          │
│              │←──tab:created─────│   ├─ activateTab()       │
│              │←──tab:state-change│   └─ setViewportBounds()  │
│              │←──tab:removed─────│                        │
└──────────────┘                    └──────────────────────────┘
                                       ┌──────────────────┐
                                       │ NavigationManager│
                                       │   └─ goBack()    │
                                       │   └─ goForward() │
                                       │   └─ reload()    │
                                       │   └─ stop()      │
                                       │   └─ loadURL()   │
                                       └──────────────────┘
```

## 5. 安全

- 继承 M0 的安全基线：contextIsolation: true, nodeIntegration: false, sandbox: true
- WebContentsView 中加载的网页在受限环境中，无 Node 权限
- preload 只暴露经定义的 browserAPI，不暴露其他 ipcRenderer 方法

## 6. 测试策略

### 单元测试
- TabManager：create/close/activate 状态流转
- NavigationManager：方法转发正确性
- SessionManager：partition 创建/获取

### E2E（Playwright）
- 启动应用 → 验证默认标签页存在
- 点击新建 → 验证标签数量 +1
- 地址栏输入 URL → Enter → 验证页面加载
- 点击后退 → 验证导航历史
- 点击关闭 → 验证标签数量 -1
- 设置 bounds → 验证 setBounds 被调用

## 7. 依赖

- `electron`（已安装，v43.1.0）
- `@browser/ipc-contract`（已存在，需扩展）
- `@browser/shared`（已存在，可放 TabState/BrowserViewBounds 类型）
- Vue 3 + Vite + TypeScript（已安装）

## 8. 验收标准

- [ ] 应用启动后显示 TabBar + AddressBar + Viewport（ChromeUI）
- [ ] 默认打开一个标签，加载 about:blank 或用户指定 URL
- [ ] 可以新建标签，标签栏显示
- [ ] 点击标签切换，WebContentsView 正确叠加显示
- [ ] 地址栏输入 URL 并回车，标签页加载页面
- [ ] 前进/后退按钮正常工作
- [ ] 刷新/停止按钮正常工作
- [ ] 标签页 title/favicon 随导航更新
- [ ] 标签页关闭后正确销毁
- [ ] 可以创建第二个浏览器窗口
