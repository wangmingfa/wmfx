# AI 浏览器 设计文档

> 状态：已定稿（待用户最终 review）
> 日期：2026-07-10
> 技术栈：Electron + TypeScript + Vite + Vue3 + WebContentsView + Mihomo

## 1. 定位与范围

### 产品路线
**路线 B —— 增强型浏览器 + AI（AI 后置）**：先做一个体验完整的 Chromium 浏览器，内置 Mihomo 代理面板作为核心差异化；AI 能力作为后期附加属性（Phase 5），当前只做接口/占位，不实现。

### MVP 范围：Phase 1 + 2 + 3
- **Phase 1**：窗口、标签、导航、地址栏、加载状态、favicon、多窗口
- **Phase 2**：下载、历史、书签、DevTools、打印、PDF、缩放、隐身
- **Phase 3**：Mihomo 代理（内核分发、订阅、节点切换、流量监控、日志、规则）

### 目标平台
跨平台：**Windows + macOS + Linux**（含 amd64 / arm64）。

### 代理定位
**浏览器内置代理面板**（Clash for Windows 理念）：在浏览器内切换节点 / 管理订阅 / 查看流量。默认只设置 Electron session 代理，不改系统全局代理（预留"设为系统代理"开关）。

## 2. 总体方案：渐进式 Monorepo

先按单体节奏快速开发，但代码结构按模块分离组织。`proxy` 模块（最大差异化点）从一开始就独立成包，便于测试与复用。AI 模块后期可直接插入，无需重构。

### 目录结构
```
browser/
├── apps/
│   ├── main/                     # Electron 主进程
│   │   └── src/
│   │       ├── index.ts          # 入口，启动 BrowserManager
│   │       ├── managers/         # 所有业务管理器
│   │       ├── ipc/              # IPC handler 注册
│   │       └── preload/          # preload 脚本（contextBridge）
│   └── renderer/                 # Vue3 渲染进程（浏览器 UI 外壳）
│       └── src/
│           ├── components/       # TabBar, AddressBar, Sidebar...
│           ├── views/            # Settings, Downloads, ProxyPanel...
│           ├── stores/           # Pinia 状态管理
│           └── ipc/              # 封装 window.browserAPI
├── packages/
│   ├── proxy/                    # ⭐ 独立：Mihomo 全套逻辑
│   ├── storage/                  # SQLite 封装 + 迁移
│   ├── shared/                   # 类型、常量、工具（主/渲染共享）
│   └── ipc-contract/             # IPC 通道类型定义（类型安全）
├── resources/
│   └── mihomo/                   # 三平台 Mihomo 内核 + 配置模板
├── docs/
└── scripts/                      # 构建、下载 mihomo 内核脚本
```

### 技术栈
| 层 | 选型 | 理由 |
|---|---|---|
| 桌面框架 | Electron (latest LTS) | Chromium 内核，跨平台 |
| 视图 | **WebContentsView** | Electron 新推荐 API，多标签性能好 |
| UI 框架 | Vue 3 + Vite + TypeScript | 需求指定 |
| 状态管理 | Pinia | Vue3 官方推荐 |
| 数据库 | better-sqlite3 | 同步 API，主进程用，性能好 |
| 轻量 KV | electron-store | 高频小状态（主题/窗口位置） |
| 代理内核 | Mihomo (Clash.Meta) | 核心卖点 |
| 包管理 | **pnpm workspace** | Electron 生态验证最充分，原生模块/打包零意外 |
| 打包 | electron-builder | 三平台打包 + extraResources |
| 测试 | Vitest + Playwright(Electron) | 单元 + E2E |

### 关键原则
- 渲染进程**绝不**直接操作 WebContentsView，全部走 IPC → 主进程管理器
- IPC **类型安全**：`packages/ipc-contract` 定义所有通道参数/返回类型，主/渲染共享
- Electron API 封装在管理器层，UI 与业务分离
- 一切可测试

## 3. 核心浏览器架构

### 进程与视图模型
```
Electron Main Process
  BrowserManager (总协调)
   ├── WindowManager   → 管理多个 BrowserWindow
   └── 每个 Window:
        ├── Chrome UI (Vue) = BrowserWindow 本体
        └── TabManager → N 个 WebContentsView
```
**一个浏览器窗口 = 1 个 Vue UI 外壳 + N 个 WebContentsView**。Vue 外壳负责标题栏/标签栏/地址栏/侧边栏/代理面板；每个网页是独立 `WebContentsView`，由主进程叠加到窗口，UI 只负责告知显示哪个及其位置。

