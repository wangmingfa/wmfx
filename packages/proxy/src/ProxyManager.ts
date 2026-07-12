import { ApiClient } from './ApiClient'
import { ConfigManager } from './ConfigManager'
import { HealthChecker } from './HealthChecker'
import { MihomoProcess } from './MihomoProcess'
import { TrafficMonitor } from './TrafficMonitor'
import type { MihomoStatus, ProxyConfig, ProxyGroup, TrafficData } from './types'

export class ProxyManager {
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

  async start(): Promise<void> {
    this.configManager.writeConfig()
    this.process.start()
    for (let i = 0; i < 30; i++) {
      if (await this.apiClient.isReady()) break
      await new Promise((r) => setTimeout(r, 200))
    }
    this.trafficMonitor.connect()
  }

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
