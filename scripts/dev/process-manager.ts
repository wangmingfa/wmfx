import { execaCommand, type ResultPromise } from 'execa'

/**
 * 强制回收子进程：detached 子进程是独立进程组 leader，用负 PID 对整组发信号，
 * 连带杀掉 bun x → tsup → esbuild、electron → mihomo 等孙进程；
 * 进程组已不存在时退回单进程 kill。
 */
export function killTree(p: ResultPromise | null, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!p || p.killed || typeof p.pid !== 'number') return
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
 * 所有子进程均以 detached 方式启动，成为独立进程组 leader —— 终端的 Ctrl+C(SIGINT)
 * 不会直接投递给它们，改由本管理器统一按进程组回收，避免 `bun x → tsup → esbuild`
 * 之类孙进程变成孤儿继续往终端打印（这正是"需要多次 Ctrl+C 才能停干净"的根因）。
 */
export class ProcessManager {
  private readonly children: ResultPromise[] = []

  /** 以 detached + stdio:inherit 方式启动命令并纳入管理 */
  spawn(command: string, cwd: string, env: NodeJS.ProcessEnv = {}): ResultPromise {
    const p = execaCommand(command, {
      cwd,
      stdio: 'inherit',
      detached: true,
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
   * 同步向全部子进程组发终止信号（默认 SIGTERM），不等待退出。
   * 用于关闭第一阶段：在任何 await 之前尽快让 vite/tsup 收到终止信号，
   * 避免 orchestrator 被上层 shell 拆掉时留下孤儿。
   */
  terminate(signal: NodeJS.Signals = 'SIGTERM'): void {
    for (const p of this.children) killTree(p, signal)
  }

  /** 按进程组强杀全部子进程 */
  killAll(signal: NodeJS.Signals = 'SIGKILL'): void {
    for (const p of this.children) killTree(p, signal)
  }
}
