import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { devLog, LOG_LEVELS, type LogLevel, ROOT } from './constants.ts'

const ENV_LOCAL = path.join(ROOT, '.env.local')
const ENV_EXAMPLE = path.join(ROOT, '.env.example')
const DEFAULT_PORT = 24680

/** 从 .env.local 读取上一次保存的日志等级（取最后一个匹配项），不存在则返回 'debug' */
export function readLastLogLevel(): LogLevel {
  try {
    const content = readFileSync(ENV_LOCAL, 'utf-8')
    const matches = [...content.matchAll(/^\s*WMFX_LOG_LEVEL\s*=\s*([a-z]+)\s*$/gm)]
    const last = matches[matches.length - 1]
    if (last && LOG_LEVELS.includes(last[1] as LogLevel)) return last[1] as LogLevel
  } catch {
    /* .env.local 不存在时忽略 */
  }
  return 'debug'
}

/** 将用户选择的日志等级写入 .env.local，方便下次启动复用。逐行遍历，保留原位，去除多余重复行。 */
export function writeLogLevel(level: LogLevel): void {
  try {
    const lines = readFileSync(ENV_LOCAL, 'utf-8').split('\n')
    const newLine = `WMFX_LOG_LEVEL=${level}`
    let replaced = false
    const result: string[] = []
    for (const line of lines) {
      if (/^\s*WMFX_LOG_LEVEL\s*=/.test(line)) {
        if (!replaced) {
          result.push(newLine)
          replaced = true
        }
      } else {
        result.push(line)
      }
    }
    if (!replaced) result.push(newLine)
    writeFileSync(ENV_LOCAL, result.join('\n'), 'utf-8')
  } catch {
    /* 写入失败忽略 */
  }
}

/**
 * 确保 .env.local 存在且包含有效的 VITE_DEV_PORT：
 *  1. 不存在则从 .env.example 复制
 *  2. VITE_DEV_PORT 缺失或为空则补默认端口
 */
export function ensureEnvLocal(): void {
  if (!existsSync(ENV_LOCAL)) {
    writeFileSync(ENV_LOCAL, readFileSync(ENV_EXAMPLE, 'utf-8'), 'utf-8')
    devLog('📝 已创建 .env.local（从 .env.example 复制）')
  }

  let content = readFileSync(ENV_LOCAL, 'utf-8')
  const portMatch = content.match(/^\s*VITE_DEV_PORT\s*=\s*(.*?)\s*$/m)
  if (!portMatch || portMatch[1].trim() === '') {
    content = portMatch
      ? content.replace(/^\s*VITE_DEV_PORT\s*=.*$/m, `VITE_DEV_PORT=${DEFAULT_PORT}`)
      : `${content}\nVITE_DEV_PORT=${DEFAULT_PORT}\n`
    writeFileSync(ENV_LOCAL, content, 'utf-8')
    devLog(`📝 已设置 .env.local 默认端口 VITE_DEV_PORT=${DEFAULT_PORT}`)
  }
}

/** 读取 .env.local 中的 VITE_DEV_PORT，缺失时返回默认端口 */
export function readDevPort(): number {
  const content = readFileSync(ENV_LOCAL, 'utf-8')
  const m = content.match(/^\s*VITE_DEV_PORT\s*=\s*(\d+)\s*$/m)
  return m ? parseInt(m[1], 10) : DEFAULT_PORT
}
