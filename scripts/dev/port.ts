import { execaCommand } from 'execa'
import { CYAN, RED, RESET, ROOT } from './constants.ts'

/**
 * 检查指定端口是否被占用，若被占用则直接 kill 占用进程。
 * 跨平台：macOS/Linux 用 lsof，Windows 用 netstat + taskkill。
 */
export async function ensurePortFree(port: number): Promise<void> {
  console.log(`${CYAN}[dev]${RESET} 🔍 检查端口 ${port}...`)
  try {
    const check = await execaCommand(
      process.platform === 'win32' ? `netstat -ano | findstr :${port}` : `lsof -ti tcp:${port}`,
      { cwd: ROOT, timeout: 5000 }
    )
    if (!check.stdout.trim()) {
      console.log(`${CYAN}[dev]${RESET} ✅ 端口 ${port} 可用`)
      return
    }

    const pids = check.stdout
      .trim()
      .split(/\r?\n/)
      .map((l) => {
        const m = l.trim().match(/(\d+)$/m)
        return m ? m[1] : l.trim()
      })
      .filter(Boolean)
    const divider = `${RED}══════════════════════════════════════════════════════════════════${RESET}`
    console.log(divider)
    console.log(`${RED} ⚠️  端口 ${port} 已被占用，已终止以下进程：${pids.join(', ')}${RESET}`)
    console.log(divider)
    for (const pid of pids) {
      try {
        await execaCommand(
          process.platform === 'win32' ? `taskkill //PID ${pid} //F` : `kill -9 ${pid}`,
          { timeout: 5000 }
        )
      } catch {
        /* ignore already-dead */
      }
    }
  } catch {
    console.log(`${CYAN}[dev]${RESET} ✅ 端口 ${port} 可用`)
  }
}