### 标签页数据模型
```typescript
interface Tab {
  id: string;
  windowId: string;
  view: WebContentsView;        // 实际网页容器（仅主进程持有）
  sessionId: string;            // 归属的 session/partition
  state: {
    url: string;
    title: string;
    favicon: string | null;
    isLoading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    zoomFactor: number;
    isMuted: boolean;
    isAudioPlaying: boolean;
    isPinned: boolean;
  };
}
```
渲染进程只持有 `state` 的镜像（IPC 同步），不持有 view。

### 布局协调（难点）
WebContentsView 是覆盖在窗口上的原生层，不在 DOM 里：
1. Vue 里放空的 `<div id="browser-viewport">` 占位
2. Vue 用 ResizeObserver 监听该 div 的位置/尺寸
3. 通过 IPC 把 `{x, y, width, height}` 发给主进程
4. 主进程调用 `view.setBounds()` 精确嵌入
5. setBounds 调用节流，首屏隐藏防闪烁

### 会话隔离（SessionManager）
- **default**：普通浏览，持久化 partition
- **incognito**：内存 partition，关闭即焚
- 代理绑定 session：`session.setProxy()` 作用在 partition 级别，可实现"部分标签走代理"（后续增强）

## 4. Mihomo 代理模块（核心差异化）

`packages/proxy` 独立包：
```
packages/proxy/src/
├── ProxyManager.ts        # 对外总入口（主进程调用）
├── MihomoProcess.ts       # 子进程生命周期
├── CoreDownloader.ts      # 下载/更新 mihomo 内核
├── ConfigManager.ts       # 生成/合并 config.yaml
├── SubscriptionManager.ts # 订阅拉取/解析/更新
├── ApiClient.ts           # Mihomo RESTful API (:9090)
├── HealthChecker.ts       # 节点延迟测试
└── TrafficMonitor.ts      # 实时流量（WebSocket）
```

### 核心工作流
```
CoreDownloader 确认内核存在 (resources/mihomo/{platform}-{arch}/)
  ↓
ConfigManager 生成 config.yaml (mixed-port: 7890, external-controller: 127.0.0.1:9090)
  ↓
MihomoProcess.start() 拉起子进程
  ↓
ApiClient 连接 :9090 (等待就绪)
  ↓
session.setProxy({ proxyRules: 'http=127.0.0.1:7890;https=127.0.0.1:7890' })
  ↓
浏览器流量 → 7890 → Mihomo → 规则分流 → 出口节点
```

### 子模块职责
| 模块 | 关键能力 | 技术难点 |
|---|---|---|
| CoreDownloader | 首次启动下载对应平台内核（win/mac/linux × amd64/arm64），校验 sha256 | 版本管理、断点续传、加速源 |
| MihomoProcess | spawn 子进程、崩溃自动重启、退出清理 | 端口占用检测、僵尸进程、优雅退出 |
| ConfigManager | 基础配置 + 用户订阅合并、规则集管理 | YAML 合并策略、配置校验 |
| SubscriptionManager | 拉订阅 URL、解析 base64/clash 格式、定时更新 | 多格式兼容、流量信息解析 |
| ApiClient | 切节点、切模式(rule/global/direct)、查代理组 | 与内核状态同步 |
| HealthChecker | 对节点/节点组延迟测试 | 并发控制、超时处理 |
| TrafficMonitor | 通过 `/traffic` WS 推实时上下行速度 | WebSocket 重连、数据节流 |

### 跨平台二进制处理
- `resources/mihomo/{platform}-{arch}/mihomo(.exe)` 存放
- electron-builder `extraResources` 只打包目标平台内核
- `scripts/download-cores.ts` 按需拉取（CI 或本地）

### 系统代理策略
默认只设置 Electron session 代理（不碰系统全局代理，不影响其它应用），预留"设为系统代理"开关。

### 代理面板 UI（渲染进程）
Vue 侧边栏/独立视图，展示：当前节点 + 一键切换、代理组（选择器/自动测速组）、订阅管理（增删改 + 流量/到期）、实时流量图、模式切换（规则/全局/直连）、内核日志。

## 5. 数据存储与 IPC 契约

### 存储分层
```
packages/storage/src/
├── Database.ts          # better-sqlite3 连接单例
├── migrations/          # 版本化 schema 迁移
├── repositories/        # 每张表一个 Repository
└── kv/                  # 轻量 KV（electron-store）
```

