import { execaCommand, type ResultPromise } from 'execa'

/**
 * 强制回收子进程：detached 子进程是独立进程组 leader，用负 PID 对整组发信号，
 * 连带杀掉 electron → mihomo 等孙进程；进程组已不存在时退回单进程 kill。
 *
 * Windows 上 process.kill(-pid) 不支持，退回到 execa 的 .kill()。
 */
export function killTree(p: ResultPromise | null, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!p || p.killed || typeof p.pid !== 'number') return
  const isWindows = process.platform === 'win32'
  if (!isWindows) {
    try {
      process.kill(-p.pid, signal)
      return
    } catch {
      /* fall through to p.kill */
    }
  }
  try {
    p.kill(signal)
  } catch {
    /* ignore already-dead */
  }
}

/** spawn() 的额外选项 */
export interface SpawnOptions {
  /** 是否以 detached 进程组模式运行（默认 false）。
   *  Windows 上 detached 进程会分配独立控制台窗口，仅 Electron 等特殊场景需要。 */
  detached?: boolean
  /** 额外环境变量 */
  env?: NodeJS.ProcessEnv
}

/**
 * 后台子进程（vite / tsup --watch 等）的生命周期管理。
 *
 * 默认不以 detached 启动：tsup 等子进程作为普通子进程运行，Ctrl+C 会自然终止它们。
 * Electron 才需要 detached（独立的进程组 + 自己的生命周期管理），见 electron-controller.ts。
 */
export class ProcessManager {
  private readonly children: ResultPromise[] = []

  /** 以 stdio:inherit 启动命令并纳入管理。默认非 detached（Windows 上不开新控制台窗口）。 */
  spawn(command: string, cwd: string, opts: SpawnOptions = {}): ResultPromise {
    const { detached = false, env = {} } = opts
    const p = execaCommand(command, {
      cwd,
      stdio: 'inherit',
      detached,
      windowsHide: true,
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
