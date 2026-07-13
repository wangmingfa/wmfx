/**
 * Mihomo REST API 客户端
 *
 * 通过 HTTP 调用 Mihomo 的 external-controller 接口进行核心控制：
 * - 获取/切换节点 (GET/PUT /proxies)
 * - 热更新配置 (PUT /configs)
 * - 测节点延迟 (GET /proxies/{name}/delay)
 *
 * 所有请求自动携带 Bearer Token 认证头，无需外部处理鉴权
 */
import type { ConfigManager } from './ConfigManager'
import type { ProxyGroup, ProxyNode } from './types'

export class ApiClient {
  private configManager: ConfigManager

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
  }

  /**
   * 统一 HTTP 请求方法
   * 自动拼接 base URL + path，携带 Bearer 认证头
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.configManager.getControllerUrl()}${path}`
    const secret = this.configManager.getSecret()
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
    }
    if (body) {
      options.body = JSON.stringify(body)
    }
    const res = await fetch(url, options)
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
    return res.json() as Promise<T>
  }

  /** 获取所有代理组和节点 (GET /proxies) */
  async getProxies(): Promise<Record<string, ProxyGroup & { all?: ProxyNode[] }>> {
    return this.request('GET', '/proxies')
  }

  /** 获取单个代理组详情 */
  async getProxyGroup(name: string): Promise<ProxyGroup & { all?: ProxyNode[] }> {
    return this.request('GET', `/proxies/${encodeURIComponent(name)}`)
  }

  /** 切换指定代理组的当前节点 (PUT /proxies/{group}) */
  async switchNode(groupName: string, nodeName: string): Promise<void> {
    await this.request('PUT', `/proxies/${encodeURIComponent(groupName)}`, { name: nodeName })
  }

  /** 获取当前配置和模式 (GET /configs) */
  async getMode(): Promise<{ mode: string }> {
    return this.request('GET', '/configs')
  }

  /** 设置代理模式 (PUT /configs) */
  async setMode(mode: 'rule' | 'global' | 'direct'): Promise<void> {
    await this.request('PUT', '/configs', { mode })
  }

  /** 测指定节点的延迟 (GET /proxies/{node}/delay) */
  async getDelay(nodeName: string, url = 'http://www.gstatic.com/generate_204'): Promise<number> {
    const result = await this.request<{ delay: number }>(
      'GET',
      `/proxies/${encodeURIComponent(nodeName)}/delay?url=${encodeURIComponent(url)}&timeout=5000`
    )
    return result.delay
  }

  /** 获取当前 Mihomo 配置快照 */
  async getConfig(): Promise<Record<string, unknown>> {
    return this.request('GET', '/configs')
  }

  /** 热更新部分配置，无需重启核心 (PATCH /configs) */
  async patchConfig(config: Record<string, unknown>): Promise<void> {
    await this.request('PATCH', '/configs', config)
  }

  /** 检查 Mihomo API 是否已就绪（启动后轮询使用） */
  async isReady(): Promise<boolean> {
    try {
      await this.request('GET', '/configs')
      return true
    } catch {
      return false
    }
  }
}
