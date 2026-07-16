import WebSocket from 'ws'
import type { ConfigManager } from './ConfigManager'
import type { TrafficData } from './types'

export class TrafficMonitor {
  private ws: WebSocket | null = null
  private configManager: ConfigManager
  private listeners: Set<(data: TrafficData) => void> = new Set()
  /** 断线重连定时器引用，断开后 3 秒自动重连；显式停止时用于清理避免重复重连 */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
  }

  connect(): void {
    if (this.ws) return

    const cfg = this.configManager.getConfig()
    const url = `ws://${cfg.controllerHost}:${cfg.controllerPort}/traffic`
    console.debug(`[TrafficMonitor] connect: url=${url}`)
    this.ws = new WebSocket(url)

    this.ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as TrafficData
        for (const cb of this.listeners) cb(parsed)
      } catch {
        /* ignore parse errors */
      }
    })

    this.ws.on('close', (code) => {
      console.debug(`[TrafficMonitor] close: code=${code}, scheduling reconnect in 3s`)
      this.ws = null
      this.reconnectTimer = setTimeout(() => this.connect(), 3000)
    })

    this.ws.on('error', (err) => {
      console.debug(`[TrafficMonitor] error: ${err.message}`)
      this.ws?.close()
    })
  }

  disconnect(): void {
    console.debug('[TrafficMonitor] disconnect: closing WebSocket and clearing reconnect timer')
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  onData(cb: (data: TrafficData) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }
}
