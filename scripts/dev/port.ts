import { execaCommand } from 'execa'
import { CYAN, RED, RESET, ROOT } from './constants.ts'

/**
 * 检查并释放指定端口。若被占用则 kill 占用进程及子进程树。
 *
 * 直接通过 netstat（Windows）/ lsof（Unix）查找占用进程 PID，不依赖
 * Node.js `net.createServer` 预检——后者在 Windows 上受 SO_REUSEADDR 等
 * 内核行为影响，可能与实际服务端（Vite）的绑定结果不一致，导致误判"可用"。
 */
export async function ensurePortFree(port: number): Promise<void> {
  console.log(`${CYAN}[dev]${RESET} 🔍 检查端口 ${port}...`)

  const pids = [...new Set(await getPidsOnPort(port))]
  if (pids.length === 0) {
    console.log(`${CYAN}[dev]${RESET} ✅ 端口 ${port} 可用`)
    return
  }

  const divider = `${RED}══════════════════════════════════════════════════════════════════${RESET}`
  console.log(divider)
  console.log(`${RED} ⚠️  端口 ${port} 已被占用，正在终止进程：${pids.join(', ')}${RESET}`)
  console.log(divider)

  for (const pid of pids) {
    try {
      if (process.platform === 'win32') {
        // /T 递归杀子进程树，/F 强制终止
        await execaCommand(`taskkill /PID ${pid} /T /F`, { timeout: 5000 })
      } else {
        await execaCommand(`kill -9 ${pid}`, { timeout: 5000 })
      }
    } catch {
      /* 进程可能已退出 */
    }
  }

  // 等待端口释放（操作系统回收 socket 需要时间）
  await new Promise((r) => setTimeout(r, 1500))

  console.log(`${CYAN}[dev]${RESET} ✅ 端口 ${port} 已释放`)
}

/** 查找占用指定端口的进程 PID 列表 */
async function getPidsOnPort(port: number): Promise<string[]> {
  try {
    if (process.platform === 'win32') {
      // netstat -ano 不需要 shell 管道，execaCommand 在 Windows 上走 CMD 可直接执行
      const check = await execaCommand('netstat -ano', { cwd: ROOT, timeout: 5000 })
      return check.stdout
        .split(/\r?\n/)
        .filter((l) => l.includes(`:${port}`) && (l.includes('LISTENING') || l.includes('ESTABLISHED') || l.includes('TIME_WAIT')))
        .map((l) => {
          const m = l.trim().match(/(\d+)\s*$/)
          return m ? m[1] : ''
        })
        .filter(Boolean)
    }
    // Unix: lsof -ti 直接输出 PID
    const check = await execaCommand(`lsof -ti tcp:${port}`, { timeout: 5000 })
    return check.stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
  } catch {
    return []
  }
}
