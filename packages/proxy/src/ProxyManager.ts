/**
 * 代理管理器 — ProxyProvider 的 Mihomo 实现
 *
 * 聚合所有子模块（进程管理、API、健康检测、流量监控），
 * 对外提供统一接口。上层 UI 只调用 ProxyManager，
 * 无需关心底层是 Mihomo 还是其他核心。
 */

import { join } from 'node:path'
import { ApiClient } from './ApiClient'
import { ConfigManager } from './ConfigManager'
import { HealthChecker } from './HealthChecker'
import { MihomoProcess } from './MihomoProcess'
import type { ProxyProvider } from './ProxyProvider'
import { TrafficMonitor } from './TrafficMonitor'
import type { MihomoStatus, ProxyConfig, ProxyGroup, TrafficData } from './types'

/**
 * 解析代理配置目录：放在用户数据目录（<userData>/proxy），而非应用包内，
 * 避免只读限制导致无法写入 config.yaml。
 *
 * 注意：此处不再直接 import `electron`（保持 proxy 包与渲染/主进程解耦，
 * 也避免主进程打包时把 electron 的 index.js 内联进 bundle 导致运行时报错）。
 * userData 路径由调用方（主进程）通过 `app.getPath('userData')` 传入。
 */
export function resolveProxyConfigDir(userDataPath: string): string {
  return join(userDataPath, 'proxy')
}

export class ProxyManager implements ProxyProvider {
  private process: MihomoProcess
  private configManager: ConfigManager
  private apiClient: ApiClient
  private healthChecker: HealthChecker
  private trafficMonitor: TrafficMonitor

  constructor(configDir: string, overrides?: Partial<ProxyConfig>) {
    console.debug(`[ProxyManager] constructor: configDir=${configDir}, hasOverrides=${!!overrides}`)
    this.configManager = new ConfigManager(configDir, overrides)
    this.process = new MihomoProcess(this.configManager)
    this.apiClient = new ApiClient(this.configManager)
    this.healthChecker = new HealthChecker(this.apiClient)
    this.trafficMonitor = new TrafficMonitor(this.configManager)
  }

  /**
   * 启动代理核心
   * 1. 写入 config.yaml
   * 2. 启动 Mihomo 进程
   * 3. 轮询等待 API 就绪
   * 4. 连接流量监控 WebSocket
   */
  async start(): Promise<void> {
    console.debug('[ProxyManager] start: writing config and launching process')
    this.configManager.writeConfig()
    this.process.start()
    let ready = false
    for (let i = 0; i < 30; i++) {
      if (await this.apiClient.isReady()) {
        ready = true
        console.debug(`[ProxyManager] start: API ready after ${i + 1} attempts`)
        break
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    if (!ready) console.debug('[ProxyManager] start: API not ready after 30 attempts')
    this.trafficMonitor.connect()
  }

  /** 停止代理核心：断开 WebSocket → 优雅关闭进程 */
  stop(): void {
    console.debug('[ProxyManager] stop: disconnecting traffic monitor and stopping process')
    this.trafficMonitor.disconnect()
    this.process.stop()
  }

  getStatus(): MihomoStatus {
    return this.process.getStatus()
  }

  getProxyRules(): string {
    const rules = this.configManager.getProxyRules()
    console.debug(`[ProxyManager] getProxyRules: ${rules}`)
    return rules
  }

  async getProxies(): Promise<
    Record<string, ProxyGroup & { all?: { name: string; type: string }[] }>
  > {
    console.debug('[ProxyManager] getProxies: fetching from apiClient')
    return this.apiClient.getProxies()
  }

  async switchNode(groupName: string, nodeName: string): Promise<void> {
    console.debug(`[ProxyManager] switchNode: group=${groupName}, node=${nodeName}`)
    await this.apiClient.switchNode(groupName, nodeName)
  }

  async setMode(mode: 'rule' | 'global' | 'direct'): Promise<void> {
    console.debug(`[ProxyManager] setMode: mode=${mode}`)
    await this.apiClient.setMode(mode)
  }

  async getMode(): Promise<string> {
    const config = await this.apiClient.getConfig()
    const mode = String(config.mode || 'rule')
    console.debug(`[ProxyManager] getMode: mode=${mode}`)
    return mode
  }

  async checkDelay(groupName: string): Promise<{ nodeName: string; delay: number }[]> {
    console.debug(`[ProxyManager] checkDelay: group=${groupName}`)
    return this.healthChecker.checkGroup(groupName)
  }

  /**
   * 注入订阅解析后的数据并重启核心
   * @param proxies 订阅中的节点列表
   * @param proxyGroups 代理组定义
   * @param rules 路由规则
   */
  async injectProxies(
    proxies: Record<string, unknown>[],
    proxyGroups: { name: string; type: string; proxies: string[] }[],
    rules: string[]
  ): Promise<void> {
    console.debug(
      `[ProxyManager] injectProxies: proxies=${proxies.length}, groups=${proxyGroups.length}, rules=${rules.length}`
    )
    this.configManager.setSubscriptionData(proxies, proxyGroups, rules)
    this.configManager.writeConfig()
    this.stop()
    this.start()
  }

  /** 清除订阅数据，恢复默认配置并重启 */
  async resetConfig(): Promise<void> {
    console.debug('[ProxyManager] resetConfig: clearing subscription data and restoring defaults')
    this.configManager.clearSubscriptionData()
    this.configManager.writeConfig()
    this.stop()
    this.start()
  }

  onData(cb: (data: TrafficData) => void): () => void {
    return this.trafficMonitor.onData(cb)
  }

  setCallbacks(callbacks: {
    onLog?: (msg: string) => void
    onError?: (msg: string) => void
  }): void {
    this.process.setCallbacks(callbacks)
  }
}
