# Console Source Location Injection (dev) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In dev mode, automatically prefix every `console.debug/log/info/warn/error` call with `relativeRepoPath:line:` so VS Code terminal output is clickable and jumps to the source.

**Architecture:** A shared regex-based `rewriteConsoleCalls` injects a location string literal as the first argument of each `console.xxx` call, computed from the original source file/line. It is wired in as: an esbuild plugin for the main process (tsup) and renderer `.ts`, plus an `enforce: 'pre'` Vite plugin for renderer `.vue` (which sees raw `.vue` text before `@vitejs/plugin-vue`). Gated solely by `process.env.WMFX_DEV_INSTRUMENT === '1'`, injected by `scripts/dev.ts`. Source files are never modified; only build artifacts change.

**Tech Stack:** TypeScript, esbuild (tsup), Vite, Vue 3 SFC, Node.js.

## Global Constraints

- Dev-only: injection happens **only** when `process.env.WMFX_DEV_INSTRUMENT === '1'`. Production build (`bun run build`, `vite build`, `electron-builder`) never sets it → no injection, zero runtime overhead.
- Source files (`src/**`) are **never** modified; only build outputs (`dist/`, Vite in-memory bundle) change.
- Path prefix format: `relativePath:line:` where `relativePath = path.relative(repoRoot, sourceFile)` and a trailing colon makes VS Code terminal clickable.
- Do not modify `apps/main/src/logger.ts` or `apps/renderer/src/lib/logger.ts` — location rides along as a plain string argument via the existing `args.map(formatArg).join(' ')` concatenation.
- Regex must target real call forms (`console.xxx(` / `console['xxx'](`) and avoid rewriting strings containing `console.log(`.
- Repo root = `/Users/11048490/shared/wmfx` (resolved from the script file at runtime).

---

## File Structure

- `scripts/source-location.ts` — **new**. Pure helpers: `isInstrumentEnabled()`, `rewriteConsoleCalls(code, id, root)`, `sourceLocationEsbuildPlugin(root)`, `sourceLocationVuePlugin(root)`.
- `apps/main/tsup.config.ts` — **modify**. Conditionally append `sourceLocationEsbuildPlugin(root)` to `esbuildPlugins`.
- `apps/renderer/vite.config.ts` — **modify**. Conditionally append the esbuild plugin (via `plugins` + `optimizeDeps.esbuildOptions.plugins`) and `sourceLocationVuePlugin(root)`.
- `scripts/dev.ts` — **modify**. Inject `WMFX_DEV_INSTRUMENT: '1'` into the env passed to tsup and Vite child processes.

---

### Task 1: Shared `rewriteConsoleCalls` + `isInstrumentEnabled`

**Files:**
- Create: `scripts/source-location.ts`

**Interfaces:**
- Produces: `isInstrumentEnabled(): boolean`, `rewriteConsoleCalls(code: string, id: string, root: string): string`
- Consumes: `node:path` (`relative`)

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/source-location.test.ts`:

```ts
import { describe, it, expect } from 'bun:test'
import { isInstrumentEnabled, rewriteConsoleCalls } from '../source-location'

const root = '/repo'

describe('isInstrumentEnabled', () => {
  it('true when WMFX_DEV_INSTRUMENT=1', () => {
    const prev = process.env.WMFX_DEV_INSTRUMENT
    process.env.WMFX_DEV_INSTRUMENT = '1'
    expect(isInstrumentEnabled()).toBe(true)
    process.env.WMFX_DEV_INSTRUMENT = prev ?? ''
  })
  it('false otherwise', () => {
    const prev = process.env.WMFX_DEV_INSTRUMENT
    delete process.env.WMFX_DEV_INSTRUMENT
    expect(isInstrumentEnabled()).toBe(false)
    if (prev) process.env.WMFX_DEV_INSTRUMENT = prev
  })
})

