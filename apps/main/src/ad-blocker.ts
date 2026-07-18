/**
 * 广告拦截器（主进程）
 *
 * 职责：
 * - 基于 Electron `session.webRequest.onBeforeRequest` 在请求发起前拦截广告/追踪请求并取消。
 * - 规则来源：内置常见广告/追踪域名清单（无需联网、零依赖）+ 用户自定义黑名单（adBlockCustomRules）
 *   + 用户白名单（adBlockAllowlist，优先级高于黑名单）。
 * - 匹配：精确主机或子域后缀（如 rule=doubleclick.net 命中 a.doubleclick.net）。
 * - 开关由 SettingsManager `adBlockEnabled` 控制；关闭时不注册拦截回调。
 * - 通过 SessionManager 的 onSessionReady 钩子对每个新建 session 幂等挂载；全局统计被拦截计数。
 *
 * 设计取舍：MVP 不引入外部规则订阅（避免运行时联网与体积膨胀），内置清单覆盖绝大多数常见广告/追踪器；
 * 用户可在设置中添加自定义规则/白名单。后续可扩展为从 URL 拉取 EasyList 等。
 */
import type { Session } from 'electron'
import type { SettingsManager } from './settings-manager'

/** 内置常见广告/追踪域名（子域后缀匹配）；覆盖主流广告网络与追踪器 */
const BUILTIN_BLOCKLIST: readonly string[] = [
  'doubleclick.net',
  'adservice.google.com',
  'adservice.google.com.hk',
  'googleadservices.com',
  'googlesyndication.com',
  'googletagmanager.com',
  'googletagservices.com',
  'google-analytics.com',
  'analytics.google.com',
  'admob.com',
  'adsystem.com',
  'adnxs.com',
  'rubiconproject.com',
  'pubmatic.com',
  'criteo.com',
  'criteo.net',
  'openx.net',
  'yieldmo.com',
  'taboola.com',
  'outbrain.com',
  'scorecardresearch.com',
  'quantserve.com',
  'hotjar.com',
  'mixpanel.com',
  'segment.io',
  'segment.com',
  'amplitude.com',
  'fullstory.com',
  'mouseflow.com',
  'facebook.net',
  'fbcdn.net',
  'connect.facebook.net',
  'analytics.tiktok.com',
  'ads.tiktok.com',
  'bat.bing.com',
  'adsrvr.org',
  'advertising.com',
  'adform.net',
  'casalemedia.com',
  'spotx.tv',
  'springserve.com',
  'freewheel.tv',
  'moatads.com',
  'smartadserver.com',
  'mgid.com',
  'revcontent.com',
  'sharethrough.com',
  'districtm.net',
  'indexexchange.com',
  'sovrn.com',
  'loopme.com',
  'triplelift.com',
  'appnexus.com',
  'mathtag.com',
  'rlcdn.com',
  'nexage.com',
  'pubmatic.com',
  'liadm.com',
  'bidswitch.net',
  'beamimpact.com',
  'tracking.universalanalytics.com',
  'stats.g.doubleclick.net',
  'optimizely.com',
  'hotjar.com',
  'bugsnag.com',
  'sentry.io',
  'scorecardresearch.com',
  'cdn.segment.com',
  'px.cloud.net',
]

export class AdBlocker {
  private static instance: AdBlocker
  private settings: SettingsManager
  /** 已挂载拦截的 session id，保证幂等 */
  private attached = new WeakSet<Session>()
  /** 全局被拦截请求计数（仅统计进程运行期） */
  private blockedCount = 0
  /** 拦截历史（有界环形缓冲，仅进程运行期，最多保留 MAX_BLOCK_LOG 条） */
  private blockLog: { url: string; time: number; host: string }[] = []
  private static readonly MAX_BLOCK_LOG = 1000
  private enabled: boolean

  private constructor(settings: SettingsManager) {
    this.settings = settings
    this.enabled = Boolean(this.settings.get('adBlockEnabled'))
    console.debug('[AdBlocker] constructor: enabled', this.enabled)
  }

  static getInstance(settings: SettingsManager): AdBlocker {
    console.debug('[AdBlocker] getInstance')
    if (!AdBlocker.instance) {
      AdBlocker.instance = new AdBlocker(settings)
    }
    return AdBlocker.instance
  }

  /** 当前是否启用 */
  isEnabled(): boolean {
    return this.enabled
  }

