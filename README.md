# WMFX

> 基于 Electron + TypeScript + Vite + Vue 3 的现代化桌面浏览器，内置 Mihomo 代理管理，面向 AI 就绪的模块化架构。

## 特性

- **多标签页浏览**：基于 `WebContentsView` 的标签生命周期管理、前进/后退/刷新/停止、地址栏 URL 校验与自动补全
- **会话隔离**：默认会话与无痕会话（`SessionManager` 分区隔离），不改系统代理
- **下载管理**：队列、暂停/继续/取消、进度与速度广播
- **历史与书签**：自动记录（去重 + 搜索）、书签文件夹层级、HTML 导入/导出
- **侧边栏**：下载 / 历史 / 书签 / 设置四视图（固定 280px）
- **浏览增强**：新标签页（搜索框 + 快捷入口 + 最近历史）、页内查找（Ctrl+F）、书签星标、标签拖拽排序、缩放、主题切换、打印/PDF
- **Mihomo 代理模块**：独立进程运行核心，通过 REST API + Bearer 认证管理；订阅管理、节点切换、延迟检测、流量监控、日志
- **崩溃恢复**：渲染进程崩溃自动 reload、会话恢复、窗口状态持久化、后台标签挂起

## 技术栈

| 层 | 技术 |
|----|------|
| 主进程 | Electron 43 + TypeScript |
| 渲染进程 | Vue 3 + Vite 8 + Naive UI |
| 代理核心 | Mihomo（独立进程，REST API 控制）|
| 存储 | better-sqlite3（SQLite）+ electron-store |
| 包管理 | bun（workspace monorepo）|
| 测试 | Vitest（单元）+ Playwright（E2E）|
| 构建 | tsup + Vite + electron-builder |
| 质量 | Biome（TS）+ ESLint（Vue）+ Husky 预提交 |

## 仓库结构

``` text
wmfx/
├── apps/
│   ├── main/            # Electron 主进程（管理器 + IPC）
│   └── renderer/        # Vue 渲染进程（UI）
├── packages/
│   ├── shared/          # 共享类型/工具
│   ├── ipc-contract/    # 主进程 ↔ 渲染进程 IPC 契约
│   ├── database/        # SQLite 数据层
│   └── proxy/           # Mihomo 代理模块（ProxyProvider 抽象）
├── resources/mihomo/    # 各平台 Mihomo 二进制
├── scripts/             # 开发编排 / 依赖检查 / 清理
├── e2e/                 # Playwright 端到端测试
└── docs/                # 设计文档
```

完整架构设计见 [`Browser_Architecture_Design.md`](./Browser_Architecture_Design.md)，项目约定见 [`AGENTS.md`](./AGENTS.md)。

## 快速开始

要求 Node >= 20 与 [bun](https://bun.sh)。

``` bash
# 安装依赖（含 better-sqlite3 重建）
bun install

# 下载 Mihomo 核心二进制
bun run download:cores

# 启动开发环境（Vite + tsup watch + Electron）
bun run dev
```

## 常用命令

| 动作 | 命令 |
|------|------|
| 全量构建 | `bun run build` |
| 仅构建主进程 | `bun run build:main` |
| 仅构建渲染进程 | `bun run build:renderer` |
| 打包（三平台）| `bun run package` |
| 打包 macOS / Win / Linux | `bun run package:mac` / `:win` / `:linux` |
| 单元测试 | `bun test` |
| E2E 测试 | `bun run test:e2e` |
| 代码检查 | `bun run lint` |
| 类型检查 | `bun run lint:typecheck` |
| 格式化 | `bun run format` |

> 各命令依赖关系见根 `package.json` 的 `scripts` 字段。

## 代理模块架构

Electron 负责 UI 与管理，Mihomo 作为**独立进程**运行，二者通过 REST API 与本地文件通信：

- 通过 `spawn(binary, ['-d', configDir])` 启动，不嵌入 Electron
- 通过 `external-controller`（127.0.0.1:9090）控制核心，请求带 `Authorization: Bearer <secret>`
- 代码维护 `ProxyConfig` TS 模型，保存时由 `ConfigManager` 生成 `config.yaml`（禁止直接读写 YAML 字符串）
- 配置目录使用 `app.getPath('userData')/proxy`
- 应用内代理通过 `SessionManager.setProxyRules()` 将流量路由到 127.0.0.1:7890，不改系统代理
- `ProxyManager implements ProxyProvider`，未来换 Sing-box 等核心只需新增 Provider 实现

## 开发约定

- 包管理器统一使用 **bun**（非 npm/pnpm）
- 子进程一律使用 `execa`，不要直接用 `node:child_process`
- 快捷键默认用 `registerAppShortcut`，仅用户明确要求全局快捷键时才用 `globalShortcut`
- CSS 变量需带中文注释；Naive UI 组件按需引入，不二次封装简单组件
- 提交前 Husky 会对 `*.ts` 跑 Biome、`*.vue` 跑 ESLint 自动修复

## 里程碑与路线图

详见 [ROADMAP.md](./ROADMAP.md)。

## License

本项目基于 [GNU Affero General Public License v3.0](./LICENSE) 发布。
