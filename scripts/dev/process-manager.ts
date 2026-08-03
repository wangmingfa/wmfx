import { execa, execaCommand, execaCommandSync, type ResultPromise } from 'execa'

/**
 * 强制回收子进程及其子孙进程树。
 *
 * 跨平台策略：
 * - Unix: detached 子进程是独立进程组 leader，用负 PID 对整组发信号，
 *   连带杀掉 bun x → tsup → esbuild、electron → mihomo 等孙进程。
 * - Windows: process.kill(-pid) 不支持（ESRCH），改用 taskkill /PID /T /F
 *   递归终止进程树。
 * 两者失败时退回单进程 kill。
 */
export function killTree(p: ResultPromise | null, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!p || p.killed || typeof p.pid !== 'number') return

  if (process.platform === 'win32') {
    // Windows: taskkill /T 递归杀子进程，/F 强制
    try {
      execaCommandSync(`taskkill /PID ${p.pid} /T /F`, { timeout: 3000 })
      return
    } catch {
      // 进程可能已退出，尝试退回单进程 kill
    }
  }

  // Unix: 负 PID 对进程组发信号
  try {
    process.kill(-p.pid, signal)
  } catch {
    try {
      p.kill(signal)
    } catch {
      /* ignore already-dead */
    }
  }
}

/**
 * 后台子进程（vite / tsup --watch 等）的生命周期管理。
 *
 * 子进程以 detached 方式启动，成为独立进程组 leader —— 终端的 Ctrl+C(SIGINT)
 * 不会直接投递给它们，改由本管理器统一回收，避免 `bun x → tsup → esbuild`
 * 之类孙进程变成孤儿继续往终端打印（这正是"需要多次 Ctrl+C 才能停干净"的根因）。
 *
 * 注意：detached + piped stdio 在 Windows 上会导致 stdout/stderr 收不到数据。
 * 需要捕获输出的进程（如 Vite、Electron）不应使用 detached，改由 killTree
 * 通过 taskkill /T 回收进程树。
 */
export class ProcessManager {
  private readonly children: ResultPromise[] = []

  /** 启动命令并纳入管理。Unix 用 detached 创建进程组，Windows 不用（会导致 stdio 问题） */
  spawn(command: string, cwd: string, env: NodeJS.ProcessEnv = {}): ResultPromise {
    const p = execaCommand(command, {
      cwd,
      stdio: 'inherit',
      // Unix: detached 使子进程成为进程组 leader，Ctrl+C 不直接杀它，由本管理器统一回收。
      // Windows: detached + stdio(任何模式) 都有兼容性问题，不用；
      //   进程树回收由 killTree 通过 taskkill /T 处理。
      detached: process.platform !== 'win32',
      env: { ...process.env, ...env },
    })
    this.track(p)
    return p
  }

  /** 以数组形式启动命令（避免路径中的特殊字符被 shell 解析）并纳入管理 */
  spawnArgs(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): ResultPromise {
    const p = execa(command, args, {
      cwd,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
      env: { ...process.env, ...env },
    })
    this.track(p)
    return p
  }

  /** 纳管一个已在外部创建的进程（如需自定义 stdio 的 vite），统一参与清理 */
  track(p: ResultPromise): void {
    this.children.push(p)
    // 被 kill 时 execa 会 reject，忽略避免堆栈打印
    p.catch(() => {})
  }

  /**
   * 同步向全部子进程发终止信号，不等待退出。
   * 用于关闭第一阶段：在任何 await 之前尽快让 vite/tsup 收到终止信号，
   * 避免 orchestrator 被上层 shell 拆掉时留下孤儿。
   */
  terminate(signal: NodeJS.Signals = 'SIGTERM'): void {
    for (const p of this.children) killTree(p, signal)
  }

  /** 强杀全部子进程树 */
  killAll(signal: NodeJS.Signals = 'SIGKILL'): void {
    for (const p of this.children) killTree(p, signal)
  }
}
