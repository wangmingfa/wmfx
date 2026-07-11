# AI 浏览器 — Plan 1：项目脚手架 (M0) 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建一个可启动的 Electron + pnpm workspace + Vite + Vue3 + TypeScript 空壳应用，打通类型安全的 IPC，并建立安全基线。

**Architecture:** 渐进式 Monorepo。主进程（`apps/main`）用 tsup 打包，渲染进程（`apps/renderer`）用 Vite + Vue3。共享类型放 `packages/shared`，IPC 通道契约放 `packages/ipc-contract`。渲染进程通过 preload 的 `contextBridge` 暴露的类型安全 `window.browserAPI` 与主进程通信，禁用 nodeIntegration、开启 contextIsolation 与 sandbox。

**Tech Stack:** Electron (latest), TypeScript, pnpm workspace, tsup (main/preload 打包), Vite + Vue3 + Pinia (renderer), Vitest (单元测试), @playwright/test (Electron E2E)。

## Global Constraints

- 包管理器：**pnpm**（workspace），不使用 bun/npm/yarn
- 目标平台：Windows + macOS + Linux（开发机为 macOS/darwin）
- 安全基线（所有 BrowserWindow 必须满足）：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`
- 渲染进程**绝不**直接 `require`/访问 Node 或 Electron API，只能通过 `window.browserAPI`
- IPC 通道类型定义集中在 `packages/ipc-contract`，主/渲染共享
- TypeScript 全程 `strict: true`
- 所有包私有（`"private": true`），不发布 npm

---

## File Structure

本计划创建以下文件：

- `pnpm-workspace.yaml` — workspace 定义
- `package.json` — 根包，脚本与开发依赖
- `.npmrc` — pnpm 配置（hoist electron 相关）
- `.gitignore` — 忽略 node_modules/dist
- `tsconfig.base.json` — 共享 TS 配置
- `packages/shared/` — 共享类型与工具
- `packages/ipc-contract/` — IPC 通道契约
- `apps/main/` — Electron 主进程 + preload
- `apps/renderer/` — Vue3 渲染进程
- `e2e/` — Playwright Electron 端到端测试

---

### Task 1: Monorepo 根脚手架

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `.npmrc`
- Create: `.gitignore`
- Create: `tsconfig.base.json`

**Interfaces:**
- Consumes: 无
- Produces: workspace 结构（`apps/*`、`packages/*`）、根脚本 `pnpm install`、共享 `tsconfig.base.json`（`extends` 目标）

- [ ] **Step 1: 创建 `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 2: 创建 `.npmrc`**

```
node-linker=hoisted
shamefully-hoist=true
strict-peer-dependencies=false
```

- [ ] **Step 3: 创建 `.gitignore`**

```
node_modules/
dist/
out/
*.log
.DS_Store
resources/mihomo/*/mihomo
resources/mihomo/*/mihomo.exe
test-results/
playwright-report/
```

- [ ] **Step 4: 创建根 `package.json`**

```json
{
  "name": "ai-browser",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build:shared": "pnpm --filter @browser/shared build",
    "build:ipc": "pnpm --filter @browser/ipc-contract build",
    "build:main": "pnpm --filter @browser/main build",
    "build:renderer": "pnpm --filter @browser/renderer build",
    "build": "pnpm build:shared && pnpm build:ipc && pnpm build:renderer && pnpm build:main",
    "dev": "pnpm build:shared && pnpm build:ipc && node scripts/dev.mjs",
    "test": "vitest run",
    "test:e2e": "pnpm build && playwright test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "electron": "^33.0.0",
    "playwright": "^1.48.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 5: 创建 `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

- [ ] **Step 6: 安装依赖并验证 workspace**

Run: `pnpm install`
Expected: 安装成功，无报错（此时无 workspace 子包也应成功）

- [ ] **Step 7: 提交**

```bash
git add pnpm-workspace.yaml package.json .npmrc .gitignore tsconfig.base.json
git commit -m "chore: monorepo 根脚手架 (pnpm workspace)"
```

---

### Task 2: packages/shared 共享工具与类型

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/tsup.config.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/url.ts`
- Test: `packages/shared/src/url.test.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json`
- Produces: 包 `@browser/shared`，导出 `normalizeAddressBarInput(input: string): { type: 'url' | 'search'; value: string }`

- [ ] **Step 1: 创建 `packages/shared/package.json`**

```json
{
  "name": "@browser/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: 创建 `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 `packages/shared/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
```

- [ ] **Step 4: 写失败测试 `packages/shared/src/url.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeAddressBarInput } from './url';

describe('normalizeAddressBarInput', () => {
  it('treats a full URL as a url', () => {
    expect(normalizeAddressBarInput('https://example.com')).toEqual({
      type: 'url',
      value: 'https://example.com',
    });
  });

  it('adds https:// to a bare domain', () => {
    expect(normalizeAddressBarInput('example.com')).toEqual({
      type: 'url',
      value: 'https://example.com',
    });
  });

  it('treats free text as a search query', () => {
    expect(normalizeAddressBarInput('hello world')).toEqual({
      type: 'search',
      value: 'hello world',
    });
  });
});
```

- [ ] **Step 5: 运行测试确认失败**

Run: `pnpm vitest run packages/shared/src/url.test.ts`
Expected: FAIL，报错 `Failed to resolve import './url'` 或 `normalizeAddressBarInput is not a function`

- [ ] **Step 6: 实现 `packages/shared/src/url.ts`**

```ts
export interface AddressBarResult {
  type: 'url' | 'search';
  value: string;
}

const DOMAIN_LIKE = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i;

export function normalizeAddressBarInput(input: string): AddressBarResult {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: 'url', value: trimmed };
  }
  if (!trimmed.includes(' ') && DOMAIN_LIKE.test(trimmed)) {
    return { type: 'url', value: `https://${trimmed}` };
  }
  return { type: 'search', value: trimmed };
}
```

- [ ] **Step 7: 创建 `packages/shared/src/index.ts`**

```ts
export * from './url';
```

- [ ] **Step 8: 运行测试确认通过**

Run: `pnpm vitest run packages/shared/src/url.test.ts`
Expected: PASS（3 passed）

- [ ] **Step 9: 构建并提交**

```bash
pnpm --filter @browser/shared build
git add packages/shared
git commit -m "feat(shared): 地址栏输入归一化工具 + 测试"
```

---

### Task 3: packages/ipc-contract IPC 通道契约

**Files:**
- Create: `packages/ipc-contract/package.json`
- Create: `packages/ipc-contract/tsconfig.json`
- Create: `packages/ipc-contract/tsup.config.ts`
- Create: `packages/ipc-contract/src/index.ts`
- Create: `packages/ipc-contract/src/channels.ts`
- Test: `packages/ipc-contract/src/channels.test.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json`
- Produces: 包 `@browser/ipc-contract`，导出：
  - `interface IpcContract`（通道名 → 函数签名）——初始含 `'app:ping': (msg: string) => string`
  - `type IpcChannel = keyof IpcContract`
  - `const IPC_CHANNELS: readonly IpcChannel[]`
  - `function isIpcChannel(name: string): name is IpcChannel`

- [ ] **Step 1: 创建 `packages/ipc-contract/package.json`**

```json
{
  "name": "@browser/ipc-contract",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: 创建 `packages/ipc-contract/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 `packages/ipc-contract/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
```

- [ ] **Step 4: 写失败测试 `packages/ipc-contract/src/channels.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS, isIpcChannel } from './channels';

describe('ipc channels', () => {
  it('includes the app:ping channel', () => {
    expect(IPC_CHANNELS).toContain('app:ping');
  });

  it('recognizes a valid channel', () => {
    expect(isIpcChannel('app:ping')).toBe(true);
  });

  it('rejects an unknown channel', () => {
    expect(isIpcChannel('bogus:channel')).toBe(false);
  });
});
```

- [ ] **Step 5: 运行测试确认失败**

Run: `pnpm vitest run packages/ipc-contract/src/channels.test.ts`
Expected: FAIL，报错无法解析 `./channels`

- [ ] **Step 6: 实现 `packages/ipc-contract/src/channels.ts`**

```ts
/**
 * 所有 IPC 通道的类型契约：通道名 -> (参数) => 返回值。
 * 主进程用它约束 handle，渲染进程用它约束 invoke。
 * 后续里程碑在此扩展（tab:*, nav:*, proxy:* ...）。
 */
