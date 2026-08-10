import { spawnSync } from 'node:child_process'
import { execaCommand, type ResultPromise } from 'execa'
import { cleanShimEnv } from './constants.ts'

/**
 * 强制回收子进程树。
 *
 * - macOS/Linux：detached 子进程是独立进程组 leader，用负 PID 对整组发信号，
 *   连带杀掉 electron → mihomo 等孙进程。
 * - Windows：process.kill(-pid) 不支持，p.kill() 只杀父进程不杀子进程树。
 *   改用 taskkill /PID <pid> /T /F 递归杀整棵进程树（含 Mihomo 等孙进程）。
 *
 * 用 spawnSync 而非 execSync：execSync 走 cmd.exe shell，
 * 在信号/退出处理器中 spawn shell 可能静默失败；spawnSync 直接启动进程更可靠。
 */
export function killTree(p: ResultPromise | null, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!p || typeof p.pid !== 'number') return
  if (p.killed && signal === 'SIGTERM') return

  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      return
    } catch {
      /* 进程已退出 */
    }
  } else {
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

  /** 以 stdio:inherit 启动命令并纳入管理。默认非 detached（Windows 上不开新控制台窗口）。
   *  自动清除 NODE_OPTIONS / PYTHONPATH 避免 safe-delete shim 干扰。 */
  spawn(command: string, cwd: string, opts: SpawnOptions = {}): ResultPromise {
    const { detached = false, env = {} } = opts
    const p = execaCommand(command, {
      cwd,
      stdio: 'inherit',
      detached,
      windowsHide: true,
      env: { ...cleanShimEnv(process.env), ...env },
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
