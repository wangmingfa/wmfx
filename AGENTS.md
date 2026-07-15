# Project Conventions

## Package Manager
- Use `bun` (not pnpm, not npm)
- Workspace defined via `package.json` `workspaces` field
- Lockfile: `bun.lock`

## Commands
| Action | Command |
|--------|---------|
| Install deps | `bun install` |
| Add dep | `bun add <pkg>` |
| Add dev dep | `bun add <pkg> --dev` |
| Run script | `bun run <script>` |
| Run in workspace | `bun run --filter <pkg> <script>` |
| Execute binary | `bun x <bin>` |

## Process Spawning
- Use `execa` (not `node:child_process` spawn/execSync)

## Shortcuts
- **默认**：使用 `registerAppShortcut(win, accelerator, callback)`（随窗口 focus/blur/closed 自动注册/注销）
- **例外**：只有用户明确要求全局快捷键（`globalShortcut.register`）时才用，需在退出时手动 `unregister`

## Scripts
- `scripts/dev.ts` — development orchestrator (runs Vite, tsup watch, Electron)
- `scripts/check-deps.ts` — dependency check

## Lint & Typecheck
- **Full lint**: `bun run lint` (runs biome TS + eslint Vue + typecheck all)
- **TS only**: `bun run lint:ts` (biome check)
- **Vue only**: `bun run lint:vue` (eslint)
- **Typecheck only**: `bun run lint:typecheck` (per-pkg typecheck + scripts tsc)
- **Format**: `bun run format` (biome format --write + eslint --fix)

## Pre-commit
- Husky pre-commit runs lint-staged:
  - `*.ts` → `biome check --write --no-errors-on-unmatched`
  - `*.vue` → `eslint --fix` + `eslint`
- Termux/Android environments auto-skip

## Build
- `bun run build` → builds all packages (shared → ipc-contract → renderer → main)
- `bun run build:main` → only main process (CJS)
- `bun run build:renderer` → only renderer (Vite)

## 代理模块架构约定（packages/proxy）

整体架构：Electron 负责 UI 和管理，Mihomo 作为**独立进程**运行，二者通过 **REST API** 和本地文件通信。

### 核心原则
- **独立进程**：Mihomo 通过 `spawn(binary, ['-d', configDir])` 启动，不嵌入 Electron
- **REST API**：通过 `external-controller` (127.0.0.1:9090) 控制核心，所有请求带 `Authorization: Bearer <secret>` 头
- **内部模型 → 配置文件**：代码维护 `ProxyConfig` TS 接口，UI 修改的是该模型；保存时由 ConfigManager 通过 `yaml` 库生成 `config.yaml`，**禁止直接读写 YAML 字符串或文件**
- **配置目录**：使用 `app.getPath('userData')/proxy`，不使用 `resourcesPath`（只读）
- **应用内代理**：通过 `SessionManager.setProxyRules()` + `session.fromPartition(opts)` 将 WebContents 流量路由到 `127.0.0.1:7890`，**不改系统代理**
- **ProxyProvider 抽象**：`ProxyManager implements ProxyProvider`，未来换 Sing-box 等核心只需新增 Provider 实现，UI 代码无需改动
- **优雅关闭**：先 `POST /stop` 调 API 让 Mihomo 清理连接，再 `SIGTERM` 兜底 kill

### 代码注释规范
- **类级 JSDoc**：每个模块/类文件顶部写一段 `/** */` 说明职责、设计原则和与整体的关系
- **方法 JSDoc**：关键方法（`start`/`stop`/`generateConfig`/`request` 等）写一句话说明功能；多步骤操作（如启动流程）用 `// 1. ... 2. ...` 标注步骤
- **字段注释**：关键私有字段（如 `stopRequested`）写一句话说明用途
- **架构关键路径**：涉及数据流、通信协议、配置转换等核心逻辑处，必须注释说明"为什么这么做"
- **不要写**：显而易见的操作（如 `return x`、简单 getter）不需要注释；注释应解释意图而非重复代码

### 二进制打包
- 各平台二进制放在 `resources/mihomo/{platform}-{arch}/mihomo`（Windows 后缀 `.exe`）
- electron-builder `extraResources` 将其打包到 `{resourcesPath}/mihomo/`
- 运行时路径：`process.resourcesPath` → `mihomo/{platform}-{arch}/mihomo`

