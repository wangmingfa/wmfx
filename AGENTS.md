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

## Current Milestone
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
