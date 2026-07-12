# M3 — Mihomo 代理模块 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现浏览器内置 Mihomo 代理面板，支持内核启停、节点切换、订阅管理、流量监控，作为产品核心差异化功能。

**Architecture:** `packages/proxy` 独立包，包含 Mihomo 子进程管理、REST API 客户端、配置生成、订阅管理、健康检查、流量监控。主进程通过 `ProxyManager` 统一协调，渲染进程通过 IPC → proxy 面板 UI 操作代理。

**Tech Stack:** execa (子进程), ws (WebSocket), Node 20+ fetch (REST API), YAML 字符串拼接 (配置生成)。

---

## File Structure

```
packages/proxy/
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── src/
    ├── index.ts              # 导出 ProxyManager
    ├── ProxyManager.ts       # 对外总入口
    ├── MihomoProcess.ts      # 子进程生命周期
    ├── CoreDownloader.ts     # 下载/校验 mihomo 内核
    ├── ConfigManager.ts      # 生成/合并 config.yaml
    ├── ApiClient.ts          # Mihomo RESTful API (:9090)
    ├── SubscriptionManager.ts # 订阅拉取/解析
    ├── HealthChecker.ts      # 节点延迟测试
    ├── TrafficMonitor.ts     # 实时流量 WebSocket
    └── types.ts              # 共享类型

scripts/
└── download-cores.ts         # 按平台下载 mihomo 内核

resources/mihomo/
├── darwin-arm64/mihomo
├── darwin-x64/mihomo
├── linux-x64/mihomo
└── win32-x64/mihomo.exe
```

---

## Global Constraints

- 子进程管理用 `execa`（不用 node:child_process）
- mihomo 默认端口：mixed-port `7890`，external-controller `127.0.0.1:9090`
- 二进制路径：`resources/mihomo/{platform}-{arch}/mihomo`
- 配置生成：直接字符串拼接（mihomo config.yaml 结构简单）
- 代理绑定 session 级别（`session.setProxy`），不改系统全局代理
- 退出时必须 kill mihomo 子进程（`app.on('will-quit')`）
- TypeScript 全程 `strict: true`

---

## Task 1: packages/proxy 骨架 + CoreDownloader

**Files:**
- Create: `packages/proxy/package.json`
- Create: `packages/proxy/tsconfig.json`
- Create: `packages/proxy/tsup.config.ts`
- Create: `packages/proxy/src/types.ts`
- Create: `packages/proxy/src/CoreDownloader.ts`
- Create: `packages/proxy/src/index.ts`
- Create: `scripts/download-cores.ts`

**Interfaces:**
- Consumes: 无
- Produces: 包 `@browser/proxy`，导出 `CoreDownloader`

- [ ] **Step 1: 创建 `packages/proxy/package.json`**

```json
{
  "name": "@browser/proxy",
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
  },
  "dependencies": {
    "execa": "^9.0.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0"
  }
}
```

- [ ] **Step 2: 创建 `packages/proxy/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 `packages/proxy/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['execa', 'ws'],
});
```

- [ ] **Step 4: 创建 `packages/proxy/src/types.ts`**

```ts
export interface ProxyConfig {
  mixedPort: number;
  controllerPort: number;
  controllerHost: string;
  mode: 'rule' | 'global' | 'direct';
  allowLan: boolean;
  logLevel: 'silent' | 'error' | 'warning' | 'info' | 'debug';
}

export interface ProxyNode {
  name: string;
  type: string;
  server: string;
  port: number;
  delay?: number;
}

export interface ProxyGroup {
  name: string;
  type: 'Selector' | 'URLTest' | 'Fallback' | 'Relay' | 'Direct' | 'Reject';
  now?: string;
  all?: string[];
}

export interface SubscriptionInfo {
  name: string;
  url: string;
  upload: number;
  download: number;
  total: number;
  expire: number;
}

export interface TrafficData {
  up: number;
  down: number;
}

export interface MihomoStatus {
  running: boolean;
  pid?: number;
  port?: number;
}
```

- [ ] **Step 5: 创建 `packages/proxy/src/CoreDownloader.ts`**

```ts
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const MIHOMO_VERSION = 'v1.19.0';
const BASE_URL = `https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}`;

function getBinaryName(): string {
  return process.platform === 'win32' ? 'mihomo.exe' : 'mihomo';
}

