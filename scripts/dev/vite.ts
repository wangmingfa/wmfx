import { execa } from 'execa'
import { resolve } from 'node:path'
import { devLog, ROOT } from './constants.ts'
import type { ProcessManager } from './process-manager.ts'

const VITE_BIN = resolve(ROOT, 'node_modules/vite/bin/vite.js')

/**
 * 启动渲染进程 Vite dev server，并返回一个在其就绪时 resolve 出访问 URL 的 Promise。
 *
 * 注意：
 * - 不用 `bun run --filter`——非 TTY 环境下会向子进程传递关闭的 stdin，导致 Vite exit 1
 * - 不用 `detached: true`——Windows 上 detached + piped stdio 会导致 stdout/stderr 收不到数据
 * - 不解析 stdout 匹配 URL——Vite 输出含 ANSI 颜色码（如 \x1b[1mlocalhost\x1b[22m），
 *   正则匹配不可靠；改用 fetch 轮询端口判断就绪，更稳健
 */
export function startViteServer(pm: ProcessManager, devPort: number): Promise<string> {
  devLog('🚀 启动渲染进程 Vite dev server...')
  const vite = execa('node', [VITE_BIN], {
    cwd: resolve(ROOT, 'apps/renderer'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, VITE_DEV_PORT: String(devPort) },
  })
  pm.track(vite)

  // 转发 Vite stdout/stderr 到主进程，方便调试
  vite.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk))
  vite.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk))

  const url = `http://localhost:${devPort}`

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite 30s 内未就绪')), 30000)

    // 每 500ms 轮询端口，fetch 成功即就绪
    const poll = setInterval(async () => {
      try {
        const res = await fetch(url)
        if (res.ok || res.status > 0) {
          clearTimeout(timeout)
          clearInterval(poll)
          devLog(`✅ Vite 就绪 (${res.status})`)
          resolve(url)
        }
      } catch {
        // 端口未就绪，继续轮询
      }
    }, 500)

    // Vite 进程意外退出时取消轮询
    vite.on('exit', (code) => {
      clearTimeout(timeout)
      clearInterval(poll)
      if (code !== 0 && code !== null) {
        reject(new Error(`Vite 进程退出，code=${code}`))
      }
    })
  })
}
