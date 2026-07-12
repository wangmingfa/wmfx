import WebSocket from 'ws'
import type { ConfigManager } from './ConfigManager'
import type { TrafficData } from './types'

export class TrafficMonitor {
  private ws: WebSocket | null = null
  private configManager: ConfigManager
  private listeners: Set<(data: TrafficData) => void> = new Set()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
  }

  connect(): void {
    if (this.ws) return

    const cfg = this.configManager.getConfig()
    const url = `ws://${cfg.controllerHost}:${cfg.controllerPort}/traffic`
    this.ws = new WebSocket(url)

    this.ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as TrafficData
        for (const cb of this.listeners) cb(parsed)
      } catch {
        /* ignore parse errors */
      }
    })

    this.ws.on('close', () => {
      this.ws = null
      this.reconnectTimer = setTimeout(() => this.connect(), 3000)
    })

    this.ws.on('error', () => {
      this.ws?.close()
    })
  }

  disconnect(): void {
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