  /** 切换开关并持久化 */
  setEnabled(value: boolean): void {
    console.debug('[AdBlocker] setEnabled', value)
    this.enabled = value
    this.settings.set('adBlockEnabled', value)
    // 关闭时不移除已注册的回调（onBeforeRequest 内部按 enabled 短路），避免反复注册导致重复监听
  }

  /** 统计被拦截数量（供 UI 展示） */
  getBlockedCount(): number {
    return this.blockedCount
  }

  /** 拦截历史（按时间倒序），用于「拦截历史」弹窗展示 */
  getBlockLog(): { url: string; time: number; host: string }[] {
    return [...this.blockLog].sort((a, b) => b.time - a.time)
  }

  /** 规则总数（内置 + 自定义黑名单 - 白名单交集外的） */
  getRuleCount(): number {
    const custom = this.getCustomRules()
    const allow = new Set(this.getAllowlist())
    const builtin = BUILTIN_BLOCKLIST.filter((d) => !allow.has(d))
    return builtin.length + custom.filter((d) => !allow.has(d)).length
  }

  /** 返回全部规则（供 UI 展示），标记来源：builtin(内置)/custom(自定义黑名单)/allow(白名单) */
  getRules(): { host: string; source: 'builtin' | 'custom' | 'allow' }[] {
    const allow = new Set(this.getAllowlist().map((d) => d.toLowerCase()))
    const rules: { host: string; source: 'builtin' | 'custom' | 'allow' }[] = []
    for (const d of BUILTIN_BLOCKLIST) {
      rules.push({ host: d, source: allow.has(d.toLowerCase()) ? 'allow' : 'builtin' })
    }
    for (const d of this.getCustomRules()) {
      rules.push({ host: d, source: allow.has(d.toLowerCase()) ? 'allow' : 'custom' })
    }
    for (const d of this.getAllowlist()) {
      if (!rules.some((r) => r.host.toLowerCase() === d.toLowerCase())) {
        rules.push({ host: d, source: 'allow' })
      }
    }
    return rules.sort((a, b) => a.host.localeCompare(b.host))
  }

  private getCustomRules(): string[] {
    const v = this.settings.get('adBlockCustomRules')
    return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : []
  }

  private getAllowlist(): string[] {
    const v = this.settings.get('adBlockAllowlist')
    return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : []
  }

  /** 判断某 URL 是否应被拦截 */
  shouldBlock(url: string): boolean {
    if (!this.enabled) return false
    let hostname: string
    try {
      hostname = new URL(url).hostname.toLowerCase()
    } catch {
      return false
    }
    const allow = new Set(this.getAllowlist().map((d) => d.toLowerCase()))
    if (allow.has(hostname)) return false
    const blocked = new Set([
      ...BUILTIN_BLOCKLIST.map((d) => d.toLowerCase()),
      ...this.getCustomRules().map((d) => d.toLowerCase()),
    ])
    if (blocked.has(hostname)) return true
    // 子域后缀匹配：hostname 以 .rule 结尾
    for (const rule of blocked) {
      if (hostname.endsWith(`.${rule}`)) return true
    }
    return false
  }

  /** 对某 session 幂等挂载拦截（在 SessionManager 创建 session 后调用） */
  attach(session: Session): void {
    if (this.attached.has(session)) {
      console.debug('[AdBlocker] attach: already attached, skip')
      return
    }
    this.attached.add(session)
    console.debug('[AdBlocker] attach: session', session.getCacheSize?.() ?? 'n/a')
    session.webRequest.onBeforeRequest((details, callback) => {
      if (!this.enabled) {
        callback({})
        return
      }
      if (this.shouldBlock(details.url)) {
        this.blockedCount++
        this.recordBlocked(details.url)
        console.debug('[AdBlocker] blocked:', details.url.slice(0, 120))
        callback({ cancel: true })
      } else {
        callback({})
      }
    })
  }

  /** 记录一条被拦请求到拦截历史（有界环形缓冲） */
  private recordBlocked(url: string): void {
    let host = ''
    try {
      host = new URL(url).hostname
    } catch {
      host = url
    }
    this.blockLog.push({ url, time: Date.now(), host })
    if (this.blockLog.length > AdBlocker.MAX_BLOCK_LOG) {
      this.blockLog.splice(0, this.blockLog.length - AdBlocker.MAX_BLOCK_LOG)
    }
  }
}
