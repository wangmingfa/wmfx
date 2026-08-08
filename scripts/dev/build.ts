import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path, { resolve } from 'node:path'
import { CYAN, delay, GREEN, RED, RESET, ROOT } from './constants.ts'
import type { ProcessManager } from './process-manager.ts'

/** tsup CLI 入口路径（直接用 node 运行，避免 bun x 的 segfault 和 Windows 控制台窗口问题） */
const TSUP_CLI = resolve(ROOT, 'node_modules/tsup/dist/cli-default.js')

/**
 * 每个包的初次构建产物清单，用于「等所有 watch 首次构建完成」的轮询检查。
 * 依据各包 tsup.config.ts 的 entry/format/outExtension 得出。
 */
const DEP_PACKAGE_OUTPUTS: string[] = [
  path.join(ROOT, 'packages/shared/dist/index.js'),
  path.join(ROOT, 'packages/ipc-contract/dist/index.js'),
  path.join(ROOT, 'packages/database/dist/index.cjs'),
  path.join(ROOT, 'packages/proxy/dist/index.js'),
]
const MAIN_OUTPUTS: string[] = [
  path.join(ROOT, 'apps/main/dist/index.cjs'),
  path.join(ROOT, 'apps/main/dist/preload.cjs'),
]
const BUILD_OUTPUTS = [...DEP_PACKAGE_OUTPUTS, ...MAIN_OUTPUTS]

/**
 * 轮询等待给定产物文件全部出现（每个 200ms 检查一次），超时则报错退出。
 * 用于确认某批 tsup --watch 的首次构建已完成。
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
 * 清理所有 dist 目录，避免旧产物被误判为「已构建」。
 * 必须在 Vite 启动之前执行：若 Vite 启动后被 cleanDist 删除工作区包 dist/，
 * Vite 的依赖预构建会触发服务重启，导致新实例绑定端口时与旧实例冲突（EBUSY）。
 */
export async function cleanAllDists(): Promise<void> {
  console.log(`${CYAN}[dev]${RESET} 🧹 清理所有 dist 目录...`)
  await Promise.all(
    BUILD_OUTPUTS.map((out) => rm(path.dirname(out), { recursive: true, force: true }))
  )
}

/**
 * 启动开发期构建编排：
 *  1. 并发启动 4 个依赖包 watch，等它们首次构建全部完成
 *  2. 再启动 apps/main watch（此时依赖产物已就绪，主进程 build 不会解析失败），等其完成
 *
 * 主进程依赖前面四个包，因此分两阶段顺序等待：先依赖、后主进程。
 * 任意时刻同一 dist/ 最多一个 tsup 实例在写，消除 ENOENT / 解析失败竞争。
 *
 * 注意：dist 清理已抽离为 cleanAllDists()，调用方须在 Vite 启动前调用。
 */
export async function startWatchesAndWait(pm: ProcessManager): Promise<void> {
  const timeoutMs = 60_000

  console.log(`${CYAN}[dev]${RESET} 📦 并发启动依赖包 tsup --watch（shared/ipc/database/proxy）`)
  // 用 node 直接运行 tsup CLI，不用 bun x：
  //  - bun x 在 Windows 上创建 .exe shim，在非 TTY 环境下容易 segfault
  //  - bun x + detached 会在 Windows 上为每个进程分配独立控制台窗口
  pm.spawn(`node "${TSUP_CLI}" --watch`, path.join(ROOT, 'packages/shared'))
  pm.spawn(`node "${TSUP_CLI}" --watch`, path.join(ROOT, 'packages/ipc-contract'))
  pm.spawn(`node "${TSUP_CLI}" --watch`, path.join(ROOT, 'packages/database'))
  pm.spawn(`node "${TSUP_CLI}" --watch`, path.join(ROOT, 'packages/proxy'))
  await waitForOutputs(DEP_PACKAGE_OUTPUTS, timeoutMs)
  console.log(`${CYAN}[dev]${RESET} ${GREEN}✅${RESET} 依赖包初次构建完成`)

  console.log(`${CYAN}[dev]${RESET} 📦 启动主进程 tsup --watch（依赖已就绪）`)
  pm.spawn(`node "${TSUP_CLI}" --watch`, path.join(ROOT, 'apps/main'))
  await waitForOutputs(MAIN_OUTPUTS, timeoutMs)
  console.log(`${CYAN}[dev]${RESET} ${GREEN}✅${RESET} 主进程初次构建完成`)
}