### SQLite 表设计
| 表 | 关键字段 |
|---|---|
| settings | key, value(JSON), updated_at |
| history | id, url, title, favicon, visit_time, visit_count |
| bookmarks | id, parent_id(文件夹), title, url, position, created_at |
| downloads | id, url, filename, path, state, received_bytes, total_bytes, created_at |
| subscriptions | id, name, url, last_update, expire, upload, download, total |
| ai_memory | 预留，Phase 5 |

**KV（electron-store，非 SQLite）**：主题、窗口位置/尺寸、上次会话标签、代理选中节点等高频小状态。

### IPC 契约（类型安全）
`packages/ipc-contract` 定义所有通道，主/渲染共享类型：
```typescript
export interface IpcContract {
  'tab:create':   (opts: { url?: string }) => { tabId: string };
  'tab:close':    (tabId: string) => void;
  'tab:activate': (tabId: string) => void;
  'nav:goBack':   (tabId: string) => void;
  'nav:loadURL':  (tabId: string, url: string) => void;
  'proxy:switchNode': (groupName: string, nodeName: string) => void;
  'proxy:getTraffic': () => { up: number; down: number };
  'sub:add':      (url: string, name: string) => Subscription;
  'download:pause': (id: string) => void;
  'history:search': (query: string) => HistoryItem[];
  // ...
}
```

三类通信方向：
1. **invoke/handle**（渲染→主，有返回值）：切节点、查历史、加书签
2. **send/on**（渲染→主，无返回）：调整视图 bounds
3. **主→渲染广播**（`webContents.send`）：标签状态、下载进度、实时流量、代理状态

preload 用 `contextBridge` 暴露类型安全的 `window.browserAPI`。

### 安全基线
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- 加载的网页在受限 WebContentsView 中，无 Node 权限
- PermissionManager 拦截 camera/mic/location/notification/clipboard/filesystem 请求，弹 UI 让用户决定

## 6. 开发路线图

### 里程碑（Phase 1+2+3）
**M0 — 脚手架（第 1 周）**
- pnpm workspace + Electron + Vite + Vue3 + TS 跑起来
- 主/渲染/preload 三层通，类型安全 IPC 打通 demo 通道
- 安全基线配置

**M1 — 基础浏览（Phase 1，第 2-4 周）**
- WindowManager 单窗口 + TabManager 多标签(WebContentsView)
- 布局协调（div 占位 → setBounds）
- NavigationManager（前进/后退/刷新/停止/地址栏）
- 加载状态 + favicon + title 同步 + 多窗口

**M2 — 浏览增强（Phase 2，第 5-8 周）**
- DownloadManager（队列/暂停/续传/进度）
- HistoryManager + SQLite 落地
- BookmarkManager（文件夹/搜索/导入导出）
- 隐身模式、DevTools、打印、PDF、缩放
- SettingsManager + 设置界面

**M3 — Mihomo 代理（Phase 3，第 9-13 周）** ⭐
- CoreDownloader + 三平台内核分发
- MihomoProcess 生命周期 + ConfigManager
- session.setProxy 接入
- SubscriptionManager（拉取/解析/更新）
- ApiClient（节点/模式切换）
- HealthChecker + TrafficMonitor
- 代理面板 UI

**M4 — 打磨与打包（第 14-15 周）**
- 三平台 electron-builder 打包（含内核 extraResources）
- 崩溃恢复、会话恢复
- 性能优化、后台标签挂起

### 测试策略
- 单元测试：`packages/proxy`、`packages/storage`（Vitest）
- 集成测试：IPC 通道契约、Mihomo 启停流程
- E2E：Playwright for Electron（标签操作、导航、代理切换）

### 关键风险与对策
| 风险 | 对策 |
|---|---|
| WebContentsView 布局跟随卡顿 | setBounds 节流 + 首屏隐藏防闪烁 |
| Mihomo 内核跨平台兼容 | CI 矩阵测试三平台，内核版本锁定 |
| 原生模块(better-sqlite3)打包 | electron-rebuild + CI 预编译 |
| 多标签内存膨胀 | 后台标签定时挂起(view 释放策略) |
| 子进程僵尸/端口占用 | 启动前端口探测 + 退出 hook 清理 |

## 7. AI 预留（Phase 5，不实现）
- `packages/ai` 空壳 + `AIManager` 接口占位
- `ai:*` IPC 通道预留
- `ai_memory` 表预留
- 侧边栏 UI 预留入口位

## 8. 长期愿景
架构对标 Arc/Zen，保持干净的 Electron + Vue 生态。将 Mihomo、AI、下载、历史、会话、浏览器核心作为独立模块，最大化可维护性。
