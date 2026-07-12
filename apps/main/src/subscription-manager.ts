import type { SubscriptionRecord, SubscriptionRepository } from '@wmfx/database'

interface ProxyNode {
  name: string
  type: string
  server: string
  port: number
}

interface SubscriptionData {
  proxies: ProxyNode[]
  upload: number
  download: number
  total: number
  expire: number
}

export class SubscriptionManager {
  private repo: SubscriptionRepository

  constructor(repo: SubscriptionRepository) {
    this.repo = repo
  }

  getSubscriptions(): SubscriptionRecord[] {
    return this.repo.findAll()
  }

  async addSubscription(url: string, name: string): Promise<string> {
    const existing = this.repo.findByUrl(url)
    if (existing) {
      throw new Error(`Subscription already exists: ${existing.name}`)
    }

    let data: SubscriptionData
    try {
      data = await this.fetchAndParse(url)
    } catch (e) {
      throw new Error(`Failed to fetch subscription: ${e}`)
    }

    return this.repo.create({
      name,
      url,
      last_update: Date.now(),
      expire: data.expire,
      upload: data.upload,
      download: data.download,
      total: data.total,
    })
  }

  async removeSubscription(id: string): Promise<void> {
    this.repo.delete(id)
  }

  async updateSubscription(id: string): Promise<void> {
    const sub = this.repo.findById(id)
    if (!sub) throw new Error(`Subscription not found: ${id}`)

    const data = await this.fetchAndParse(sub.url)
    this.repo.update(id, {
      last_update: Date.now(),
      expire: data.expire,
      upload: data.upload,
      download: data.download,
      total: data.total,
    })
  }

  async fetchAndParse(url: string): Promise<SubscriptionData> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const text = await res.text()
    return this.parseSubscriptionContent(text)
  }

  private parseSubscriptionContent(content: string): SubscriptionData {
    const result: SubscriptionData = {
      proxies: [],
      upload: 0,
      download: 0,
      total: 0,
      expire: 0,
    }

    // Try to decode base64
    let decoded = content
    try {
      decoded = atob(content.trim())
    } catch {
      // Not base64, use as-is (might be YAML/clash format)
    }

    // Try parsing as JSON (clash format)
    try {
      const json = JSON.parse(decoded) as Record<string, unknown>
      if (Array.isArray(json.proxies)) {
        result.proxies = (json.proxies as Record<string, unknown>[]).map((p) => ({
          name: String(p.name || ''),
          type: String(p.type || ''),
          server: String(p.server || ''),
          port: Number(p.port || 0),
        }))
      }
      return result
    } catch {
      // Not JSON
    }

    // Try parsing as base64-encoded proxy list (ss/ssr/vmess links)
    const lines = decoded.split('\n').filter((l) => l.trim())
    for (const line of lines) {
      const trimmed = line.trim()
      if (
        trimmed.startsWith('ss://') ||
        trimmed.startsWith('ssr://') ||
        trimmed.startsWith('vmess://')
      ) {
        result.proxies.push({
          name: `Proxy ${result.proxies.length + 1}`,
          type: trimmed.split('://')[0],
          server: '',
          port: 0,
        })
      }
    }

    return result
  }
}