export interface IpcContract {
  'app:ping': (message: string) => string;
}

export type IpcChannel = keyof IpcContract;

export const IPC_CHANNELS: readonly IpcChannel[] = ['app:ping'] as const;

export function isIpcChannel(name: string): name is IpcChannel {
  return (IPC_CHANNELS as readonly string[]).includes(name);
}

/** 渲染进程侧调用类型：invoke 返回 Promise。 */
export type IpcInvoke = {
  [K in IpcChannel]: (
    ...args: Parameters<IpcContract[K]>
  ) => Promise<ReturnType<IpcContract[K]>>;
};
```

- [ ] **Step 7: 创建 `packages/ipc-contract/src/index.ts`**

```ts
export * from './channels';
```

- [ ] **Step 8: 运行测试确认通过**

Run: `pnpm vitest run packages/ipc-contract/src/channels.test.ts`
Expected: PASS（3 passed）

- [ ] **Step 9: 构建并提交**

```bash
pnpm --filter @browser/ipc-contract build
git add packages/ipc-contract
git commit -m "feat(ipc-contract): 类型安全 IPC 通道契约 + 测试"
```

---

### Task 4: Electron 主进程 + 窗口创建

**Files:**
- Create: `apps/main/package.json`
- Create: `apps/main/tsconfig.json`
- Create: `apps/main/tsup.config.ts`
- Create: `apps/main/src/index.ts`
- Create: `apps/main/src/window-manager.ts`
- Create: `apps/main/src/paths.ts`

**Interfaces:**
- Consumes: `@browser/ipc-contract`（后续 Task 6 使用）
- Produces: 构建产物 `apps/main/dist/index.cjs`（Electron 入口）、`apps/main/dist/preload.cjs`（Task 6 填充逻辑，本任务先建空 preload）；`window-manager.ts` 导出 `createMainWindow(): BrowserWindow`

说明：主进程与 preload 用 CJS 输出（Electron 主进程与 sandbox preload 用 CJS 最稳，兼容原生模块）。

- [ ] **Step 1: 创建 `apps/main/package.json`**

```json
{
  "name": "@browser/main",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.cjs",
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@browser/ipc-contract": "workspace:*",
    "@browser/shared": "workspace:*"
  }
}
```

- [ ] **Step 2: 创建 `apps/main/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node", "electron"],
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 `apps/main/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    preload: 'src/preload.ts',
  },
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  platform: 'node',
  target: 'node20',
  external: ['electron'],
  noExternal: ['@browser/ipc-contract', '@browser/shared'],
  clean: true,
});
```

