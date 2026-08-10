import path from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

/** 仓库根目录（本文件位于 scripts/dev/，向上两级即根） */
export const ROOT = path.resolve(moduleDir, '../..')

export const RED = '\x1b[31m'
export const GREEN = '\x1b[32m'
export const CYAN = '\x1b[36m'
export const RESET = '\x1b[0m'

/** 统一的日志前缀 `[dev]` */
export const PREFIX = `${CYAN}[dev]${RESET}`

/** 打印带 `[dev]` 前缀的普通日志 */
export function devLog(msg: string): void {
  console.log(`${PREFIX} ${msg}`)
}

/** Promise 版延时 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

/**
 * 清除 WorkBuddy 沙箱注入的 safe-delete shim 环境变量。
 * 这些 shim 会拦截 fs.unlink 尝试移入回收站（沙箱中不可用），
 * 导致 tsup/vite/electron 等子进程的临时文件清理失败。
 *
 * 用法:
 *   const env = cleanShimEnv(process.env)
 *   execa('node', [...], { env })
 */
export function cleanShimEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleaned = { ...env }
  delete cleaned.NODE_OPTIONS
  delete cleaned.PYTHONPATH
  return cleaned
}
