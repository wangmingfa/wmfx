import { execa } from 'execa'
import { CYAN, delay, RED, RESET, ROOT } from './constants.ts'

/** 从 netstat 输出中提取监听指定端口的 PID 列表 */
function extractPidsFromNetstat(stdout: string, port: number): string[] {
  const portStr = String(port)
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.includes(`:${portStr}`) && line.includes('LISTENING'))
    .map((line) => {
      const m = line.trim().match(/(\d+)$/m)
      return m ? m[1] : ''
    })
    .filter(Boolean)
}

/** 执行端口占用检查，返回占用该端口的 PID 列表 */
async function checkPort(port: number): Promise<string[]> {
  if (process.platform === 'win32') {
    const { stdout } = await execa('netstat', ['-ano'], {
      cwd: ROOT,
      timeout: 5000,
    })
    return extractPidsFromNetstat(stdout, port)
  }
  // macOS/Linux: lsof 返回 PID 列表，无占用则退出码 1
  try {
    const { stdout } = await execa('lsof', ['-ti', `tcp:${port}`], {
      cwd: ROOT,
      timeout: 5000,
    })
    return stdout.trim().split(/\r?\n/).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * 检查指定端口是否被占用，若被占用则 kill 占用进程，然后轮询等待端口真正释放。
 *
 * 跨平台：macOS/Linux 用 lsof，Windows 用 netstat + taskkill。
 *
 * Windows 上 `taskkill //F` 后 TCP 端口可能短暂处于 TIME_WAIT，
 * Vite 以 `strictPort: true` 启动时会因此报 EADDRINUSE。
 * 这里加轮询确认端口真 free 了再返回，彻底消除竞态。
 */
export async function ensurePortFree(port: number): Promise<void> {
  console.log(`${CYAN}[dev]${RESET} 🔍 检查端口 ${port}...`)
  const pids = await checkPort(port)
  if (pids.length === 0) {
    console.log(`${CYAN}[dev]${RESET} ✅ 端口 ${port} 可用`)
    return
  }

  const divider = `${RED}══════════════════════════════════════════════════════════════════${RESET}`
  console.log(divider)
  console.log(`${RED} ⚠️  端口 ${port} 已被占用，正在终止：${pids.join(', ')}${RESET}`)
  console.log(divider)
  for (const pid of pids) {
    try {
      // 用 execa + 参数数组，不用 execaCommand（execaCommand 在 Bun 下不走 shell，
      // taskkill //PID 4472 //F 的 // 会被当作字面参数导致静默失败）
      if (process.platform === 'win32') {
        await execa('taskkill', ['/PID', pid, '/F'], { timeout: 5000 })
      } else {
        await execa('kill', ['-9', pid], { timeout: 5000 })
      }
    } catch {
      /* ignore already-dead */
    }
  }

  // 轮询等待端口真正释放（Windows TIME_WAIT 最多等 10s）
  console.log(`${CYAN}[dev]${RESET} ⏳ 等待端口 ${port} 释放...`)
  for (let i = 0; i < 20; i++) {
    await delay(500)
    const remaining = await checkPort(port)
    if (remaining.length === 0) {
      console.log(`${CYAN}[dev]${RESET} ✅ 端口 ${port} 已释放`)
      return
    }
  }
  console.log(`${CYAN}[dev]${RESET} ⚠️  端口 ${port} 10s 内未释放，继续启动（Vite 会自动重试）`)
}