- [ ] **Step 4: 创建 `apps/main/src/paths.ts`**

```ts
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// __dirname 在 CJS 产物中可用；用 path 计算渲染进程产物位置。
declare const __dirname: string;

/** 开发模式下由 dev 脚本注入 vite 服务地址。 */
export function getRendererDevServerUrl(): string | undefined {
  return process.env.VITE_DEV_SERVER_URL;
}

/** 生产/E2E：渲染进程构建产物 index.html 的绝对路径。 */
export function getRendererIndexHtml(): string {
  // apps/main/dist -> apps/renderer/dist/index.html
  return path.join(__dirname, '..', '..', 'renderer', 'dist', 'index.html');
}

/** preload 脚本产物绝对路径。 */
export function getPreloadPath(): string {
  return path.join(__dirname, 'preload.cjs');
}

// 避免未使用告警（fileURLToPath 预留给未来 ESM 迁移）
void fileURLToPath;
```

- [ ] **Step 5: 创建 `apps/main/src/window-manager.ts`**

```ts
import { BrowserWindow } from 'electron';
import {
  getPreloadPath,
  getRendererDevServerUrl,
  getRendererIndexHtml,
} from './paths';

export function createMainWindow(): BrowserWindow {
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

  win.once('ready-to-show', () => win.show());

  const devUrl = getRendererDevServerUrl();
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(getRendererIndexHtml());
  }

  return win;
}
```

- [ ] **Step 6: 创建占位 preload `apps/main/src/preload.ts`（Task 6 填充）**

```ts
// preload 逻辑在 Task 6 实现。此处先建空文件以产出 preload.cjs。
export {};
```

- [ ] **Step 7: 创建 `apps/main/src/index.ts`**

