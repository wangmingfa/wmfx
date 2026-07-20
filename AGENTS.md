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

## 日志规范

### 调试日志（console.debug）
所有代码**必须**添加非常详细的调试日志，用于排查运行细节。统一使用 `console.debug`（不用 `console.log`）。
除「不要加日志的位置」外，函数入口/出口、分支判断、关键变量、异步回调、IO 前后等都应记录，宁多勿少。

**格式**：`[模块名] 方法名: 描述含关键参数`
```ts
console.debug('[TabManager] close: tabId=%s wasActive=%s remaining=%d', tabId, wasActive, this.tabs.size)
console.debug('[IPC] tab:create: url=%s sessionId=%s', opts?.url, opts?.sessionId)
console.debug('[ProxyManager] start: configPath=%s', configPath)
```

### 关键路径日志（console.info）
关键代码路径（生命周期、重要状态变更、流程里程碑）使用 `console.info`，在控制台以 INFO 突出显示，便于快速定位执行到哪一步：

**必须加 `console.info` 的位置**：
- **Tab 生命周期**：`create`/`close`/`activate`/`suspend`/`resume`/`relaunchView`
- **导航**：`loadURL`/`goBack`/`goForward`/`reload`/`stop`/`setNavigating`
- **IPC 关键 handler**：`tab:create`/`tab:close`/`tab:activate`/`nav:*`/`download:*`/`proxy:*`/`settings:set`
- **下载生命周期**：`will-download`/`updated`/`done`/`create`/`pause`/`resume`/`cancel`
- **代理模块**：`start`/`stop`/`injectProxies`/`switchNode`/`setMode`/`request`
- **进程事件**：`did-fail-load`/`certificate-error`/`render-process-gone`/子进程 `exit`
- **数据变更**：`history:add`/`bookmark:create`/`subscription:add`/`settings:set`

**不要加日志的位置**：
- 高频调用（`setViewportBounds`、`getState`、`getList` 等 getter）
- 简单 UI 事件（按钮 click handler）
- 循环体内部

**日志等级**：
- `console.debug` → 开发调试信息，dev 模式可选过滤（通过 `scripts/dev.ts` 选择等级）
- `console.info` → 关键代码路径/重要状态变更（见上方「必须加 console.info 的位置」）
- `console.warn` → 警告
- `console.error` → 错误
- 生产包（打包安装）收集所有等级日志，dev 模式通过 `WMFX_LOG_LEVEL` 环境变量过滤

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
- **每个 CSS 变量必须有中文注释说明用途**，格式 `/* 说明 */` 放在变量上方或行尾

### 常用组件映射
| 场景 | 组件 |
|------|------|
| 文本输入 | `NInput` |
| 数字输入 | `NInputNumber` |
| 下拉选择 | `NSelect` |
| 开关 | `NSwitch` |
| 单选 | `NRadioGroup` + `NRadioButton` |
| 提示 | `NTooltip` |

## Vue 组件样式规范

- Vue 单文件组件的 `<style>` **必须使用 LESS 语法**（`lang="less"`），禁止纯 CSS 写法。
- 使用 LESS 的**嵌套**组织样书：将子选择器、`:hover` / `:active` 等状态、以及复合类（如 `.files-list.list`）通过 `&` 嵌套在父选择器内部，避免平铺大量独立规则。
- 示例：
  ```less
  .files-list {
    flex: 1;
    overflow-y: auto;

    &.list {
      display: flex;
      flex-direction: column;
    }

    .file-item {
      padding: 8px;

      &:hover {
        background: var(--bg-hover);
      }
    }
  }
  ```
- 主题色、间距等统一引用 `apps/renderer/src/style.css` 中定义的 CSS 变量，不写死色值；**每个 CSS 变量必须有中文注释说明用途**。
- 组件根节点应设置基础 `font-family: var(--font-sans)`，避免字体属性无默认值。

## 浮层菜单与 Popover 规范

三类浮层封装位于 `apps/renderer/src/lib/` 与 `apps/renderer/src/components/`，按"跨进程 vs 渲染进程内""是否需要遮挡背景"区分使用场景：

### 1. `lib/popover.ts` —— 通用 Popover 底层（跨进程）
- 封装 `window.browserAPI.popover*` IPC，把面板交给**主进程**用 `WebContentsView`（`PanelRoot.vue`）渲染，支持 `menu` / `addressbar` 等 `type`。
- 适用：**菜单/面板需要超出当前 WebContentsView 边界、或需遮挡后台内容**的场景（因渲染进程内浮层会被自身 WebContentsView 裁剪）。
- 通过 `type` 区分面板类型，`data` 传递可序列化数据；更换底层实现（不再用 WebContentsView）时，调用处代码无需改动。
- 事件经 `onPopoverEvent` / `onPopoverDismiss` IPC 回传，内部用 `eventMap` / `dismissCallbacks` 按 `popoverId` 路由到对应实例。

### 2. `lib/dropdown-menu.ts` —— 基于 Popover 的下拉菜单
- 对 `Popover` 的封装，对外 API 与 `ContextMenu` 保持一致（`anchor` + `descriptor:{id,items}` + `onAction({menu, context:{close}})` + `onDismiss` + `mode` + `autoOpen`）。
- 内部把 `MenuItem[]` 经 IPC 传给主进程面板，由 `PanelRoot` 渲染 `PopoverMenu.vue`；点击项经 `onPopoverEvent('select')` 回传 `id` 后路由为 `onAction`。
- 使用场景：需要**跨 WebContentsView 边界弹出、或菜单可能超出自身视图被裁剪**的右键/下拉菜单（如 `BookmarkBar`、`TabBar`、`VerticalTabBar`、`AppMenuButton`）。

### 3. `lib/context-menu.ts` + `components/ContextMenu.vue` —— 渲染进程内右键菜单
- 不经 IPC、不新建 WebContentsView，直接用 `createApp` + `Teleport` 把 `PopoverMenu.vue` 以 `position: fixed` 渲染到 `body`、定位到光标坐标；样式与 `DropdownMenu` 完全一致（共用 `PopoverMenu.vue`）。
- **API 与 `DropdownMenu` 同构**，调用方只需切换类名即可。
- `mode`：
  - `'overlay'`（默认 `'normal'`）：渲染全屏遮罩（`.context-menu-mask`）挡住整个页面，菜单浮于遮罩之上，点击遮罩即关闭——用于**不希望用户操作后台元素**的场景。
  - `'normal'`：无遮罩，仅监听"点击外部 / Esc / 滚动 / resize"自动关闭——用于**页面自身即内容、不存在 WebContentsView 遮挡**的场景（如 `FilesView` 的右键菜单）。
- 关闭行为（与 `DropdownMenu` 统一）：`onAction` 回调返回 `false` 表示**保持菜单打开**（如需要继续交互），其它返回值（含不返回）在回调结束后**自动关闭**；`context.close()` 仍保留作为手动关闭的逃生舱。

### 选用原则
| 场景 | 选用 |
|------|------|
| 菜单需跨 WebContentsView 边界 / 被自身视图裁剪 | `DropdownMenu`（`Popover`） |
| 页面内浮层、无遮挡问题、要轻量即时 | `ContextMenu`（`mode: 'normal'`） |
| 页面内浮层、但要挡住后台交互 | `ContextMenu`（`mode: 'overlay'`） |
| 非菜单类面板（地址栏联想、查找栏等常驻） | 直接用 `Popover` |

