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
  private onLog?: (msg: string) => void
  private onError?: (msg: string) => void

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
  }

  /** 设置日志和错误回调 */
  setCallbacks(callbacks: {
    onLog?: (msg: string) => void
    onError?: (msg: string) => void
  }): void {
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
    if (!existsSync(binaryPath)) {
      throw new Error(`Mihomo binary not found at ${binaryPath}`)
    }

    /** spawn 独立进程，-d 指定配置目录 */
    this.process = spawn(binaryPath, ['-d', this.configManager.configDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      this.onLog?.(data.toString().trim())
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      this.onError?.(data.toString().trim())
    })

    this.process.on('exit', (code) => {
      this.process = null
      this.onLog?.(`Mihomo exited with code ${code}`)
      /** 仅在非主动停止时才自动重启 */
      if (!this.stopRequested && this.restartCount < this.maxRestarts) {
        this.restartCount++
        this.onLog?.(`Restarting mihomo (attempt ${this.restartCount})...`)
        setTimeout(() => this.start(), 1000)
      }
    })

    this.restartCount = 0
    this.onLog?.('Mihomo started')
  }

  /**
   * 优雅停止 Mihomo
   * 1. 先调 REST API POST /stop 让 Mihomo 清理连接
   * 2. 再 SIGTERM 兜底 kill（API 不可用时也能强制终止）
   */
  stop(): void {
    this.stopRequested = true
    if (!this.process) return
    const secret = this.configManager.getSecret()
    const url = `${this.configManager.getControllerUrl()}/stop`
    fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
      .catch(() => {})
      .finally(() => {
        if (this.process) {
          this.process.kill('SIGTERM')
          this.process = null
        }
      })
  }

  isRunning(): boolean {
    return this.process !== null
  }

  getStatus(): MihomoStatus {
    return {
      running: this.isRunning(),
      pid: this.process?.pid,
      port: this.configManager.getMixedPort(),
    }
  }
}
