import type { CertTrustScope } from '@browser/ipc-contract'
import type { SettingsManager } from './settings-manager'

/**
 * 三层证书信任存储：once（一次性标记）、session（内存 Set，重启清除）、always（持久化到 settings）。
 * key = host + '|' + errorText 复合键，不是只用 host —— 防止信任某错误类型后连带放行该 host 的全新不同错误。
 */
export class CertTrustStore {
  /** 一次性信任：证书错误放行后立即消费 */
  private once = new Set<string>()
  /** 本次运行期间信任：进程存活期间同 host+errorText 直接放行 */
  private session = new Set<string>()
  /** always 层内存缓存，启动时从 settings-manager 载入 */
  private alwaysCache = new Set<string>()

  constructor(private settingsManager: SettingsManager | null) {
    this.loadAlways()
  }

  private key(host: string, errorText: string): string {
    return `${host}|${errorText}`
  }

  /** 按 once → session → always 顺序查询 */
  isTrusted(host: string, errorText: string): boolean {
    const k = this.key(host, errorText)
    return this.once.has(k) || this.session.has(k) || this.alwaysCache.has(k)
  }

  add(host: string, errorText: string, scope: CertTrustScope): void {
    const k = this.key(host, errorText)
    if (scope === 'once') {
      this.once.add(k)
    } else if (scope === 'session') {
      this.session.add(k)
    } else {
      this.alwaysCache.add(k)
      this.persistAlways()
    }
  }

  /** once 命中后移除（certificate-error 放行后调用） */
  consumeOnce(host: string, errorText: string): void {
    this.once.delete(this.key(host, errorText))
  }

  private loadAlways(): void {
    if (!this.settingsManager) return
    const list = this.settingsManager.get('trustedCerts')
    for (const item of list) {
      this.alwaysCache.add(this.key(item.host, item.errorText))
    }
  }

  private persistAlways(): void {
    if (!this.settingsManager) return
    const list: { host: string; errorText: string }[] = []
    for (const k of this.alwaysCache) {
      const sep = k.indexOf('|')
      list.push({ host: k.slice(0, sep), errorText: k.slice(sep + 1) })
    }
    this.settingsManager.set('trustedCerts', list)
  }
}
