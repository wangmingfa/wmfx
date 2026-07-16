/** @module @browser/proxy — 代理核心模块 */
console.debug(
  '[proxy] index: exporting ApiClient, ConfigManager, CoreDownloader, HealthChecker, MihomoProcess, ProxyManager, TrafficMonitor'
)

export { ApiClient } from './ApiClient'
export { ConfigManager } from './ConfigManager'
export { downloadMihomo, getMihomoBinaryPath, isMihomoDownloaded } from './CoreDownloader'
export { HealthChecker } from './HealthChecker'
export { MihomoProcess } from './MihomoProcess'
export { ProxyManager } from './ProxyManager'
export type { ProxyProvider } from './ProxyProvider'
export { TrafficMonitor } from './TrafficMonitor'
export type {
  MihomoStatus,
  ProxyConfig,
  ProxyGroup,
  ProxyNode,
  SubscriptionInfo,
  TrafficData,
} from './types'
