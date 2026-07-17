# 编译期 console 源码位置注入（dev 阶段）

日期：2026-07-17

## 目标

开发阶段，自动为前后端所有 `console.debug / log / info / warn / error` 调用在实参最前面插入
`相对仓库根目录的路径:行号:` 字符串前缀，使 VS Code 终端输出可直接点击跳转到对应源码位置。

- **仅 dev 阶段注入**，生产构建（electron-builder 打包）完全不注入，零运行时开销。
- **不修改任何源码**（`src/` 下的 `.ts` / `.vue` 文件原封不动），只在构建产物（`dist/*.cjs`、Vite 内存 bundle）中注入。
- 主进程（Node / tsup）与渲染进程（浏览器 / Vite，含 `.vue`）都覆盖。

## 判断开关

统一用环境变量判断，不再使用 Vite 的 `mode`：

```ts
export function isInstrumentEnabled(): boolean {
  return process.env.WMFX_DEV_INSTRUMENT === '1'
}
```

- `scripts/dev.ts` 在启动 tsup（主进程 watch）和 Vite（渲染进程 dev server）子进程时，
  通过 env 注入 `WMFX_DEV_INSTRUMENT=1`。
- 生产 `bun run build` / `vite build` / `electron-builder` 流程不设该变量 → 不注入。

## 改写机制（正则）

共用一个 `rewriteConsoleCalls(code: string, id: string, root: string): string` 函数：

1. 匹配 `console.(debug|log|info|warn|error)` 调用（同时兼容 `console['error']` 成员表达式形式）。
   正则限定为「标识符/成员 + 紧跟 `(`」的调用形态，字符串内部出现的 `console.log(` 文本不会被改写。
2. 按原始文件文本计算该调用所在**行号**（逐行扫描或记录匹配偏移）。
3. 组装位置字符串：`path.relative(root, id) + ':' + line + ':'`（末尾冒号是 VS Code 终端识别跳转的关键）。
4. 在调用实参最前面插入该字符串字面量作为第一个参数，例如：

   ```ts
   console.debug('[TabManager] close: tabId=%s', tabId)
   // 改写为：
   console.debug('apps/main/src/tab-manager.ts:73:', '[TabManager] close: tabId=%s', tabId)
   ```

位置作为普通字符串参数传入，复用现有 logger 覆写逻辑中 `args.map(formatArg).join(' ')` 的拼接，
自然并入消息文本，无需改动任何 `logger.ts`。

### 为何正则足够

- 业务代码里 `console.xxx` 均为真实调用，不存在把 `console.log(` 当作字符串拼接的边界场景，误伤概率极低。
- 相比 esbuild AST 重写，正则更轻量，且对 `.vue` 原始文本同样适用，无需在 Vite 中反复调用 esbuild parse。

## 注入点

### 1. 主进程（tsup → cjs）

- `apps/main/tsup.config.ts` 在 `esbuildOptions` / 插件列表中挂载 esbuild 插件
  `sourceLocationEsbuildPlugin(root)`，仅当 `isInstrumentEnabled()` 为真时挂载。
- 插件在 `setup` 中用 `onTransform({ filter: /\.tsx?$/ }, ...)` 对主进程 `.ts` 源调用 `rewriteConsoleCalls`。

### 2. 渲染进程（Vite，ts/tsx）

- `apps/renderer/vite.config.ts` 挂同一个 esbuild 插件（通过 Vite 的 `optimizeDeps.esbuildOptions` 或
  自定义 esbuild 插件钩子），仅当 `isInstrumentEnabled()` 为真时挂载，处理 `.ts/.tsx`。

### 3. 渲染进程（Vite，.vue）

- `apps/renderer/vite.config.ts` 挂一个 `enforce: 'pre'` 的 Vite 插件 `sourceLocationVuePlugin(root)`。
- `enforce: 'pre'` 保证它在 `@vitejs/plugin-vue` **之前**运行，此时 `transform(code, id)` 拿到的 `code`
  是 `.vue` 文件**原始文本**，行号直接对应真实源码。
- 仅对 `id.endsWith('.vue')` 调用 `rewriteConsoleCalls`，改写 `<script>` 块中的 `console.xxx`。
- 插入的位置字面量是普通字符串参数，经 vue 插件后续编译后保留，运行时打印的位置即真实 `.vue:行号`。

## 不改动的部分

- `apps/main/src/logger.ts`、`apps/renderer/src/lib/logger.ts` 的 `console` 覆写逻辑不动。
- 渲染进程经 `window.browserAPI.log` 转发到主进程时，`serialize(join(' '))` 会把位置并入 message，
  经 `handleFrontendLog` 落盘 → 主进程日志文件同样带 `apps/renderer/src/...:行号`。
- `src/` 源码文件完全不动，仅构建产物变化（`dist/` 本就 gitignore）。

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `scripts/source-location.ts` | **新增**。导出 `isInstrumentEnabled`、`rewriteConsoleCalls`、`sourceLocationEsbuildPlugin(root)`、`sourceLocationVuePlugin(root)` |
| `apps/main/tsup.config.ts` | dev 时挂载 esbuild 插件 |
| `apps/renderer/vite.config.ts` | dev 时挂载 esbuild 插件（ts）+ `enforce:'pre'` vue 插件 |
| `scripts/dev.ts` | 给 tsup 与 Vite 子进程注入 `WMFX_DEV_INSTRUMENT=1` 环境变量 |

## 边界与约定

- 仅处理 `.ts` / `.tsx` / `.vue`；其它扩展名忽略。
- 路径基准为仓库根目录（`/Users/11048490/shared/wmfx`），因为 dev 在仓库根目录开的终端，点击才能跳转。
- 仅当 `WMFX_DEV_INSTRUMENT === '1'` 才改写，生产构建恒为假。
- 正则限定真实调用形式，避免字符串误伤。

## 验证方式

1. `bun run dev`，在 VS Code 终端观察主进程 / 渲染进程日志，确认每条带 `apps/.../xxx.ts:行号:` 前缀且可点击跳转。
2. 打开一个含 `console.debug` 的 `.vue` 组件，确认终端输出指向真实 `.vue:行号`。
3. `bun run build` + `electron-builder` 打生产包，确认日志不含位置前缀（源码未被改动）。
4. `git status` 确认 `src/` 无变化。
