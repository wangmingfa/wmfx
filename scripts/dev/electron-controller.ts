import { spawnSync } from 'node:child_process'
import { statSync, watch } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { execa, type ResultPromise } from 'execa'
import { cleanShimEnv, delay, devLog, type LogLevel, RED, RESET, ROOT } from './constants.ts'
import { killTree } from './process-manager.ts'

const require = createRequire(import.meta.url)

interface ElectronControllerOptions {
  /** 发生致命错误（启动失败 / 意外退出 / 重启超时）时通知编排层执行整体关闭 */
  onFatal: () => void
}

/**
 * Electron 主进程的生命周期管理：启动、热重启、监听产物变化、优雅关闭。
 *
 * 设计要点：
 * - Electron 以独立进程组（detached）启动，终端 Ctrl+C 不直接杀它，改由本控制器
 *   经 IPC 优雅关闭后回收，从而能连带清理其 Mihomo 子进程、避免退出日志混入终端。
 * - stdout/stderr 以 pipe 转发到终端，让开发者看到主进程日志；关闭中停止转发，避免
 *   detached 进程在 orchestrator 退出后仍写终端。
 * - 内部状态（进程引用、重启标志等）全部封装为实例字段，不再依赖模块级全局变量。
 */
export class ElectronController {
  private process: ResultPromise | null = null
  /** 实际 Electron 进程 pid（进程组 leader）。waitAndForceKill 会把 this.process 置空，
   *  但强制回收（如 exit handler）仍须能按此 pid 对整组发信号，故单独持久保存 */
  private electronPid: number | null = null
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private isRestarting = false
  private startupComplete = false
  /** 整体关闭进行中：置位后忽略进程 close 事件，避免重复触发关闭 */
  private shuttingDown = false

  private devServerUrl = ''
  private logLevel: LogLevel = 'debug'

  constructor(private readonly opts: ElectronControllerOptions) {}

  setDevServerUrl(url: string): void {
    this.devServerUrl = url
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level
  }

  /** 标记初次启动完成，之后才允许产物变化触发热重启 */
  markStartupComplete(): void {
    this.startupComplete = true
  }

  private resolveBinary(): string {
    return require('electron')
  }

