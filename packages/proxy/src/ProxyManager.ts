/**
 * 代理管理器 — ProxyProvider 的 Mihomo 实现
 *
 * 聚合所有子模块（进程管理、API、健康检测、流量监控），
 * 对外提供统一接口。上层 UI 只调用 ProxyManager，
 * 无需关心底层是 Mihomo 还是其他核心。
 */
import { ApiClient } from './ApiClient'
import { ConfigManager } from './ConfigManager'
import { HealthChecker } from './HealthChecker'
import { MihomoProcess } from './MihomoProcess'
import type { ProxyProvider } from './ProxyProvider'
import { TrafficMonitor } from './TrafficMonitor'
import type { MihomoStatus, ProxyConfig, ProxyGroup, TrafficData } from './types'

export class ProxyManager implements ProxyProvider {
  private process: MihomoProcess
  private configManager: ConfigManager
  private apiClient: ApiClient
  private healthChecker: HealthChecker
  private trafficMonitor: TrafficMonitor

  constructor(configDir: string, overrides?: Partial<ProxyConfig>) {
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
    this.configManager.writeConfig()
    this.process.start()
    for (let i = 0; i < 30; i++) {
      if (await this.apiClient.isReady()) break
      await new Promise((r) => setTimeout(r, 200))
    }
    this.trafficMonitor.connect()
  }

  /** 停止代理核心：断开 WebSocket → 优雅关闭进程 */
  stop(): void {
    this.trafficMonitor.disconnect()
    this.process.stop()
  }

  getStatus(): MihomoStatus {
    return this.process.getStatus()
  }

  getProxyRules(): string {
    return this.configManager.getProxyRules()
  }

  async getProxies(): Promise<
    Record<string, ProxyGroup & { all?: { name: string; type: string }[] }>
  > {
    return this.apiClient.getProxies()
  }

  async switchNode(groupName: string, nodeName: string): Promise<void> {
    await this.apiClient.switchNode(groupName, nodeName)
  }

  async setMode(mode: 'rule' | 'global' | 'direct'): Promise<void> {
    await this.apiClient.setMode(mode)
  }

  async getMode(): Promise<string> {
    const config = await this.apiClient.getConfig()
    return String(config.mode || 'rule')
  }

  async checkDelay(groupName: string): Promise<{ nodeName: string; delay: number }[]> {
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
    this.configManager.setSubscriptionData(proxies, proxyGroups, rules)
    this.configManager.writeConfig()
    this.stop()
    this.start()
  }

  /** 清除订阅数据，恢复默认配置并重启 */
  async resetConfig(): Promise<void> {
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