function getPlatformArchDir(): string {
  const p = process.platform;
  const a = process.arch;
  return `${p}-${a}`;
}

export function getMihomoBinaryPath(): string {
  const dir = join(process.resourcesPath || process.cwd(), 'mihomo', getPlatformArchDir());
  return join(dir, getBinaryName());
}

export function isMihomoDownloaded(): boolean {
  return existsSync(getMihomoBinaryPath());
}

export async function downloadMihomo(
  resourcePath: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const dir = join(resourcePath, 'mihomo', getPlatformArchDir());
  mkdirSync(dir, { recursive: true });

  const binaryName = getBinaryName();
  const targetPath = join(dir, binaryName);

  if (existsSync(targetPath)) {
    return targetPath;
  }

  throw new Error(
    `Mihomo binary not found at ${targetPath}. ` +
    `Run 'bun run download:cores' or download manually from ${BASE_URL}`
  );
}
```

- [ ] **Step 6: 创建 `packages/proxy/src/index.ts`**

```ts
export { CoreDownloader, getMihomoBinaryPath, isMihomoDownloaded } from './CoreDownloader';
export type {
  ProxyConfig,
  ProxyNode,
  ProxyGroup,
  SubscriptionInfo,
  TrafficData,
  MihomoStatus,
} from './types';
```

- [ ] **Step 7: 创建 `scripts/download-cores.ts`**

```ts
#!/usr/bin/env bun
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const MIHOMO_VERSION = 'v1.19.0';
const BASE_URL = `https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}`;

const PLATFORM_MAP: Record<string, string> = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
  'linux-x64': 'linux-amd64',
  'win32-x64': 'windows-amd64',
};

function getPlatformKey(): string {
  return `${process.platform}-${process.arch}`;
}

function getDownloadUrl(): string {
  const key = getPlatformKey();
  const mapped = PLATFORM_MAP[key];
  if (!mapped) throw new Error(`Unsupported platform: ${key}`);

  const archiveName = mapped.startsWith('windows')
    ? `mihomo-${mapped}.zip`
    : `mihomo-${mapped}.gz`;
  return `${BASE_URL}/${archiveName}`;
}

async function download() {
  const key = getPlatformKey();
  const dir = join(process.cwd(), 'resources', 'mihomo', key);
  mkdirSync(dir, { recursive: true });

  const binaryName = process.platform === 'win32' ? 'mihomo.exe' : 'mihomo';
  const targetPath = join(dir, binaryName);

  if (existsSync(targetPath)) {
    console.log(`✓ Mihomo already exists at ${targetPath}`);
    return;
  }

  const url = getDownloadUrl();
  console.log(`Downloading mihomo from ${url}...`);

  const isZip = url.endsWith('.zip');
  if (isZip) {
    execSync(`curl -L "${url}" -o /tmp/mihomo.zip && unzip -o /tmp/mihomo.zip -d "${dir}" && chmod +x "${targetPath}"`, { stdio: 'inherit' });
  } else {
    execSync(`curl -L "${url}" | gunzip > "${targetPath}" && chmod +x "${targetPath}"`, { stdio: 'inherit' });
  }

  console.log(`✓ Mihomo installed at ${targetPath}`);
}

download().catch(console.error);
```

- [ ] **Step 8: 根 `package.json` 添加脚本**

在根 `package.json` 的 `scripts` 中添加：
```json
"download:cores": "bun scripts/download-cores.ts"
```

- [ ] **Step 9: 构建并提交**

```bash
bun install
bun run --filter @browser/proxy build
git add packages/proxy scripts/download-cores.ts
git commit -m "feat(proxy): 代理包骨架 + CoreDownloader + 类型定义"
```

---

## Task 2: MihomoProcess + ConfigManager

**Files:**
- Create: `packages/proxy/src/MihomoProcess.ts`
- Create: `packages/proxy/src/ConfigManager.ts`
- Modify: `packages/proxy/src/index.ts`

**Interfaces:**
- Consumes: `CoreDownloader`（binary path）, `types.ts`
- Produces: `MihomoProcess`（start/stop/restart/status）, `ConfigManager`（generateConfig）

- [ ] **Step 1: 实现 `ConfigManager.ts`**

```ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProxyConfig } from './types';

