/**
 * Session 管理器 — 封装 Electron session.fromPartition
 *
 * 负责：
 * - 创建 default / incognito 等分区 session
 * - 通过 proxyRules 选项将 WebContents 流量路由到本地 Mihomo 代理
 *
 * 注意：这是"应用内代理"方案，不改系统代理，
 * 只有本浏览器的 WebContents 走 Mihomo
 */
import { type Session, session } from 'electron'

export interface SessionConfig {
  name: string
  partition: string
  inMemory: boolean
}

export class SessionManager {
  private sessions = new Map<string, SessionConfig>()
  /** 代理规则字符串，传递给 session.fromPartition 的 proxyRules */
  private proxyRules?: string

  constructor() {
    this.registerDefaultSession()
  }

  private registerDefaultSession(): void {
    this.sessions.set('default', {
      name: 'default',
      partition: 'persist:default',
      inMemory: false,
    })
    this.sessions.set('incognito', {
      name: 'incognito',
      partition: 'persist:incognito',
      inMemory: true,
    })
  }

  /** 设置全局代理规则，后续创建的 session 都会走代理 */
  setProxyRules(rules?: string): void {
    this.proxyRules = rules
  }

  /**
   * 获取或创建指定名称的 session
   * 如果设置了 proxyRules，会传递给 session.fromPartition
   */
  getSession(name: string): Session {
    let config = this.sessions.get(name)
    if (!config) {
      config = {
        name,
        partition: `persist:${name}`,
        inMemory: false,
      }
      this.sessions.set(name, config)
    }
    const opts: { cache: boolean; proxyRules?: string } = { cache: !config.inMemory }
    if (this.proxyRules) {
      opts.proxyRules = this.proxyRules
    }
    return session.fromPartition(config.partition, opts)
  }

  getPartitions(): string[] {
    return Array.from(this.sessions.keys())
  }
}