### 目录结构
```
packages/proxy/src/
├── ProxyProvider.ts     # 抽象接口（多核心扩展点）
├── ProxyManager.ts      # 主入口，implements ProxyProvider
├── MihomoProcess.ts     # 进程管理（spawn、启动/停止、自动重启）
├── ConfigManager.ts     # 配置管理（TS 模型 → YAML 文件）
├── ApiClient.ts         # REST API 客户端（Bearer 认证）
├── HealthChecker.ts     # 节点延迟检测
├── TrafficMonitor.ts    # WebSocket 流量监控
├── CoreDownloader.ts    # 二进制路径解析
├── types.ts             # 类型定义
└── index.ts             # 统一导出
```

### 配置数据流
```
SubscriptionManager（解析订阅内容）
  ↓
ProxyManager.injectProxies(proxies, groups, rules)
  ↓
ConfigManager.setSubscriptionData() → 更新 TS 模型
ConfigManager.writeConfig() → YAML.stringify() → config.yaml
  ↓
MihomoProcess 读取 config.yaml 启动
```

## Naive UI 组件规范

### 安装方式
使用 `naive-ui`，通过按需引入使用组件（tree-shaking 友好）：
```ts
import { NInput, NSelect, NSwitch } from 'naive-ui'
```
不要整包引入，不要二次封装简单组件。

### 主题适配
- 全局主题色通过 `n-config-provider` 的 `themeOverrides` 配置
- 主色定义在 `apps/renderer/src/style.css` 的 `:root` / `[data-theme]` 中（oklch 色彩空间）
- Naive UI 组件会自动继承 CSS 变量，无需额外适配浅色/深色模式

### 常用组件映射
| 场景 | 组件 |
|------|------|
| 文本输入 | `NInput` |
| 数字输入 | `NInputNumber` |
| 下拉选择 | `NSelect` |
| 开关 | `NSwitch` |
| 单选 | `NRadioGroup` + `NRadioButton` |
| 提示 | `NTooltip` |
**M1 — 基础浏览（Phase 1）** ✅ COMPLETED
- TabManager: WebContentsView lifecycle with event listeners
- NavigationManager: goBack/forward/reload/stop/loadURL
- SessionManager: default/incognito partition isolation
- ChromeUI: TabBar + AddressBar + Viewport with ResizeObserver → setBounds
- IPC: TabState, BrowserViewBounds, tab:*/nav:*/session:* channels
- E2E tests updated

**M2 — 浏览增强（Phase 2）** ✅ COMPLETED
- DownloadManager (will-download + progress broadcast)
- HistoryManager (auto-record with tabId + dedup + search)
- BookmarkManager (folder hierarchy + HTML import/export)
- SettingsManager (electron-store + theme/zoom/print/devtools)
- Sidebar (fixed-width 280px, 4 views: downloads/history/bookmarks/settings)
- DevTools (right-click on webview, per-tab)
- Print/PDF (printPage → toPDF)
- Zoom controls (100% default, cycles 50/75/100/125/150)
- Theme toggle (light/dark via nativeTheme + CSS variables)
- 28 new IPC channels, 41 total handlers
- 12 E2E tests (7 original + 5 M2 features)

**M3 — 用户体验增强（Phase 3）** ✅ COMPLETED
- New Tab Page (search box + quick links grid + recent history)
- Find in Page UI (slides from AddressBar bottom-right, Ctrl+F)
- AddressBar autocomplete (history + bookmark suggestions, 200ms debounce)
- Bookmark star button (toggle current page bookmark, gold filled)
- Tab drag & drop reordering (HTML5 DnD, persisted to SettingsManager)
- 9 new IPC channels, 50 total handlers
- 17 E2E tests (7 original + 5 M2 + 5 M3)

**M3 proxy — Mihomo 代理模块** ✅ COMPLETED
- packages/proxy: ProxyManager, MihomoProcess, ConfigManager, ApiClient, HealthChecker, TrafficMonitor, CoreDownloader
- SubscriptionManager (moved to apps/main, depends on database)
- 代理面板 UI: NodeView, SubscriptionView, TrafficView, LogView
- 12 new IPC channels (proxy + subscription), 62 total handlers
- 21 E2E tests

**M4 — 打磨与打包** ✅ COMPLETED
- electron-builder 三平台打包配置 (AppImage/deb/dmg/nsis)
- 会话恢复: 关闭时保存标签页，重启时恢复
- 窗口状态持久化 (位置/大小)
- 崩溃恢复: render-process-gone 自动 reload
- 后台标签挂起: 5分钟不活跃释放 WebContentsView

**M5 — CI/CD 与分发** ⏳ NEXT
- GitHub Actions 三平台构建矩阵
- 代码签名: macOS Apple Developer ID, Windows Authenticode
- 自动更新: electron-updater + GitHub Releases
- 测试覆盖扩展: Vitest 单元测试, Playwright E2E 扩展
