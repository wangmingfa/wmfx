import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { ConfigManager } from './ConfigManager'
import { getMihomoBinaryPath } from './CoreDownloader'
import type { MihomoStatus } from './types'

export class MihomoProcess {
  private process: ChildProcess | null = null
  private configManager: ConfigManager
  private restartCount = 0
  private maxRestarts = 3
  private onLog?: (msg: string) => void
  private onError?: (msg: string) => void

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
  }

  setCallbacks(callbacks: {
    onLog?: (msg: string) => void
    onError?: (msg: string) => void
  }): void {
    this.onLog = callbacks.onLog
    this.onError = callbacks.onError
  }

  start(): void {
    if (this.process) {
      this.stop()
    }

    const binaryPath = getMihomoBinaryPath()
    if (!existsSync(binaryPath)) {
      throw new Error(`Mihomo binary not found at ${binaryPath}`)
    }

    this.process = spawn(binaryPath, ['-d', this.configManager['configDir']], {
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
      if (this.restartCount < this.maxRestarts) {
        this.restartCount++
        this.onLog?.(`Restarting mihomo (attempt ${this.restartCount})...`)
        setTimeout(() => this.start(), 1000)
      }
    })

    this.restartCount = 0
    this.onLog?.('Mihomo started')
  }

  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
    }
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
