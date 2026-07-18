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
import { getVueDevToolsPath, loadVueDevToolsForSession } from './devtools'
import { logBoxSuccess } from './logger'

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
  /** session 创建完成后的钩子（如挂载广告拦截器），由主进程注入 */
  private onSessionReady?: (sess: Session) => void

  /** 注册 session 就绪钩子（幂等挂载广告拦截等） */
  setOnSessionReady(cb: (sess: Session) => void): void {
    console.debug('[SessionManager] setOnSessionReady')
    this.onSessionReady = cb
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
    // 为每个 session 装载 Vue DevTools 扩展（仅开发期配置 VUE_DEVTOOLS_PATH 时生效）
    void loadVueDevToolsForSession(sess).then((loaded) => {
      if (loaded) {
        logBoxSuccess([
          `已为 session 装载 Vue DevTools 扩展: ${config.name}`,
          `path=${getVueDevToolsPath()}`,
        ])
      }
    })
    // session 就绪后挂载广告拦截等附加能力（广告拦截器内部幂等，重复调用安全）
    this.onSessionReady?.(sess)
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
