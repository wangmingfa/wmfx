import type { ApiClient } from './ApiClient'

interface DelayResult {
  nodeName: string
  delay: number
  error?: string
}

export class HealthChecker {
  private apiClient: ApiClient
  /** 并发测速请求数量，控制同一时间最多同时检测的节点数 */
  private concurrency: number

  constructor(apiClient: ApiClient, concurrency = 5) {
    this.apiClient = apiClient
    this.concurrency = concurrency
  }

  async checkNode(nodeName: string): Promise<DelayResult> {
    try {
      const delay = await this.apiClient.getDelay(nodeName)
      return { nodeName, delay }
    } catch (e) {
      return { nodeName, delay: -1, error: String(e) }
    }
  }

  async checkGroup(groupName: string): Promise<DelayResult[]> {
    const group = await this.apiClient.getProxyGroup(groupName)
    if (!group.all) return []

    const results: DelayResult[] = []
    for (let i = 0; i < group.all.length; i += this.concurrency) {
      const batch = group.all.slice(i, i + this.concurrency)
      const batchResults = await Promise.all(batch.map((name) => this.checkNode(name)))
      results.push(...batchResults)
    }
    return results
  }
}
