import { createRequire } from 'node:module'
import path from 'node:path'
import { execa } from 'execa'
import { devLog, ROOT } from './constants.ts'
import type { ProcessManager } from './process-manager.ts'

const require = createRequire(import.meta.url)

// 就绪正则放宽：覆盖 localhost / 127.0.0.1 / [::1]（IPv6），匹配 Vite 各种 host 输出
const VITE_READY_REGEX = /http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+/i

// ANSI 转义码（颜色/样式），Vite 输出中 URL 可能被颜色码分割（如 http://\x1b[1mlocalhost\x1b[22m:24680/）
// 匹配前需清除，否则正则无法匹配完整 URL
const ANSI_REGEX = /\x1b\[[0-9;]*m/g

/**
 * 启动渲染进程 Vite dev server，返回在其就绪时 resolve 出访问 URL 的 Promise。
 *
 * 直接调用 vite 二进制而非 `bun run --filter`：
 * `bun run --filter` 在非 TTY 环境下会向子进程传递关闭的 stdin，
 * 导致 Vite 检测到 EOF 后退出（exit code 1）。直接运行 vite 二进制可避免此问题。
 *
 * 其他健壮性设计：
 * 1. 监听子进程 catch —— Vite 在就绪前崩溃（端口冲突 strictPort、编译错误等）
 *    立即 reject 并把真实报错回传，不再傻等超时。
 * 2. 同时缓冲 stdout + stderr，就绪正则放宽，避免 IPv6 / 127.0.0.1 漏匹配。
 * 3. 匹配前清除 ANSI 颜色码，防止颜色码嵌入 URL 导致正则失配。
 * 4. 超时仅作兜底（给冷机首次构建留足时间），超时报错附带最近输出片段便于排查。
 */
export function startViteServer(pm: ProcessManager, devPort: number): Promise<string> {
  devLog('🚀 启动渲染进程 Vite dev server...')

  // 解析 vite 二进制路径和 renderer 工作目录
  // require.resolve('vite') 返回入口文件 .../vite/dist/node/index.js，
  // 上溯 3 级得到包根目录 .../vite/，再拼接 bin/vite.js
  const viteEntry = require.resolve('vite')
  const vitePkgDir = path.dirname(path.dirname(path.dirname(viteEntry)))
  const viteBin = path.join(vitePkgDir, 'bin', 'vite.js')
  const rendererDir = path.join(ROOT, 'apps', 'renderer')

  // 注意：不使用 detached: true。在 Windows 上 detached + piped stdio 会导致
  // stdout/stderr 管道收不到数据，Vite 的输出（含错误信息）被完全吞掉。
  // 进程树回收由 killTree 通过 taskkill /T 处理。
  const vite = execa('node', [viteBin], {
    cwd: rendererDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, VITE_DEV_PORT: String(devPort) },
  })
  pm.track(vite)

  return new Promise<string>((resolve, reject) => {
    let buffer = ''
    let resolved = false

    const tryMatch = () => {
      // 清除 ANSI 颜色码后再匹配，防止颜色码嵌入 URL 导致失配
      const cleanBuffer = buffer.replace(ANSI_REGEX, '')
      const match = cleanBuffer.match(VITE_READY_REGEX)
      if (match) {
        resolved = true
        clearTimeout(timer)
        resolve(match[0])
      }
    }

    // 失败兜底：带最近 20 行输出，方便定位为什么没起来
    const fail = (reason: string) => {
      if (resolved) return
      clearTimeout(timer)
      const tail = buffer.split('\n').slice(-20).join('\n')
      reject(new Error(`Vite 启动失败：${reason}\n\n最近输出：\n${tail}`))
    }

    const stdout = vite.stdout as NodeJS.ReadableStream | null
    const stderr = vite.stderr as NodeJS.ReadableStream | null
    stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      process.stdout.write(text)
      buffer += text
      tryMatch()
    })
    stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk)
      buffer += chunk.toString()
      tryMatch() // stderr 也参与就绪匹配
    })

    // 关键：Vite 在就绪前崩溃 → 立即失败，不再等超时。
    // 但 stdout data 事件可能晚于进程退出事件到达，所以 catch 中再检查一次 buffer。
    vite.catch((err) => {
      // 最后机会：数据事件可能晚于 catch，再检查一次 buffer
      const cleanBuffer = buffer.replace(ANSI_REGEX, '')
      const match = cleanBuffer.match(VITE_READY_REGEX)
      if (match) {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          resolve(match[0])
        }
        return
      }
      if (!resolved) fail(err?.message ?? String(err))
    })

    // 兜底超时（留足冷机首次构建时间），失败信息含输出片段
    const timer = setTimeout(
      () => fail(`在 120s 内未检测到就绪输出（端口 ${devPort}）`),
      120_000
    )
  })
}