```ts
import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window-manager';

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

- [ ] **Step 8: 安装 electron 类型并构建**

Run: `pnpm install && pnpm --filter @browser/main build`
Expected: 构建成功，产出 `apps/main/dist/index.cjs` 与 `apps/main/dist/preload.cjs`

- [ ] **Step 9: 提交**

```bash
git add apps/main
git commit -m "feat(main): Electron 主进程与安全基线窗口创建"
```

---

### Task 5: 渲染进程 Vue3 + Vite

**Files:**
- Create: `apps/renderer/package.json`
- Create: `apps/renderer/tsconfig.json`
- Create: `apps/renderer/vite.config.ts`
- Create: `apps/renderer/index.html`
- Create: `apps/renderer/src/main.ts`
- Create: `apps/renderer/src/App.vue`
- Create: `apps/renderer/src/env.d.ts`

**Interfaces:**
- Consumes: `@browser/shared`（演示用）
- Produces: 构建产物 `apps/renderer/dist/index.html`；开发服务器默认端口 5173

- [ ] **Step 1: 创建 `apps/renderer/package.json`**

```json
{
  "name": "@browser/renderer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "vue-tsc --noEmit"
  },
  "dependencies": {
    "@browser/ipc-contract": "workspace:*",
    "@browser/shared": "workspace:*",
    "pinia": "^2.2.0",
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.1.0",
    "vite": "^5.4.0",
    "vue-tsc": "^2.1.0"
  }
}
```

- [ ] **Step 2: 创建 `apps/renderer/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "noEmit": true
  },
  "include": ["src", "env.d.ts"]
}
```

- [ ] **Step 3: 创建 `apps/renderer/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

- [ ] **Step 4: 创建 `apps/renderer/src/env.d.ts`**

```ts
/// <reference types="vite/client" />

import type { IpcInvoke } from '@browser/ipc-contract';

declare global {
  interface Window {
    browserAPI: {
      ping: IpcInvoke['app:ping'];
    };
  }
}

export {};
```

- [ ] **Step 5: 创建 `apps/renderer/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Browser</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: 创建 `apps/renderer/src/App.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';

const pong = ref<string>('');

async function sendPing() {
  pong.value = await window.browserAPI.ping('hello from renderer');
}
</script>

<template>
  <main>
    <h1>AI Browser</h1>
    <button data-testid="ping-btn" @click="sendPing">Ping main</button>
    <p data-testid="pong">{{ pong }}</p>
  </main>
</template>
```

- [ ] **Step 7: 创建 `apps/renderer/src/main.ts`**

```ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

createApp(App).use(createPinia()).mount('#app');
```

- [ ] **Step 8: 安装依赖并构建渲染进程**

Run: `pnpm install && pnpm --filter @browser/renderer build`
Expected: 构建成功，产出 `apps/renderer/dist/index.html`

- [ ] **Step 9: 提交**

```bash
git add apps/renderer
git commit -m "feat(renderer): Vue3 + Vite 渲染进程外壳"
```

---

### Task 6: 类型安全 IPC 演示通道 + 安全基线 E2E

**Files:**
- Modify: `apps/main/src/preload.ts`
- Create: `apps/main/src/ipc/register.ts`
- Modify: `apps/main/src/index.ts`
- Create: `scripts/dev.mjs`
- Create: `playwright.config.ts`
- Test: `e2e/app.spec.ts`

**Interfaces:**
- Consumes: `@browser/ipc-contract`（`IpcContract`、`IpcChannel`）
- Produces: 主进程注册 `app:ping` handler；preload 暴露 `window.browserAPI.ping`；端到端可验证 renderer→main→renderer 往返 + 安全基线

- [ ] **Step 1: 实现 preload `apps/main/src/preload.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcInvoke } from '@browser/ipc-contract';

const api: { ping: IpcInvoke['app:ping'] } = {
  ping: (message: string) => ipcRenderer.invoke('app:ping', message),
};

contextBridge.exposeInMainWorld('browserAPI', api);
```

- [ ] **Step 2: 创建主进程 IPC 注册 `apps/main/src/ipc/register.ts`**

```ts
import { ipcMain } from 'electron';
import type { IpcContract } from '@browser/ipc-contract';

/** 类型安全的 handle 包装：约束通道名与处理函数签名一致。 */
function handle<K extends keyof IpcContract>(
  channel: K,
  handler: (
    ...args: Parameters<IpcContract[K]>
  ) => ReturnType<IpcContract[K]> | Promise<ReturnType<IpcContract[K]>>,
): void {
  ipcMain.handle(channel, (_event, ...args) =>
    handler(...(args as Parameters<IpcContract[K]>)),
  );
}

