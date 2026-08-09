import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path, { resolve } from 'node:path'
import { CYAN, delay, GREEN, RED, RESET, ROOT } from './constants.ts'
import type { ProcessManager } from './process-manager.ts'

/** tsup CLI 入口路径（直接用 node 运行，避免 bun x 的 segfault 和 Windows 控制台窗口问题） */
const TSUP_CLI = resolve(ROOT, 'node_modules/tsup/dist/cli-default.js')

/**
 * 主进程初次构建产物清单。
 * packages 不再需要独立构建——main 和 renderer 的 bundler 直接通过 alias 读取源码。
 */
const MAIN_OUTPUTS: string[] = [
  path.join(ROOT, 'apps/main/dist/index.cjs'),
  path.join(ROOT, 'apps/main/dist/preload.cjs'),
]
const BUILD_OUTPUTS = [...MAIN_OUTPUTS]

/**
 * 轮询等待给定产物文件全部出现（每个 200ms 检查一次），超时则报错退出。
 * 用于确认 main 的 tsup --watch 首次构建已完成。
 */
async function waitForOutputs(outputs: string[], timeoutMs: number): Promise<void> {
  const start = Date.now()
  const remaining = new Set(outputs)
  while (remaining.size > 0) {
    for (const out of [...remaining]) {
      if (existsSync(out)) remaining.delete(out)
    }
    if (remaining.size === 0) return
    if (Date.now() - start > timeoutMs) {
      const missing = [...remaining].map((p) => path.relative(ROOT, p)).join(', ')
      console.log(`${RED}✗${RESET} 等待构建超时，缺失产物: ${missing}`)
      process.exit(1)
    }
    await delay(200)
  }
}

/**
 * 清理 main 的 dist 目录，避免旧产物被误判为「已构建」。
 * packages 不再生成 dist，无需清理。
 */
export async function cleanAllDists(): Promise<void> {
  console.log(`${CYAN}[dev]${RESET} 🧹 清理 dist 目录...`)
  await Promise.all(
    BUILD_OUTPUTS.map((out) => rm(path.dirname(out), { recursive: true, force: true }))
  )
}

/**
 * 启动开发期构建编排：只启动 apps/main 的 tsup --watch。
 *
 * packages（shared/ipc-contract/proxy/database）不再需要独立构建：
 *   - main 进程（tsup）通过 esbuild alias 直接读取 packages 源码 TS 文件
 *   - renderer 进程（Vite）通过 Vite resolve.alias 直接读取 packages 源码 TS 文件
 * 省掉了 4 个 tsup --watch 进程，dev 启动更快、更稳定。
 */
export async function startWatchesAndWait(pm: ProcessManager): Promise<void> {
  const timeoutMs = 60_000

  console.log(
    `${CYAN}[dev]${RESET} 📦 启动主进程 tsup --watch（packages 源码直接读取，无需独立构建）`
  )
  // 用 node 直接运行 tsup CLI，不用 bun x：
  //  - bun x 在 Windows 上创建 .exe shim，在非 TTY 环境下容易 segfault
  //  - bun x + detached 会在 Windows 上为每个进程分配独立控制台窗口
  pm.spawn(`node "${TSUP_CLI}" --watch`, path.join(ROOT, 'apps/main'))
  await waitForOutputs(MAIN_OUTPUTS, timeoutMs)
  console.log(`${CYAN}[dev]${RESET} ${GREEN}✅${RESET} 主进程初次构建完成`)
}