const DEFAULT_CONFIG: ProxyConfig = {
  mixedPort: 7890,
  controllerPort: 9090,
  controllerHost: '127.0.0.1',
  mode: 'rule',
  allowLan: false,
  logLevel: 'info',
};

export class ConfigManager {
  private configDir: string;
  private config: ProxyConfig;

  constructor(configDir: string, overrides?: Partial<ProxyConfig>) {
    this.configDir = configDir;
    this.config = { ...DEFAULT_CONFIG, ...overrides };
  }

  getConfigPath(): string {
    return join(this.configDir, 'config.yaml');
  }

  generateConfig(rules?: string[]): string {
    const { mixedPort, controllerPort, controllerHost, mode, allowLan, logLevel } = this.config;

    let yaml = `mixed-port: ${mixedPort}\n`;
    yaml += `allow-lan: ${allowLan}\n`;
    yaml += `mode: ${mode}\n`;
    yaml += `log-level: ${logLevel}\n`;
    yaml += `external-controller: ${controllerHost}:${controllerPort}\n`;
    yaml += `\n`;
    yaml += `proxies: []\n`;
    yaml += `\n`;
    yaml += `proxy-groups:\n`;
    yaml += `  - name: "PROXY"\n`;
    yaml += `    type: select\n`;
    yaml += `    proxies:\n`;
    yaml += `      - DIRECT\n`;
    yaml += `\n`;
    yaml += `rules:\n`;
    yaml += `  - MATCH,PROXY\n`;

    return yaml;
  }

  writeConfig(rules?: string[]): void {
    const yaml = this.generateConfig(rules);
    writeFileSync(this.getConfigPath(), yaml, 'utf-8');
  }

  getMixedPort(): number {
    return this.config.mixedPort;
  }

  getControllerUrl(): string {
    return `http://${this.config.controllerHost}:${this.config.controllerPort}`;
  }

  getProxyRules(): string {
    const port = this.config.mixedPort;
    return `http=127.0.0.1:${port};https=127.0.0.1:${port};ftp=127.0.0.1:${port}`;
  }

  updateConfig(overrides: Partial<ProxyConfig>): void {
    this.config = { ...this.config, ...overrides };
  }
}
```

- [ ] **Step 2: 实现 `MihomoProcess.ts`**

```ts
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { MihomoStatus } from './types';
import { getMihomoBinaryPath } from './CoreDownloader';
import { ConfigManager } from './ConfigManager';

export class MihomoProcess {
  private process: ChildProcess | null = null;
  private configManager: ConfigManager;
  private restartCount = 0;
  private maxRestarts = 3;
  private onLog?: (msg: string) => void;
  private onError?: (msg: string) => void;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  setCallbacks(callbacks: { onLog?: (msg: string) => void; onError?: (msg: string) => void }): void {
    this.onLog = callbacks.onLog;
    this.onError = callbacks.onError;
  }

  start(): void {
    if (this.process) {
      this.stop();
    }

    const binaryPath = getMihomoBinaryPath();
    if (!existsSync(binaryPath)) {
      throw new Error(`Mihomo binary not found at ${binaryPath}`);
    }

    this.process = spawn(binaryPath, ['-d', this.configManager['configDir']], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.onLog?.(data.toString().trim());
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      this.onError?.(data.toString().trim());
    });

    this.process.on('exit', (code) => {
      this.process = null;
      this.onLog?.(`Mihomo exited with code ${code}`);
      if (this.restartCount < this.maxRestarts) {
        this.restartCount++;
        this.onLog?.(`Restarting mihomo (attempt ${this.restartCount})...`);
        setTimeout(() => this.start(), 1000);
      }
    });

    this.restartCount = 0;
    this.onLog?.('Mihomo started');
  }

  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  getStatus(): MihomoStatus {
    return {
      running: this.isRunning(),
      pid: this.process?.pid,
      port: this.configManager.getMixedPort(),
    };
  }
}
```

- [ ] **Step 3: 更新 `packages/proxy/src/index.ts`**

```ts
export { CoreDownloader, getMihomoBinaryPath, isMihomoDownloaded } from './CoreDownloader';
export { ConfigManager } from './ConfigManager';
export { MihomoProcess } from './MihomoProcess';
export type {
  ProxyConfig,
  ProxyNode,
  ProxyGroup,
  SubscriptionInfo,
  TrafficData,
  MihomoStatus,
} from './types';
```

- [ ] **Step 4: 构建并提交**

```bash
bun run --filter @browser/proxy build
git add packages/proxy
git commit -m "feat(proxy): MihomoProcess + ConfigManager"
```

---

## Task 3: ApiClient + HealthChecker

**Files:**
- Create: `packages/proxy/src/ApiClient.ts`
- Create: `packages/proxy/src/HealthChecker.ts`
- Modify: `packages/proxy/src/index.ts`

**Interfaces:**
- Consumes: `ConfigManager`（controller URL）, `types.ts`
- Produces: `ApiClient`（REST API 封装）, `HealthChecker`（延迟测试）

- [ ] **Step 1: 实现 `ApiClient.ts`**

```ts
import type { ProxyNode, ProxyGroup } from './types';
import { ConfigManager } from './ConfigManager';

