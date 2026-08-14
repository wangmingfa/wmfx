/**
 * Session 管理器 — 封装 Electron session.fromPartition
 *
 * 负责：
 * - 创建 default / incognito 等分区 session
 * - 通过 proxyRules 选项将 WebContents 流量路由到本地 Mihomo 代理
 *
 * 注意：这是"应用内代理"方案，不改系统代理，
 * 只有本浏览器的 WebContents 走 Mihomo
 *
 * 无痕分区：不使用 `persist:` 前缀，为真正的内存 session；
 * 最后一个无痕窗口关闭后由 clearIncognitoData() 清空存储。
 */
import { type Session, session } from 'electron'

export interface SessionConfig {
  name: string
  partition: string
  inMemory: boolean
}

/** 无痕内存分区名（无 persist: 前缀 = Electron 内存 session） */
export const INCOGNITO_PARTITION = 'incognito'

export class SessionManager {
  private sessions = new Map<string, SessionConfig>()
  /** 代理规则字符串，传递给 session.fromPartition 的 proxyRules */
  private proxyRules?: string
  /** session 创建完成后的钩子数组（广告拦截器、wmfx 协议等），由主进程注入 */
  private onSessionReadyCallbacks: ((sess: Session) => void)[] = []
  /** 已注入 stylesheet CORS 头的 session partition（避免重复注册 webRequest 监听） */
  private corsInjectedPartitions = new Set<string>()

  /** 注册 session 就绪钩子（支持多个订阅者，幂等挂载广告拦截、协议等） */
  onSessionReady(cb: (sess: Session) => void): void {
    console.debug('[SessionManager] onSessionReady: registered callback')
    this.onSessionReadyCallbacks.push(cb)
  }

  constructor() {
    this.registerDefaultSession()
  }

  private registerDefaultSession(): void {
    this.sessions.set('default', {
      name: 'default',
      partition: 'persist:default',
      inMemory: false,
    })
    // 无 `persist:` 前缀 → 进程内内存 session，关闭即焚（配合 clearIncognitoData）
    this.sessions.set('incognito', {
      name: 'incognito',
      partition: INCOGNITO_PARTITION,
      inMemory: true,
    })
  }

  /** 设置全局代理规则，后续创建的 session 都会走代理 */
  setProxyRules(rules?: string): void {
    console.debug(
      `[SessionManager] setProxyRules: rules=${rules ? rules.slice(0, 100) : 'undefined'}`
    )
    this.proxyRules = rules
  }

  /**
   * 获取或创建指定名称的 session
   * 如果设置了 proxyRules，会传递给 session.fromPartition
   */
  getSession(name: string): Session {
    const existed = this.sessions.has(name)
    let config = this.sessions.get(name)
    if (!config) {
      config = {
        name,
        partition: `persist:${name}`,
        inMemory: false,
      }
      this.sessions.set(name, config)
      console.debug(`[SessionManager] getSession: created new session name=${name}`)
    } else {
      console.debug(`[SessionManager] getSession: returning existing session name=${name}`)
    }
    const opts: { cache: boolean; proxyRules?: string } = { cache: !config.inMemory }
    if (this.proxyRules) {
      opts.proxyRules = this.proxyRules
    }
    const sess = session.fromPartition(config.partition, opts)
    // 已存在的分区不会重新读取 fromPartition 的 options（Electron 仅在首次创建时应用），
    // 这里需显式 setProxy 才能让代理规则对存量分区生效；新建分区则由 options 应用
    if (existed && this.proxyRules) {
      sess.setProxy({ proxyRules: this.proxyRules }).catch((err) => {
        console.error(`[SessionManager] getSession: setProxy failed for name=${name}`, err)
      })
    }
    // 允许页面 fetch 跨域读取样式表：Dark Reader 动态暗色需抓取站点的 CDN 样式表，
    // 而页面内 fetch 受 CORS 限制读不到跨域 CSS → 纯白背景站点失效。
    // 仅对 stylesheet 资源注入 ACAO 头，不放宽脚本/数据等其他资源。
    if (!this.corsInjectedPartitions.has(config.partition)) {
      this.corsInjectedPartitions.add(config.partition)
      sess.webRequest.onHeadersReceived(
        { urls: ['http://*/*', 'https://*/*'], types: ['stylesheet'] },
        (details, callback) => {
          const responseHeaders = {
            ...(details.responseHeaders ?? {}),
            'Access-Control-Allow-Origin': ['*'],
          }
          callback({ responseHeaders })
        }
      )
      console.debug(`[SessionManager] getSession: stylesheet CORS injected partition=${config.partition}`)
    }
    // session 就绪后挂载广告拦截、wmfx 协议等附加能力
    for (const cb of this.onSessionReadyCallbacks) {
      cb(sess)
    }
    return sess
  }

  getPartitions(): string[] {
    return Array.from(this.sessions.keys())
  }

  /**
   * 清空无痕内存 session 的全部 Web 存储（Cookie / 缓存 / localStorage 等）。
   * 在最后一个无痕窗口关闭时调用，实现「关闭即焚」。
   */
  async clearIncognitoData(): Promise<void> {
    console.info('[SessionManager] clearIncognitoData: start')
    try {
      const sess = session.fromPartition(INCOGNITO_PARTITION, { cache: false })
      await sess.clearStorageData()
      await sess.clearCache()
      console.info('[SessionManager] clearIncognitoData: done')
    } catch (err) {
      console.error('[SessionManager] clearIncognitoData: failed', err)
    }
  }
}
