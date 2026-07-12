import type { SubscriptionRecord, SubscriptionRepository } from '@wmfx/database'

interface ProxyNode {
  name: string
  type: string
  server: string
  port: number
  [key: string]: unknown
}

interface SubscriptionData {
  proxies: ProxyNode[]
  proxyGroups: { name: string; type: string; proxies: string[] }[]
  rules: string[]
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
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error('Invalid subscription URL. Only HTTP/HTTPS URLs are supported.')
    }

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
      active: 0,
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

  activateSubscription(id: string): void {
    this.repo.deactivateAll()
    this.repo.update(id, { active: 1 })
  }

  deactivateSubscription(id: string): void {
    this.repo.update(id, { active: 0 })
  }

  getActiveSubscription(): SubscriptionRecord | null {
    return this.repo.findActive() ?? null
  }

  async fetchSubscriptionData(url: string): Promise<SubscriptionData> {
    return this.fetchAndParse(url)
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
      proxyGroups: [],
      rules: [],
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
          ...p,
          name: String(p.name || ''),
          type: String(p.type || ''),
          server: String(p.server || ''),
          port: Number(p.port || 0),
        }))
      }
      if (Array.isArray(json['proxy-groups'])) {
        result.proxyGroups = (json['proxy-groups'] as Record<string, unknown>[]).map((g) => ({
          name: String(g.name || ''),
          type: String(g.type || 'select'),
          proxies: Array.isArray(g.proxies) ? g.proxies.map(String) : [],
        }))
      }
      if (Array.isArray(json.rules)) {
        result.rules = json.rules.map(String)
      }
      return result
    } catch {
      // Not JSON
    }

    // Try parsing as YAML (clash format)
    const yamlParsed = this.parseClashYaml(decoded)
    if (yamlParsed) {
      return yamlParsed
    }

    // Try parsing as base64-encoded proxy list (ss/ssr/vmess/vless/trojan links)
    const lines = decoded.split('\n').filter((l) => l.trim())
    for (const line of lines) {
      const trimmed = line.trim()
      if (
        trimmed.startsWith('ss://') ||
        trimmed.startsWith('ssr://') ||
        trimmed.startsWith('vmess://') ||
        trimmed.startsWith('vless://') ||
        trimmed.startsWith('trojan://')
      ) {
        const node = this.parseProxyLink(trimmed)
        if (node) result.proxies.push(node)
      }
    }

    return result
  }

  private parseClashYaml(content: string): SubscriptionData | null {
    // Only parse if it looks like Clash YAML
    if (!content.includes('proxies:') && !content.includes('proxy-groups:')) {
      return null
    }

    const result: SubscriptionData = {
      proxies: [],
      proxyGroups: [],
      rules: [],
      upload: 0,
      download: 0,
      total: 0,
      expire: 0,
    }

    const lines = content.split('\n')
    let section: 'none' | 'proxies' | 'proxy-groups' | 'rules' = 'none'
    let currentProxy: Record<string, unknown> | null = null
    let currentGroup: { name: string; type: string; proxies: string[] } | null = null
    let groupProxies: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      const indent = line.length - line.trimStart().length

      // Section detection (top-level keys)
      if (indent === 0 || (indent <= 2 && !trimmed.startsWith('-') && !trimmed.startsWith('#'))) {
        if (trimmed === 'proxies:' || trimmed.startsWith('proxies:')) {
          if (currentProxy) result.proxies.push(currentProxy as unknown as ProxyNode)
          currentProxy = null
          section = 'proxies'
          continue
        }
        if (trimmed === 'proxy-groups:' || trimmed.startsWith('proxy-groups:')) {
          if (currentProxy) result.proxies.push(currentProxy as unknown as ProxyNode)
          if (currentGroup) {
            currentGroup.proxies = groupProxies
            result.proxyGroups.push(currentGroup)
          }
          currentProxy = null
          currentGroup = null
          groupProxies = []
          section = 'proxy-groups'
          continue
        }
        if (trimmed === 'rules:' || trimmed.startsWith('rules:')) {
          if (currentProxy) result.proxies.push(currentProxy as unknown as ProxyNode)
          if (currentGroup) {
            currentGroup.proxies = groupProxies
            result.proxyGroups.push(currentGroup)
          }
          currentProxy = null
          currentGroup = null
          section = 'rules'
          continue
        }
      }

      if (section === 'proxies') {
        if (trimmed.startsWith('- name:')) {
          if (currentProxy) result.proxies.push(currentProxy as unknown as ProxyNode)
          currentProxy = {
            name: trimmed
              .slice(7)
              .trim()
              .replace(/^['"]|['"]$/g, ''),
          }
        } else if (currentProxy) {
          const kv = this.parseYamlKV(trimmed)
          if (kv) currentProxy[kv.key] = kv.value
        }
      } else if (section === 'proxy-groups') {
        if (trimmed.startsWith('- name:')) {
          if (currentGroup) {
            currentGroup.proxies = groupProxies
            result.proxyGroups.push(currentGroup)
          }
          currentGroup = {
            name: trimmed
              .slice(7)
              .trim()
              .replace(/^['"]|['"]$/g, ''),
            type: 'select',
            proxies: [],
          }
          groupProxies = []
        } else if (currentGroup) {
          const kv = this.parseYamlKV(trimmed)
          if (kv && kv.key === 'type') {
            currentGroup.type = String(kv.value)
          }
          if (trimmed.startsWith('- ') && !trimmed.includes(':')) {
            groupProxies.push(
              trimmed
                .slice(2)
                .trim()
                .replace(/^['"]|['"]$/g, '')
            )
          }
        }
      } else if (section === 'rules') {
        if (trimmed.startsWith('- ')) {
          result.rules.push(trimmed.slice(2).trim())
        }
      }
    }

    // Flush last items
    if (currentProxy) result.proxies.push(currentProxy as unknown as ProxyNode)
    if (currentGroup) {
      currentGroup.proxies = groupProxies
      result.proxyGroups.push(currentGroup)
    }

    return result
  }

  private parseYamlKV(line: string): { key: string; value: unknown } | null {
    const match = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (!match) return null
    let val: unknown = match[2].trim()
    // Strip quotes
    if (
      typeof val === 'string' &&
      ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"')))
    ) {
      val = val.slice(1, -1)
    }
    if (val === 'true') val = true
    else if (val === 'false') val = false
    else if (!Number.isNaN(Number(val)) && val !== '') val = Number(val)
    return { key: match[1], value: val }
  }

  private parseProxyLink(link: string): ProxyNode | null {
    try {
      const proto = link.split('://')[0]
      const rest = link.slice(proto.length + 3)
      // Extract name from fragment
      const hashIdx = rest.lastIndexOf('#')
      const name =
        hashIdx >= 0
          ? decodeURIComponent(rest.slice(hashIdx + 1))
          : `${proto} ${this.repo.findAll().length + 1}`
      return { name, type: proto, server: '', port: 0 }
    } catch {
      return null
    }
  }
}