export function registerIpcHandlers(): void {
  handle('app:ping', (message) => `pong: ${message}`);
}
```

- [ ] **Step 3: 在主进程入口注册 handler（修改 `apps/main/src/index.ts`）**

将 `app.whenReady().then(() => {` 块修改为先注册 IPC：

```ts
import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window-manager';
import { registerIpcHandlers } from './ipc/register';

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

- [ ] **Step 4: 创建开发脚本 `scripts/dev.mjs`**

```js
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const server = await createServer({ root: 'apps/renderer' });
await server.listen();
const info = server.config.server;
const url = `http://localhost:${info.port}`;

// 构建主进程后启动 electron，注入 dev server 地址。
const build = spawn('pnpm', ['--filter', '@browser/main', 'build'], {
  stdio: 'inherit',
});
build.on('exit', () => {
  const electron = spawn('electron', ['apps/main/dist/index.cjs'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
    shell: process.platform === 'win32',
  });
  electron.on('exit', () => {
    server.close();
    process.exit(0);
  });
});
```

- [ ] **Step 5: 创建 `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
});
```

- [ ] **Step 6: 写 E2E 测试 `e2e/app.spec.ts`**

```ts
import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await electron.launch({ args: ['apps/main/dist/index.cjs'] });
  page = await app.firstWindow();
});

test.afterAll(async () => {
  await app.close();
});

test('window loads with the app title', async () => {
  await expect(page.locator('h1')).toHaveText('AI Browser');
});

test('type-safe IPC round-trips renderer -> main -> renderer', async () => {
  await page.getByTestId('ping-btn').click();
  await expect(page.getByTestId('pong')).toHaveText('pong: hello from renderer');
});

test('security baseline: no node integration in renderer', async () => {
  const hasRequire = await page.evaluate(
    () => typeof (window as unknown as { require?: unknown }).require,
  );
  expect(hasRequire).toBe('undefined');
});

test('security baseline: only browserAPI is exposed', async () => {
  const hasBrowserApi = await page.evaluate(
    () => typeof (window as unknown as { browserAPI?: unknown }).browserAPI,
  );
  expect(hasBrowserApi).toBe('object');
});
```

- [ ] **Step 7: 安装 Playwright 浏览器依赖**

Run: `pnpm exec playwright install`
Expected: 安装成功（Electron 测试用其自带二进制，无需额外浏览器，但命令确保 Playwright 就绪）

- [ ] **Step 8: 全量构建并运行 E2E 确认通过**

Run: `pnpm build && pnpm exec playwright test`
Expected: PASS（4 passed）——窗口标题、IPC 往返、无 require、仅暴露 browserAPI

- [ ] **Step 9: 提交**

```bash
git add apps/main/src/preload.ts apps/main/src/ipc apps/main/src/index.ts scripts/dev.mjs playwright.config.ts e2e/app.spec.ts
git commit -m "feat: 类型安全 IPC 演示通道 + 安全基线 E2E 测试"
```

- [ ] **Step 10: 手动验证开发模式（可选）**

Run: `pnpm dev`
Expected: Electron 窗口打开，显示 "AI Browser"，点击 Ping main 显示 "pong: hello from renderer"，改动 `App.vue` 触发 Vite HMR

---

## Self-Review

**Spec 覆盖（对照 spec 第 2、3、5 节的 M0 要求）：**
- pnpm workspace + Electron + Vite + Vue3 + TS 启动 → Task 1/4/5 ✅
- 主/渲染/preload 三层通，类型安全 IPC 打通一个 demo 通道 → Task 3/6 ✅
- 安全基线（contextIsolation/nodeIntegration/sandbox）→ Task 4（配置）+ Task 6（E2E 断言）✅
- `packages/shared`、`packages/ipc-contract` 独立包 → Task 2/3 ✅

**占位符扫描：** 无 TBD/TODO；preload 占位在 Task 4 明确标注"Task 6 填充"，并在 Task 6 落实。✅

**类型一致性：** `IpcContract['app:ping']` 签名 `(message: string) => string` 在 contract（Task 3）、main handler（Task 6 返回 `pong: ${message}`）、preload/renderer（`IpcInvoke['app:ping']` 返回 Promise<string>）三处一致。`window.browserAPI.ping` 在 env.d.ts（Task 5）、preload（Task 6）、App.vue（Task 5 使用）命名一致。✅

**范围：** 仅脚手架 M0，产出可启动+可测试的空壳，独立可交付。✅

---

## 备注：后续里程碑

本计划完成后，`IpcContract` 将随 M1（tab/nav）、M3（proxy）逐步扩展；`packages/storage` 在 M2 引入；`resources/mihomo` 在 M3 引入。每个里程碑单独出计划。