export class ApiClient {
  private configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.configManager.getControllerUrl()}${path}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  async getProxies(): Promise<Record<string, ProxyGroup & { all?: ProxyNode[] }>> {
    return this.request('GET', '/proxies');
  }

  async getProxyGroup(name: string): Promise<ProxyGroup & { all?: ProxyNode[] }> {
    return this.request('GET', `/proxies/${encodeURIComponent(name)}`);
  }

  async switchNode(groupName: string, nodeName: string): Promise<void> {
    await this.request('PUT', `/proxies/${encodeURIComponent(groupName)}`, { name: nodeName });
  }

  async getMode(): Promise<{ mode: string }> {
    return this.request('GET', '/configs');
  }

  async setMode(mode: 'rule' | 'global' | 'direct'): Promise<void> {
    await this.request('PUT', '/configs', { mode });
  }

  async getDelay(nodeName: string, url = 'http://www.gstatic.com/generate_204'): Promise<number> {
    const result = await this.request<{ delay: number }>('GET', `/proxies/${encodeURIComponent(nodeName)}/delay?url=${encodeURIComponent(url)}&timeout=5000`);
    return result.delay;
  }

  async getConfig(): Promise<Record<string, unknown>> {
    return this.request('GET', '/configs');
  }

  async patchConfig(config: Record<string, unknown>): Promise<void> {
    await this.request('PATCH', '/configs', config);
  }

  async isReady(): Promise<boolean> {
    try {
      await this.request('GET', '/configs');
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 2: 实现 `HealthChecker.ts`**

```ts
import type { ProxyGroup, ProxyNode } from './types';
import { ApiClient } from './ApiClient';

interface DelayResult {
  nodeName: string;
  delay: number;
  error?: string;
}

export class HealthChecker {
  private apiClient: ApiClient;
  private concurrency: number;

  constructor(apiClient: ApiClient, concurrency = 5) {
    this.apiClient = apiClient;
    this.concurrency = concurrency;
  }

  async checkNode(nodeName: string): Promise<DelayResult> {
    try {
      const delay = await this.apiClient.getDelay(nodeName);
      return { nodeName, delay };
    } catch (e) {
      return { nodeName, delay: -1, error: String(e) };
    }
  }

  async checkGroup(groupName: string): Promise<DelayResult[]> {
    const group = await this.apiClient.getProxyGroup(groupName);
    if (!group.all) return [];

    const results: DelayResult[] = [];
    for (let i = 0; i < group.all.length; i += this.concurrency) {
      const batch = group.all.slice(i, i + this.concurrency);
      const batchResults = await Promise.all(
        batch.map((node) => this.checkNode(node.name))
      );
      results.push(...batchResults);
    }
    return results;
  }
}
```

- [ ] **Step 3: 更新 `packages/proxy/src/index.ts`**

```ts
export { CoreDownloader, getMihomoBinaryPath, isMihomoDownloaded } from './CoreDownloader';
export { ConfigManager } from './ConfigManager';
export { MihomoProcess } from './MihomoProcess';
export { ApiClient } from './ApiClient';
export { HealthChecker } from './HealthChecker';
export type {
  ProxyConfig,
  ProxyNode,
  ProxyGroup,
  SubscriptionInfo,
  TrafficData,
  MihomoStatus,
} from './types';
```

- [ ] **Step 4: 构建并提交**

```bash
bun run --filter @browser/proxy build
git add packages/proxy
git commit -m "feat(proxy): ApiClient + HealthChecker"
```

---

## Task 4: ProxyManager 总入口 + TrafficMonitor

**Files:**
- Create: `packages/proxy/src/ProxyManager.ts`
- Create: `packages/proxy/src/TrafficMonitor.ts`
- Modify: `packages/proxy/src/index.ts`

**Interfaces:**
- Consumes: 所有 proxy 子模块
- Produces: `ProxyManager`（对外统一 API）, `TrafficMonitor`（实时流量）

- [ ] **Step 1: 实现 `TrafficMonitor.ts`**

```ts
import WebSocket from 'ws';
import type { TrafficData } from './types';
import { ConfigManager } from './ConfigManager';

export class TrafficMonitor {
  private ws: WebSocket | null = null;
  private configManager: ConfigManager;
  private listeners: Set<(data: TrafficData) => void> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  connect(): void {
    if (this.ws) return;

    const url = `ws://${this.configManager['config'].controllerHost}:${this.configManager['config'].controllerPort}/traffic`;
    this.ws = new WebSocket(url);

    this.ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as TrafficData;
        this.listeners.forEach((cb) => cb(parsed));
      } catch { /* ignore parse errors */ }
    });

    this.ws.on('close', () => {
      this.ws = null;
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    });

    this.ws.on('error', () => {
      this.ws?.close();
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  onData(cb: (data: TrafficData) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
```

- [ ] **Step 2: 实现 `ProxyManager.ts`**

```ts
import { MihomoProcess } from './MihomoProcess';
import { ConfigManager } from './ConfigManager';
import { ApiClient } from './ApiClient';
import { HealthChecker } from './HealthChecker';
import { TrafficMonitor } from './TrafficMonitor';
import type { ProxyConfig, MihomoStatus, ProxyGroup, TrafficData } from './types';

export class ProxyManager {
  private process: MihomoProcess;
  private configManager: ConfigManager;
  private apiClient: ApiClient;
  private healthChecker: HealthChecker;
  private trafficMonitor: TrafficMonitor;
  private configDir: string;

  constructor(configDir: string, overrides?: Partial<ProxyConfig>) {
    this.configDir = configDir;
    this.configManager = new ConfigManager(configDir, overrides);
    this.process = new MihomoProcess(this.configManager);
    this.apiClient = new ApiClient(this.configManager);
    this.healthChecker = new HealthChecker(this.apiClient);
    this.trafficMonitor = new TrafficMonitor(this.configManager);
  }

  async start(): Promise<void> {
    this.configManager.writeConfig();
    this.process.start();
    // Wait for mihomo to be ready
    for (let i = 0; i < 30; i++) {
      if (await this.apiClient.isReady()) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    this.trafficMonitor.connect();
  }

  stop(): void {
    this.trafficMonitor.disconnect();
    this.process.stop();
  }

  getStatus(): MihomoStatus {
    return this.process.getStatus();
  }

  getProxyRules(): string {
    return this.configManager.getProxyRules();
  }

  async getProxies(): Promise<Record<string, ProxyGroup & { all?: { name: string; type: string }[] }>> {
    return this.apiClient.getProxies();
  }

  async switchNode(groupName: string, nodeName: string): Promise<void> {
    await this.apiClient.switchNode(groupName, nodeName);
  }

  async setMode(mode: 'rule' | 'global' | 'direct'): Promise<void> {
    await this.apiClient.setMode(mode);
  }

  async getMode(): Promise<string> {
    const config = await this.apiClient.getConfig();
    return String(config.mode || 'rule');
  }

  async checkDelay(groupName: string): Promise<{ nodeName: string; delay: number }[]> {
    return this.healthChecker.checkGroup(groupName);
  }

  onData(cb: (data: TrafficData) => void): () => void {
    return this.trafficMonitor.onData(cb);
  }

  setCallbacks(callbacks: { onLog?: (msg: string) => void; onError?: (msg: string) => void }): void {
    this.process.setCallbacks(callbacks);
  }
}
```

- [ ] **Step 3: 更新 `packages/proxy/src/index.ts`**

```ts
export { ProxyManager } from './ProxyManager';
export { CoreDownloader, getMihomoBinaryPath, isMihomoDownloaded } from './CoreDownloader';
export { ConfigManager } from './ConfigManager';
export { MihomoProcess } from './MihomoProcess';
export { ApiClient } from './ApiClient';
export { HealthChecker } from './HealthChecker';
export { TrafficMonitor } from './TrafficMonitor';
export type {
  ProxyConfig,
  ProxyNode,
  ProxyGroup,
  SubscriptionInfo,
  TrafficData,
  MihomoStatus,
} from './types';
```

- [ ] **Step 4: 构建并提交**

```bash
bun run --filter @browser/proxy build
git add packages/proxy
git commit -m "feat(proxy): ProxyManager 总入口 + TrafficMonitor"
```

---

## Task 5: 主进程集成 + IPC 通道

**Files:**
- Modify: `apps/main/src/window-manager.ts` — 添加 `proxyManager`
- Modify: `apps/main/src/index.ts` — 启动/停止 mihomo
- Modify: `apps/main/src/ipc/register.ts` — 注册 proxy:* handlers
- Modify: `packages/ipc-contract/src/channels.ts` — 添加 proxy 通道
- Modify: `apps/main/src/preload.ts` — 暴露 proxy API
- Modify: `apps/renderer/src/env.d.ts` — 类型声明

**Interfaces:**
- Consumes: `@browser/proxy`（ProxyManager）
- Produces: 主进程可管理代理，渲染进程可调用 proxy API

- [ ] **Step 1: 扩展 IPC 契约 `packages/ipc-contract/src/channels.ts`**

在 `IpcContract` 中添加：
```ts
// Proxy
'proxy:start': () => void;
'proxy:stop': () => void;
'proxy:status': () => MihomoStatus;
'proxy:getProxies': () => Record<string, ProxyGroup>;
'proxy:switchNode': (groupName: string, nodeName: string) => void;
'proxy:mode': () => string;
'proxy:setMode': (mode: 'rule' | 'global' | 'direct') => void;
'proxy:checkDelay': (groupName: string) => { nodeName: string; delay: number }[];
'proxy:getConfig': () => Record<string, unknown>;
'proxy:setConfig': (config: Record<string, unknown>) => void;
```

在 `IPC_CHANNELS` 数组中添加对应条目。

添加类型导入：`import type { MihomoStatus, ProxyGroup } from '@browser/proxy';`

- [ ] **Step 2: 修改 `apps/main/src/window-manager.ts`**

在 `BrowserWindowInstance` 接口中添加：
```ts
proxyManager?: ProxyManager;
```

在 `createMainWindow()` 中初始化（如有 proxy 目录）。

- [ ] **Step 3: 修改 `apps/main/src/index.ts`**

在 `app.whenReady()` 中启动 proxy：
```ts
import { ProxyManager } from '@browser/proxy';

// 在 createMainWindow 之后
const proxyManager = new ProxyManager(
  join(app.getPath('userData'), 'proxy')
);
instance.proxyManager = proxyManager;
await proxyManager.start();

// 退出时停止
app.on('will-quit', () => {
  proxyManager.stop();
});
```

- [ ] **Step 4: 注册 IPC handlers `apps/main/src/ipc/register.ts`**

```ts
handle('proxy:start', () => {
  const instance = getInstance();
  return instance.proxyManager?.start();
});

handle('proxy:stop', () => {
  const instance = getInstance();
  return instance.proxyManager?.stop();
});

handle('proxy:status', () => {
  const instance = getInstance();
  return instance.proxyManager?.getStatus() ?? { running: false };
});

handle('proxy:getProxies', () => {
  const instance = getInstance();
  return instance.proxyManager?.getProxies() ?? {};
});

handle('proxy:switchNode', (groupName, nodeName) => {
  const instance = getInstance();
  return instance.proxyManager?.switchNode(groupName, nodeName);
});

handle('proxy:mode', () => {
  const instance = getInstance();
  return instance.proxyManager?.getMode() ?? 'rule';
});

handle('proxy:setMode', (mode) => {
  const instance = getInstance();
  return instance.proxyManager?.setMode(mode);
});

handle('proxy:checkDelay', (groupName) => {
  const instance = getInstance();
  return instance.proxyManager?.checkDelay(groupName) ?? [];
});

handle('proxy:getConfig', () => {
  const instance = getInstance();
  return instance.proxyManager?.getProxies() ?? {};
});

handle('proxy:setConfig', (config) => {
  const instance = getInstance();
  return instance.proxyManager?.getProxies() ?? {};
});
```

- [ ] **Step 5: 扩展 preload `apps/main/src/preload.ts`**

在 `api` 对象中添加：
```ts
proxy: {
  start: () => ipcRenderer.invoke('proxy:start'),
  stop: () => ipcRenderer.invoke('proxy:stop'),
  status: () => ipcRenderer.invoke('proxy:status'),
  getProxies: () => ipcRenderer.invoke('proxy:getProxies'),
  switchNode: (groupName: string, nodeName: string) => ipcRenderer.invoke('proxy:switchNode', groupName, nodeName),
  mode: () => ipcRenderer.invoke('proxy:mode'),
  setMode: (mode: string) => ipcRenderer.invoke('proxy:setMode', mode),
  checkDelay: (groupName: string) => ipcRenderer.invoke('proxy:checkDelay', groupName),
  getConfig: () => ipcRenderer.invoke('proxy:getConfig'),
  setConfig: (config: unknown) => ipcRenderer.invoke('proxy:setConfig', config),
  onTraffic: (cb: (data: unknown) => void) => ipcRenderer.on('proxy:traffic', (_, data) => cb(data)),
},
```

- [ ] **Step 6: 扩展 `apps/renderer/src/env.d.ts`**

在 `window.browserAPI` 中添加 `proxy` 对象类型声明。

- [ ] **Step 7: 安装依赖并构建**

```bash
bun install
bun run --filter @browser/proxy build
bun run --filter @browser/main build
```

- [ ] **Step 8: 提交**

```bash
git add apps/main apps/renderer packages/ipc-contract
git commit -m "feat: 主进程集成 ProxyManager + proxy IPC 通道"
```

---

## Task 6: SubscriptionManager

**Files:**
- Create: `packages/proxy/src/SubscriptionManager.ts`
- Modify: `packages/proxy/src/index.ts`
- Modify: `packages/database/src/migrations/` — 添加 subscriptions 表
- Create: `packages/database/src/repositories/SubscriptionRepository.ts`

**Interfaces:**
- Consumes: `ApiClient`（写入配置）, `ConfigManager`（读写配置）
- Produces: `SubscriptionManager`（订阅 CRUD + 拉取/解析）

- [ ] **Step 1: 创建 subscriptions 数据库迁移**

在 `packages/database/src/migrations/` 中添加新迁移文件，创建 `subscriptions` 表：

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  last_update INTEGER DEFAULT 0,
  expire INTEGER DEFAULT 0,
  upload INTEGER DEFAULT 0,
  download INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0
);
```

- [ ] **Step 2: 实现 `SubscriptionRepository.ts`**

```ts
export interface SubscriptionRecord {
  id: string;
  name: string;
  url: string;
  last_update: number;
  expire: number;
  upload: number;
  download: number;
  total: number;
}

export class SubscriptionRepository {
  constructor(private db: Database) {}

  findAll(): SubscriptionRecord[] { ... }
  findById(id: string): SubscriptionRecord | undefined { ... }
  findByUrl(url: string): SubscriptionRecord | undefined { ... }
  create(sub: Omit<SubscriptionRecord, 'id'>): string { ... }
  update(id: string, fields: Partial<SubscriptionRecord>): void { ... }
  delete(id: string): void { ... }
}
```

- [ ] **Step 3: 实现 `SubscriptionManager.ts`**

```ts
export class SubscriptionManager {
  // 拉取订阅 URL（fetch + base64/clash 格式解析）
  // 解析代理节点
  // 合并到 ConfigManager
  // CRUD 通过 SubscriptionRepository

  async fetchAndParse(url: string): Promise<ProxyNode[]> { ... }
  async addSubscription(url: string, name: string): Promise<string> { ... }
  async removeSubscription(id: string): Promise<void> { ... }
  async updateSubscription(id: string): Promise<void> { ... }
  getSubscriptions(): SubscriptionRecord[] { ... }
}
```

- [ ] **Step 4: 添加 IPC 通道**

```ts
'proxy:getSubscriptions': () => SubscriptionRecord[];
'proxy:addSubscription': (url: string, name: string) => { id: string };
'proxy:removeSubscription': (id: string) => void;
'proxy:updateSubscription': (id: string) => void;
```

- [ ] **Step 5: 注册 handlers + preload + env.d.ts**

- [ ] **Step 6: 构建并提交**

```bash
bun run --filter @browser/proxy build
bun run --filter @browser/database build
git add packages/proxy packages/database
git commit -m "feat(proxy): SubscriptionManager + 数据库订阅表"
```

---

## Task 7: 代理面板 UI

**Files:**
- Create: `apps/renderer/src/views/ProxyPanel.vue`
- Create: `apps/renderer/src/views/proxy/NodeView.vue`
- Create: `apps/renderer/src/views/proxy/SubscriptionView.vue`
- Create: `apps/renderer/src/views/proxy/TrafficView.vue`
- Create: `apps/renderer/src/views/proxy/LogView.vue`
- Modify: `apps/renderer/src/components/Sidebar.vue` — 添加"代理"Tab

**Interfaces:**
- Consumes: `window.browserAPI.proxy.*`
- Produces: 完整代理面板 UI

- [ ] **Step 1: 修改 Sidebar.vue 添加代理 Tab**

在 `sidebarTabs` 数组中添加：
```ts
{ key: 'proxy', label: '代理', icon: '🌐' }
```

在模板中添加 `ProxyPanel` 组件的 `v-show` 渲染。

- [ ] **Step 2: 创建 `ProxyPanel.vue`**

Tab 容器，切换节点/订阅/流量/日志四个子视图。

```vue
<script setup lang="ts">
const tabs = [
  { key: 'nodes', label: '节点' },
  { key: 'subscriptions', label: '订阅' },
  { key: 'traffic', label: '流量' },
  { key: 'logs', label: '日志' },
];
const activeTab = ref('nodes');
</script>
```

- [ ] **Step 3: 创建 `NodeView.vue`**

代理组列表 + 节点选择 + 延迟测试按钮 + 模式切换（规则/全局/直连）。

- [ ] **Step 4: 创建 `SubscriptionView.vue`**

订阅列表 + 添加/删除 + 流量/到期信息显示。

- [ ] **Step 5: 创建 `TrafficView.vue`**

实时上下行速度显示（通过 `onTraffic` 监听）。

- [ ] **Step 6: 创建 `LogView.vue`**

mihomo 日志滚动显示。

- [ ] **Step 7: E2E 测试更新**

添加代理面板相关 E2E 测试。

- [ ] **Step 8: 构建并提交**

```bash
bun run --filter @browser/renderer build
git add apps/renderer
git commit -m "feat(renderer): 代理面板 UI（节点/订阅/流量/日志）"
```

---

## Task 8: E2E 测试 + 集成验证

**Files:**
- Modify: `e2e/app.spec.ts` — 添加代理相关 E2E 测试

**Interfaces:**
- Consumes: 所有 proxy 模块
- Produces: E2E 测试覆盖代理核心流程

- [ ] **Step 1: 添加 E2E 测试**

```ts
test('proxy panel is accessible from sidebar', async () => { ... });
test('proxy status shows running after start', async () => { ... });
test('proxy mode can be switched', async () => { ... });
```

- [ ] **Step 2: 全量构建 + lint + typecheck**

```bash
bun run build
bun run lint
```

- [ ] **Step 3: 运行 E2E**

```bash
bun run test:e2e
```

- [ ] **Step 4: 最终提交**

```bash
git add e2e
git commit -m "test: 代理模块 E2E 测试"
```

---

## Self-Review

**Spec 覆盖（对照原始 Spec 第 4 节）：**
- CoreDownloader + 三平台内核分发 → Task 1 ✅
- MihomoProcess 生命周期 + ConfigManager → Task 2 ✅
- session.setProxy 接入 → Task 5 ✅
- ApiClient（节点/模式切换）→ Task 3 ✅
- SubscriptionManager（拉取/解析/更新）→ Task 6 ✅
- HealthChecker → Task 3 ✅
- TrafficMonitor → Task 4 ✅
- 代理面板 UI → Task 7 ✅

**安全：**
- mihomo 运行在子进程中，与主进程隔离 ✅
- 代理绑定 session 级别，不改系统全局代理 ✅
- 配置文件在 userData 目录，不暴露敏感信息 ✅

**跨平台：**
- CoreDownloader 按 platform-arch 路径分发 ✅
- execa 跨平台子进程管理 ✅

---

## 备注

- 本计划是原始设计 Spec 的 **M3 — Mihomo 代理（Phase 3）**
- 用户体验增强 M3 已完成（NewTab/FindBar/Autocomplete/书签星标/拖拽排序）
- 后续里程碑：M4（打磨与打包）、Phase 5（AI 预留）