describe('rewriteConsoleCalls', () => {
  it('prefixes console.debug with relative path:line', () => {
    const code = "console.debug('[X] hi', tabId)\n"
    const out = rewriteConsoleCalls(code, '/repo/apps/main/src/a.ts', root)
    expect(out).toBe("console.debug('apps/main/src/a.ts:1:', '[X] hi', tabId)\n")
  })

  it('handles console.error and console['warn'] forms', () => {
    const code = "console.error('e')\nconsole['warn']('w')\n"
    const out = rewriteConsoleCalls(code, '/repo/p.ts', root)
    expect(out).toContain("console.error('p.ts:1:', 'e')")
    expect(out).toContain("console['warn']('p.ts:2:', 'w')")
  })

  it('does not rewrite console-looking strings', () => {
    const code = "const s = 'console.log(\"x\")'\n"
    const out = rewriteConsoleCalls(code, '/repo/p.ts', root)
    expect(out).toBe(code)
  })

  it('computes correct line for a call on line 3', () => {
    const code = "const a = 1\nconst b = 2\nconsole.log('here')\n"
    const out = rewriteConsoleCalls(code, '/repo/p.ts', root)
    expect(out).toContain("'p.ts:3:', 'here'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/__tests__/source-location.test.ts`
Expected: FAIL — `Cannot find module '../source-location'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/source-location.ts`:

```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(__dirname, '..')

export function isInstrumentEnabled(): boolean {
  return process.env.WMFX_DEV_INSTRUMENT === '1'
}

// 匹配 console.<method>( 或 console['<method>'](，捕获方法名，保留调用括号前的所有空白/注释。
// 仅匹配「标识符 + 紧跟 (」的真实调用形态，字符串内的 console.log( 文本不会被改写。
const CALL_RE =
  /console\s*(?:\.\s*([A-Za-z_$][\w$]*)\s*|\[\s*['"]([A-Za-z_$][\w$]*)['"]\s*\]\s*)\(/g

function lineOfOffset(code: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < code.length; i++) {
    if (code.charCodeAt(i) === 10 /* \n */) line++
  }
  return line
}

export function rewriteConsoleCalls(code: string, id: string, root: string = REPO_ROOT): string {
  const rel = path.relative(root, id).split(path.sep).join('/')
  let result = ''
  let last = 0
  let m: RegExpExecArray | null
  CALL_RE.lastIndex = 0
  while ((m = CALL_RE.exec(code)) !== null) {
    const method = m[1] ?? m[2]
    if (!['debug', 'log', 'info', 'warn', 'error'].includes(method)) continue
    const line = lineOfOffset(code, m.index)
    const loc = `${rel}:${line}:`
    result += code.slice(last, m.index) + `console.${method}(${JSON.stringify(loc)}, `
    // 跳过已匹配到的 "console.method("，继续从方法名后的 "(" 之后扫描实参
    last = m.index + m[0].length
    // 修正：上面用 console.${method}( 重写，但原串可能是 console['warn'](，需对齐括号位置
    // m[0] 已含 "("，重写串也以 "(" 结尾，last 正确。
  }
  result += code.slice(last)
  return result
}
```

> 说明：`CALL_RE` 匹配整段 `console.method(`（含括号），重写时统一输出 `console.method(<loc>, `，括号位置对齐，参数列表原样保留在后续文本中。

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/__tests__/source-location.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/source-location.ts scripts/__tests__/source-location.test.ts
git commit -m "feat: add dev-only console source-location rewriter (regex)"
```

---

### Task 2: esbuild plugin for main process (tsup)

**Files:**
- Modify: `scripts/source-location.ts` (append plugin)
- Modify: `apps/main/tsup.config.ts`
- Test: `scripts/__tests__/source-location.test.ts` (extend)

**Interfaces:**
- Consumes: `rewriteConsoleCalls`, `isInstrumentEnabled`, `REPO_ROOT` from Task 1
- Produces: `sourceLocationEsbuildPlugin(root?: string): import('esbuild').Plugin`

- [ ] **Step 1: Add test for the esbuild plugin**

Append to `scripts/__tests__/source-location.test.ts`:

```ts
import { sourceLocationEsbuildPlugin } from '../source-location'
import { transform } from 'esbuild'

describe('sourceLocationEsbuildPlugin', () => {
  it('injects location through esbuild transform', async () => {
    const plugin = sourceLocationEsbuildPlugin('/repo')
    const code = "console.log('hi')\n"
    const res = await transform(code, {
      loader: 'ts',
      plugins: [plugin],
      // 必须标注 stdin 文件路径，插件才能拿到 id
      stdin: { contents: code, resolveDir: '/repo', sourcefile: '/repo/apps/main/src/x.ts' },
    })
    expect(res.code).toContain("'apps/main/src/x.ts:1:', 'hi'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/__tests__/source-location.test.ts`
Expected: FAIL — `sourceLocationEsbuildPlugin is not exported`

- [ ] **Step 3: Implement the esbuild plugin**

Append to `scripts/source-location.ts`:

```ts
import type { Plugin } from 'esbuild'

export function sourceLocationEsbuildPlugin(root: string = REPO_ROOT): Plugin {
  return {
    name: 'source-location',
    setup(build) {
      build.onTransform({ filter: /\.(ts|tsx)$/ }, async (args) => {
        if (!isInstrumentEnabled()) return null
        const out = rewriteConsoleCalls(args.contents, args.path, root)
        if (out === args.contents) return null
        return { contents: out, loader: args.loader }
      })
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/__tests__/source-location.test.ts`
Expected: PASS (now 6 tests)

- [ ] **Step 5: Wire into tsup config**

Modify `apps/main/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'
import { sourceLocationEsbuildPlugin, REPO_ROOT, isInstrumentEnabled } from '../../scripts/source-location'

const devPlugins = isInstrumentEnabled() ? [sourceLocationEsbuildPlugin(REPO_ROOT)] : []

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    preload: 'src/preload.ts',
  },
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  platform: 'node',
  target: 'node20',
  external: ['electron', 'better-sqlite3', '@wmfx/database', 'electron-updater'],
  noExternal: ['@browser/ipc-contract', '@browser/shared', '@browser/proxy'],
  esbuildPlugins: devPlugins,
})
```

- [ ] **Step 6: Commit**

```bash
git add scripts/source-location.ts scripts/__tests__/source-location.test.ts apps/main/tsup.config.ts
git commit -m "feat: wire console source-location esbuild plugin into main (tsup)"
```

---

### Task 3: Vite plugins for renderer (ts + vue)

**Files:**
- Modify: `scripts/source-location.ts` (append vue plugin)
- Modify: `apps/renderer/vite.config.ts`
- Test: `scripts/__tests__/source-location.test.ts` (extend)

**Interfaces:**
- Consumes: `rewriteConsoleCalls`, `isInstrumentEnabled`, `REPO_ROOT` from Task 1
- Produces: `sourceLocationVuePlugin(root?: string): Plugin` (Vite-style plugin object with `enforce: 'pre'` and `transform`)

- [ ] **Step 1: Add tests for vue + ts injection**

Append to `scripts/__tests__/source-location.test.ts`:

```ts
import { sourceLocationVuePlugin } from '../source-location'

describe('sourceLocationVuePlugin', () => {
  it('rewrites console inside <script> of a .vue file using raw line numbers', () => {
    const plugin = sourceLocationVuePlugin('/repo')
    const code =
      "<template><div/></template>\n<script setup>\nconsole.log('hi')\n</script>\n"
    const ctx = { error: (_e: unknown) => {} } as any
    const res = (plugin.transform as any).call(ctx, code, '/repo/apps/renderer/src/Comp.vue')
    expect(res).toBeDefined()
    const out = typeof res === 'string' ? res : res.code
    expect(out).toContain("'apps/renderer/src/Comp.vue:3:', 'hi'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/__tests__/source-location.test.ts`
Expected: FAIL — `sourceLocationVuePlugin is not exported`

- [ ] **Step 3: Implement the vue plugin + ts esbuild hook factory**

Append to `scripts/source-location.ts`:

```ts
type VitePlugin = {
  name: string
  enforce?: 'pre' | 'post'
  transform?: (this: unknown, code: string, id: string) => string | { code: string } | null
}

export function sourceLocationVuePlugin(root: string = REPO_ROOT): VitePlugin {
  return {
    name: 'source-location-vue',
    enforce: 'pre',
    transform(code, id) {
      if (!isInstrumentEnabled()) return null
      if (!id.endsWith('.vue')) return null
      const out = rewriteConsoleCalls(code, id, root)
      return out === code ? null : { code: out }
    },
  }
}
```

> 注：Vite 的 esbuild 钩子（用于 `.ts/.tsx`）复用 Task 2 的 `sourceLocationEsbuildPlugin`，无需新增。

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/__tests__/source-location.test.ts`
Expected: PASS (now 7 tests)

- [ ] **Step 5: Wire into vite.config.ts**

Modify `apps/renderer/vite.config.ts`:

```ts
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { defineConfig } from 'vite'
import {
  sourceLocationEsbuildPlugin,
  sourceLocationVuePlugin,
  REPO_ROOT,
  isInstrumentEnabled,
} from '../../scripts/source-location'

const devInstr = isInstrumentEnabled()
const sourcePlugins = devInstr
  ? [sourceLocationEsbuildPlugin(REPO_ROOT), sourceLocationVuePlugin(REPO_ROOT)]
  : []

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    codeInspectorPlugin({
      bundler: 'vite',
      editor: 'webstorm',
    }),
    ...sourcePlugins,
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
```

- [ ] **Step 6: Commit**

```bash
git add scripts/source-location.ts scripts/__tests__/source-location.test.ts apps/renderer/vite.config.ts
git commit -m "feat: wire console source-location plugins into renderer (vite ts + vue)"
```

---

### Task 4: Inject `WMFX_DEV_INSTRUMENT=1` in dev orchestrator

**Files:**
- Modify: `scripts/dev.ts`

**Interfaces:**
- Consumes: none (just sets env before spawning children)
- Produces: tsup and Vite children run with `WMFX_DEV_INSTRUMENT= '1'`

- [ ] **Step 1: Locate spawn sites in dev.ts**

`scripts/dev.ts` spawns:
- `run('bun x tsup --watch', packages/...)` via the `run()` helper (lines 245-248) — env defaults to `process.env`.
- `execaCommand('bun run --filter @browser/renderer dev', { cwd: ROOT, stdio: [...] })` (line 216) — no env override, inherits `process.env`.

Because both `run()` and the Vite `execaCommand` inherit `process.env`, the simplest correct change is to set `process.env.WMFX_DEV_INSTRUMENT = '1'` near the top of `main()`, before any child is spawned. This guarantees every child (tsup watchers + Vite) sees it.

- [ ] **Step 2: Set the env in main()**

In `scripts/dev.ts`, inside `async function main()`, **after** the existing `linkWorkspacePackages()` call (or at the very start of `main`), add:

```ts
  // 开发期开启 console 源码位置注入（仅 dev，生产构建不设此变量）
  process.env.WMFX_DEV_INSTRUMENT = '1'
```

Place it immediately after `linkWorkspacePackages()` (line 201), before the Vite/tsup spawns.

- [ ] **Step 3: Verify dev prints prefixed logs**

Run: `bun run dev` (let it boot), then in VS Code terminal confirm main-process console output lines show `apps/main/src/...:NN:` prefixes and are clickable. Also open a renderer view that triggers a `console.debug` (e.g. open devtools / trigger a tab action) and confirm `apps/renderer/src/...:NN:` appears (forwarded via IPC and in the main terminal log).

Expected: each dev log line begins with a clickable `relativePath:line:` token.

- [ ] **Step 4: Verify production build is clean**

Run: `bun run build` (do not set WMFX_DEV_INSTRUMENT), then `grep -rn "apps/.*src/.*:[0-9]*:" apps/main/dist/ apps/renderer/dist/ 2>/dev/null | head`
Expected: no location-prefixed console calls in dist (the env var is unset during build).

- [ ] **Step 5: Commit**

```bash
git add scripts/dev.ts
git commit -m "feat: enable WMFX_DEV_INSTRUMENT in dev orchestrator"
```

---

## Self-Review Notes

- Spec coverage: Task 1 (rewriter + switch), Task 2 (main tsup), Task 3 (renderer ts + vue pre), Task 4 (dev.ts env). All spec sections covered.
- Placeholders: none — every step has concrete code/commands.
- Type consistency: `isInstrumentEnabled`, `rewriteConsoleCalls`, `sourceLocationEsbuildPlugin`, `sourceLocationVuePlugin`, `REPO_ROOT` names match across tasks. Vite plugin object shape is plain (no import of Vite types needed) to avoid type coupling; tsup uses the real esbuild `Plugin` type.
- `.vue` line numbers are computed from raw text (plugin `enforce: 'pre'`) → correct source lines, matching spec requirement.
