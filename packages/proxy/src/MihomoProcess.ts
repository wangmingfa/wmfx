/**
 * Mihomo 进程管理器
 *
 * 职责：
 * - 通过 spawn 启动 Mihomo 独立进程（-d <configDir>）
 * - 捕获 stdout/stderr 输出到回调
 * - 自动重启（最多 3 次）
 * - 优雅关闭：先调 REST API /stop，再 SIGTERM 兜底
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { ConfigManager } from './ConfigManager'
import { getMihomoBinaryPath } from './CoreDownloader'
import type { MihomoStatus } from './types'

export class MihomoProcess {
  private process: ChildProcess | null = null
  private configManager: ConfigManager
  /** 当前自动重启次数，用于判断是否超过最大重试次数 */
  private restartCount = 0
  /** 最大自动重启次数上限，超过后不再尝试重启 */
  private maxRestarts = 3
  /** 标记主动停止，避免意外关闭时自动重启 */
  private stopRequested = false
  /** 崩溃后延迟重启的定时器引用，stop() 时需清除，防止退出后仍重启成孤儿进程 */
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private onLog?: (msg: string) => void
  private onError?: (msg: string) => void

  constructor(configManager: ConfigManager) {
    console.debug('[MihomoProcess] constructor: initializing')
    this.configManager = configManager
  }

  /** 设置日志和错误回调 */
  setCallbacks(callbacks: {
    onLog?: (msg: string) => void
    onError?: (msg: string) => void
  }): void {
    console.debug('[MihomoProcess] setCallbacks: registering log/error callbacks')
    this.onLog = callbacks.onLog
    this.onError = callbacks.onError
  }

  /** 启动 Mihomo 进程 */
  start(): void {
    if (this.process) {
      this.stop()
    }
    this.stopRequested = false

    const binaryPath = getMihomoBinaryPath()
    console.debug(
      `[MihomoProcess] start: binary=${binaryPath}, configDir=${this.configManager.configDir}`
    )
    if (!existsSync(binaryPath)) {
      throw new Error(`Mihomo binary not found at ${binaryPath}`)
    }

    /** spawn 独立进程，-d 指定配置目录；detached 使子进程成为进程组组长，
     *  stop() 的 process.kill(-pid) 才能杀整个进程组（mihomo 可能 fork 子进程） */
    const child = spawn(binaryPath, ['-d', this.configManager.configDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    })
    this.process = child

    child.stdout?.on('data', (data: Buffer) => {
      this.onLog?.(data.toString().trim())
    })

    child.stderr?.on('data', (data: Buffer) => {
      this.onError?.(data.toString().trim())
    })

    child.on('error', (err) => {
      // 仅在仍是本进程时清引用，避免误清后续 start() 新建的进程；
      // spawn 错误（EACCES/ENOENT 等）不触发自动重启——二进制缺失/无权限时重启同样会失败
      if (this.process === child) {
        this.process = null
      }
      console.debug(`[MihomoProcess] spawn error: ${err.message}`)
      this.onError?.(`Process error: ${err.message}`)
    })

    child.on('exit', (code) => {
      // 仅在仍是本进程时清引用，避免误清 stop()/start() 竞态下新建的进程
      if (this.process === child) {
        this.process = null
      }
      console.debug(
        `[MihomoProcess] exit: code=${code}, stopRequested=${this.stopRequested}, restartCount=${this.restartCount}`
      )
      this.onLog?.(`Mihomo exited with code ${code}`)
      /** 仅在非主动停止时才自动重启；定时器保存引用供 stop() 清除 */
      if (!this.stopRequested && this.restartCount < this.maxRestarts) {
        this.restartCount++
        this.onLog?.(`Restarting mihomo (attempt ${this.restartCount})...`)
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null
          // 回调时再复查 stopRequested：stop() 可能已在延迟期间被调用
          if (!this.stopRequested) {
            this.start()
          }
        }, 1000)
      }
    })

    this.restartCount = 0
    console.debug(`[MihomoProcess] start: spawned pid=${child.pid}`)
    this.onLog?.('Mihomo started')
  }

  /**
   * 优雅停止 Mihomo
   * 1. 先调 REST API POST /stop 让 Mihomo 清理连接
   * 2. 再 SIGTERM 兜底 kill（API 不可用时也能强制终止）
   *
   * 注意：stop() 是同步返回的（fetch 在后台进行），调用方可能紧接着 start() 新建进程。
   * 因此这里捕获发起停止时的进程引用，异步回调只操作该旧进程，
   * 不会误杀 stop 之后 start() 的新进程。
   */
  stop(): void {
    this.stopRequested = true
    // 清除待触发的崩溃重启定时器，防止退出后仍重启成孤儿进程
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    const proc = this.process
    if (!proc) return
    const pid = proc.pid
    const secret = this.configManager.getSecret()
    const url = `${this.configManager.getControllerUrl()}/stop`
    console.debug(`[MihomoProcess] stop: attempting API stop at ${url}`)
    fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      // API 停止带超时：Mihomo 卡死/不响应时 1s 后仍会走 SIGTERM 兜底，
      // 避免 .finally 永不执行导致退出后进程残留
      signal: AbortSignal.timeout(1000),
    })
      .catch(() => {
        console.debug('[MihomoProcess] stop: API stop failed, falling back to SIGTERM')
      })
      .finally(() => {
        if (proc) {
          console.debug(`[MihomoProcess] stop: sending SIGTERM to pid=${pid}`)
          // 杀掉整个进程组（mihomo 可能 fork 子进程），防止 Ctrl+C 后残留
          if (process.platform !== 'win32' && pid) {
            try {
              process.kill(-pid, 'SIGTERM')
            } catch {
              /* already dead */
            }
          }
          proc.kill('SIGTERM')
        }
        // 仅在仍是本进程时清引用，避免清掉 stop() 后 start() 新建的进程
        if (this.process === proc) {
          this.process = null
        }
      })
  }

  isRunning(): boolean {
    return this.process !== null
  }

  getStatus(): MihomoStatus {
    console.debug(`[MihomoProcess] getStatus: running=${this.process !== null}`)
    return {
      running: this.isRunning(),
      pid: this.process?.pid,
      port: this.configManager.getMixedPort(),
    }
  }
}