  /** 等待 CJS 入口文件存在且非空（最多重试 maxRetries 次，每次间隔 intervalMs） */
  private async waitForEntry(
    entryPath: string,
    maxRetries = 15,
    intervalMs = 500
  ): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const stat = statSync(entryPath)
        if (stat.isFile() && stat.size > 0) {
          return true
        }
      } catch {
        // 文件不存在或无法读取，继续重试
      }
      devLog(`⏳ 等待入口文件就绪 (${i + 1}/${maxRetries}): ${path.relative(ROOT, entryPath)}`)
      await delay(intervalMs)
    }
    console.error(
      `${RED}[dev]${RESET} ❌ 入口文件 ${path.relative(ROOT, entryPath)} 在 ${
        maxRetries * intervalMs
      }ms 内未就绪，启动失败`
    )
    this.opts.onFatal()
    return false
  }

  /** 启动 Electron 进程 */
  async start(): Promise<void> {
    // 取消尚未执行的重启请求，避免刚启动就被下一轮 restart 杀掉
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    this.isRestarting = false

    const binary = this.resolveBinary()
    const entry = path.join(ROOT, 'apps/main/dist/index.cjs')

    // 等待 CJS 入口文件就绪（tsup 重建期间文件可能尚未写入）
    if (!(await this.waitForEntry(entry))) {
      return
    }

    devLog(`🖥️  启动 Electron: ${binary} ${entry} [log=${this.logLevel}]`)
    // stdout/stderr 用 pipe 并手动转发到终端，让开发者看到 Electron 主进程日志；
    // shuttingDown 后停止转发，避免 detached 进程在 orchestrator 退出后仍写终端
    const proc = execa(binary, [entry], {
      cwd: ROOT,
      stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
      detached: true,
      windowsHide: true,
      env: {
        ...cleanShimEnv(process.env),
        VITE_DEV_SERVER_URL: this.devServerUrl,
        WMFX_LOG_LEVEL: this.logLevel,
      },
    }) as unknown as ResultPromise
    proc.stdout?.on('data', (chunk: Buffer) => {
      if (!this.shuttingDown) process.stdout.write(chunk)
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      if (!this.shuttingDown) process.stderr.write(chunk)
    })
    this.process = proc
    this.electronPid = typeof proc.pid === 'number' ? proc.pid : null

    proc.catch((err: Error & { killed?: boolean }) => {
      // SIGTERM 是正常重启信号（旧进程被 kill），不视为错误
      if (err.killed) return
      console.error(`${RED}[dev] Electron 启动失败:`, err.message)
      this.opts.onFatal()
    })
    proc.on('close', (code: number | null) => this.handleClose(proc, code))
  }

  /** 处理进程 close 事件：区分「重启预期退出 / 已被替换 / 关闭中 / 意外退出」 */
  private handleClose(instance: ResultPromise, code: number | null): void {
    if (this.isRestarting) {
      this.isRestarting = false
      // 旧进程被 kill 是预期行为，由 restart 负责启动新进程
      return
    }
    // 旧进程的 close 事件不应干扰已替换的新进程
    if (this.process !== instance) return
    if (this.shuttingDown) return

    this.process = null
    if (code !== null && code !== 0) {
      console.log(`${RED}[dev]${RESET} Electron 退出，code=${code}`)
    } else {
      console.log('🛑 Electron 关闭，正在清理...')
    }
    this.opts.onFatal()
  }

  /**
   * 热重启 Electron（防抖 300ms）：
   * 1. kill 旧进程 → 等待其完全退出（含 Mihomo 子进程清理），超时则触发整体关闭
   * 2. 短暂延迟让端口完全释放
   * 3. 启动新进程
   */
  async restart(): Promise<void> {
    if (!this.startupComplete) return
    if (this.restartTimer) clearTimeout(this.restartTimer)

    this.restartTimer = setTimeout(async () => {
      this.isRestarting = true
      if (!this.process) {
        this.isRestarting = false
        await this.start()
        return
      }

      devLog('🔄 重启 Electron...')
      const proc = this.process
      proc.kill()

      // 等待旧进程完全退出，最多 5 秒
      await Promise.race([
        new Promise<void>((resolve) => proc.once('close', () => resolve())),
        delay(5000),
      ])

      // 注意：this.process 可能已被 close handler 置为 null
      const stillRunning = this.process !== null && !this.process.killed
      if (stillRunning) {
        console.error(`${RED}[dev]${RESET} 旧 Electron 进程未响应 kill，强制退出并清理`)
        killTree(this.process, 'SIGKILL')
        this.opts.onFatal()
        return
      }

      this.process = null
      // 短暂延迟让 Mihomo 子进程和端口完全释放
      await delay(200)
      await this.start()
    }, 300)
  }

  /** 监听主进程 dist 产物变化以触发热重启 */
  watchForChanges(): void {
    const distDir = path.join(ROOT, 'apps/main/dist')
    try {
      watch(distDir, { recursive: true }, (_eventType: string, filename: string | null) => {
        if (filename?.endsWith('.cjs')) {
          console.log(`📝 主进程变化: ${filename}`)
          this.restart()
        }
      })
      console.log(`👀 监听 ${path.relative(ROOT, distDir)}/ 变化以重启 Electron`)
    } catch (err) {
      console.error('监听主进程 dist 失败:', err)
    }
  }

  /**
   * 同步发起关闭：立即（不 await）通知 Electron 收尾。
   *
   * 为什么同步：dev.ts 经多层 shell（bun shim → mvm run → 嵌套 bun）启动，
   * 是孙子进程，父层收到 Ctrl+C 后可能在我们 await 期间就把 dev.ts 拆掉，
   * 导致 detached 的 Electron 变成孤儿。因此终止信号必须在任何 await 之前同步发出。
   *
   * 关闭策略：
   * - macOS/Linux：同时发送 IPC 和 SIGTERM。IPC 用于 bun 内部通信，SIGTERM 直接触发
   *   Electron 的 process.on('SIGTERM') 处理器（gracefulExit → app.quit()），确保即使
   *   IPC 在 Bun 下不可靠也能让 Electron 开始优雅退出（will-quit → proxyManager.stop）。
   * - Windows：IPC 是唯一可靠路径，因为 Windows 上 process.kill(pid, SIGTERM) 实际是
   *   TerminateProcess 硬杀，不会触发 Electron 的 process.on('SIGTERM') 处理器。
   */
  beginGracefulShutdown(): void {
    this.shuttingDown = true
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }

    const proc = this.process
    if (proc && !proc.killed) {
      // 尽力发送 IPC 优雅关闭信号（Bun 下可能不可靠）
      try {
        proc.send('dev:shutdown')
      } catch {
        /* IPC 通道已不可用 */
      }
      // macOS/Linux 上直接用 SIGTERM 触发 Electron 的 gracefulExit → app.quit()
      //（见 apps/main/src/index.ts:362-363）。Windows 上 SIGTERM = TerminateProcess 硬杀，跳过。
      if (process.platform !== 'win32') {
        const pid = this.electronPid
        if (pid !== null) {
          try {
            process.kill(pid, 'SIGTERM')
          } catch {
            /* 进程已退出 */
          }
        }
      }
    }
  }

  /**
   * 等待 Electron 自行退出（IPC 触发的 app.quit()），超时后 taskkill /T /F 强杀
   * 整棵进程树（含 Mihomo 等孙进程）。
   * 需在 beginGracefulShutdown() 之后调用。
   */
  async waitAndForceKill(timeoutMs = 3000): Promise<void> {
    const proc = this.process
    this.process = null
    if (proc && !proc.killed) {
      await Promise.race([
        new Promise<void>((resolve) => {
          proc.once('close', () => resolve())
          proc.once('exit', () => resolve())
        }),
        delay(timeoutMs),
      ])
    }
    // Windows 上用 taskkill /T /F 递归杀整棵进程树
    killTree(proc, 'SIGKILL')
  }

  /** 立即强杀（用于第二次 Ctrl+C 的即时退出路径 / exit handler 兜底）。
   *  this.process 可能已被 waitAndForceKill 置空，此时退回按 electronPid 对
   *  detached 进程组发 SIGKILL，确保 Electron 及 Mihomo 孙进程仍被回收。 */
  forceKill(): void {
    if (this.process) {
      killTree(this.process, 'SIGKILL')
      return
    }
    const pid = this.electronPid
    if (pid === null) return
    if (process.platform === 'win32') {
      try {
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        })
      } catch {
        /* 进程已退出 */
      }
    } else {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        /* 进程已退出 */
      }
    }
  }
}
