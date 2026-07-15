/**
 * 渲染进程统一日志：覆盖 console 方法，先保留原生输出（方便 DevTools 调试），
 * 再把日志条目通过 browserAPI.log 转发到主进程落盘。
 * 模块加载时自动初始化（见底部 initRendererLogger()），在 main.ts 中须最先 import。
 */

import type { LogEntry } from '@browser/ipc-contract'

type Level = LogEntry['level']

function serialize(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return `${arg.message}\n${arg.stack ?? ''}`
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

/**
 * 浏览器 console 用 %c 给后续文字套用 CSS 样式（%c 会「消费」紧随其后的那个样式参数）。
 * 转发到文件时这些样式无意义，反而留下一堆裸 %c 和 CSS 文本，这里成对剥离：
 * 去掉 %c 指令，并跳过它消费掉的样式参数（一个字符串里可含多个 %c）。
 */
function stripConsoleStyles(args: unknown[]): unknown[] {
  const out: unknown[] = []
  let skip = 0
  for (const arg of args) {
    if (skip > 0) {
      skip--
      continue
    }
    if (typeof arg === 'string') {
      const count = (arg.match(/%c/g) ?? []).length
      if (count > 0) {
        out.push(arg.replace(/%c/g, ''))
        skip = count
        continue
      }
    }
    out.push(arg)
  }
  return out
}

function send(level: Level, args: unknown[]): void {
  const message = stripConsoleStyles(args).map(serialize).join(' ')
  window.browserAPI?.log({ level, message })
}

export function initRendererLogger(): void {
  const native = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  }

  console.log = (...args: unknown[]): void => {
    native.log(...args)
    send('log', args)
  }
  console.info = (...args: unknown[]): void => {
    native.info(...args)
    send('info', args)
  }
  console.warn = (...args: unknown[]): void => {
    native.warn(...args)
    send('warn', args)
  }
  console.error = (...args: unknown[]): void => {
    native.error(...args)
    send('error', args)
  }
}

initRendererLogger()

/**
 * 全局错误兜底：同步异常和 Promise rejection 不会经过 console.error，
 * 需要单独监听，通过已有 log:frontend 通道转发到主进程落盘。
 */
window.addEventListener('error', (event: ErrorEvent) => {
  const msg = event.message || String(event.error ?? 'unknown error')
  const loc = event.filename ? ` @ ${event.filename}:${event.lineno}:${event.colno}` : ''
  const stack = event.error instanceof Error ? event.error.stack : ''
  console.error(`[Uncaught]${loc} ${msg}${stack ? `\n${stack}` : ''}`)
})

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const reason = event.reason
  const msg = reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason)
  console.error(`[UnhandledRejection] ${msg}`)
})
