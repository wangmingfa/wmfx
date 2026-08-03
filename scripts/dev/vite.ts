import { execaCommand } from 'execa'
import { devLog, ROOT } from './constants.ts'
import type { ProcessManager } from './process-manager.ts'

/**
 * 启动渲染进程 Vite dev server，并返回一个在其就绪时 resolve 出访问 URL 的 Promise。
 *
 * - detached 进程组：终端 Ctrl+C 不直接投递（stdout 仍是我们持有的 pipe，读取不受影响）
 * - 从 stdout 中匹配 `http://localhost:<port>` 判定就绪，30 秒未就绪则 reject
 */
export function startViteServer(pm: ProcessManager, devPort: number): Promise<string> {
  devLog('🚀 启动渲染进程 Vite dev server...')
  const vite = execaCommand('bun run --filter @browser/renderer dev', {
    cwd: ROOT,
    stdio: ['inherit', 'pipe', 'inherit'],
    detached: true,
    env: { ...process.env, VITE_DEV_PORT: String(devPort) },
  })
  pm.track(vite)

  return new Promise<string>((resolve, reject) => {
    let buf = ''
    const timeout = setTimeout(() => reject(new Error('Vite 30s 内未就绪')), 30000)
    const stdout = vite.stdout as NodeJS.ReadableStream | null
    const stderr = vite.stderr as NodeJS.ReadableStream | null
    stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      process.stdout.write(text)
      buf += text
      const match = buf.match(/http:\/\/localhost:\d+/)
      if (match) {
        clearTimeout(timeout)
        resolve(match[0])
      }
    })
    stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk))
  })
}
