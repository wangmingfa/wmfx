import type { ConfigManager } from './ConfigManager'
import type { ProxyGroup, ProxyNode } from './types'

export class ApiClient {
  private configManager: ConfigManager

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.configManager.getControllerUrl()}${path}`
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    }
    if (body) {
      options.body = JSON.stringify(body)
    }
    const res = await fetch(url, options)
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
    return res.json() as Promise<T>
  }

  async getProxies(): Promise<Record<string, ProxyGroup & { all?: ProxyNode[] }>> {
    return this.request('GET', '/proxies')
  }

  async getProxyGroup(name: string): Promise<ProxyGroup & { all?: ProxyNode[] }> {
    return this.request('GET', `/proxies/${encodeURIComponent(name)}`)
  }

  async switchNode(groupName: string, nodeName: string): Promise<void> {
    await this.request('PUT', `/proxies/${encodeURIComponent(groupName)}`, { name: nodeName })
  }

  async getMode(): Promise<{ mode: string }> {
    return this.request('GET', '/configs')
  }

  async setMode(mode: 'rule' | 'global' | 'direct'): Promise<void> {
    await this.request('PUT', '/configs', { mode })
  }

  async getDelay(nodeName: string, url = 'http://www.gstatic.com/generate_204'): Promise<number> {
    const result = await this.request<{ delay: number }>(
      'GET',
      `/proxies/${encodeURIComponent(nodeName)}/delay?url=${encodeURIComponent(url)}&timeout=5000`
    )
    return result.delay
  }

  async getConfig(): Promise<Record<string, unknown>> {
    return this.request('GET', '/configs')
  }

  async patchConfig(config: Record<string, unknown>): Promise<void> {
    await this.request('PATCH', '/configs', config)
  }

  async isReady(): Promise<boolean> {
    try {
      await this.request('GET', '/configs')
      return true
    } catch {
      return false
    }
  }
}
