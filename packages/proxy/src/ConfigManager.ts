/**
 * 配置管理器 — 内部 TS 模型 → YAML 配置文件
 *
 * 设计原则：
 * - UI 不直接读写 YAML，只操作 ProxyConfig 对象
 * - 保存时由 ConfigManager 通过 yaml 库生成合法的 config.yaml
 * - 避免手写 YAML 字符串拼接导致的格式错误（中文、特殊字符等）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import type { ProxyConfig } from './types'

const DEFAULT_CONFIG: ProxyConfig = {
  mixedPort: 7890,
  controllerPort: 9090,
  controllerHost: '127.0.0.1',
  secret: 'wmfx',
  mode: 'rule',
  allowLan: false,
  logLevel: 'info',
}

export class ConfigManager {
  /** 配置文件存放目录 */
  readonly configDir: string
  /** 内部配置模型，UI 修改的目标 */
  private config: ProxyConfig
  /** 订阅解析后的代理节点列表，保存时注入 config.yaml 的 proxies 字段 */
  private subscriptionProxies: Record<string, unknown>[] = []
  /** 订阅解析后的代理组定义，保存时注入 config.yaml 的 proxy-groups 字段 */
  private subscriptionGroups: { name: string; type: string; proxies: string[] }[] = []
  /** 订阅解析后的路由规则列表，保存时注入 config.yaml 的 rules 字段 */
  private subscriptionRules: string[] = []

  constructor(configDir: string, overrides?: Partial<ProxyConfig>) {
    this.configDir = configDir
    this.config = { ...DEFAULT_CONFIG, ...overrides }
    mkdirSync(configDir, { recursive: true })
  }

  /** 返回 config.yaml 的完整路径 */
  getConfigPath(): string {
    return join(this.configDir, 'config.yaml')
  }

  /**
   * 将内部 TS 模型转换为 Mihomo 的 YAML 配置字符串
   * 使用 yaml 库序列化，避免手动拼接带来的格式问题
   */
  generateConfig(): string {
    const { mixedPort, controllerPort, controllerHost, secret, mode, allowLan, logLevel } =
      this.config

    // 构建 JS 对象，由 YAML.stringify() 负责序列化
    const config: Record<string, unknown> = {
      'mixed-port': mixedPort,
      'allow-lan': allowLan,
      mode,
      'log-level': logLevel,
      'external-controller': `${controllerHost}:${controllerPort}`,
      secret,
    }

    // 注入订阅节点列表
    config.proxies = this.subscriptionProxies.length > 0 ? this.subscriptionProxies : []

    // 注入代理组，确保存在一个兜底的 PROXY 组
    if (this.subscriptionGroups.length > 0) {
      const groups = this.subscriptionGroups.map((g) => ({
        name: g.name,
        type: g.type.toLowerCase(),
        proxies: g.proxies,
      }))
      const hasProxyGroup = this.subscriptionGroups.some((g) => g.name === 'PROXY')
      if (!hasProxyGroup) {
        const firstName = this.subscriptionGroups[0]?.name ?? 'DIRECT'
        groups.push({ name: 'PROXY', type: 'select', proxies: [firstName, 'DIRECT'] })
      }
      config['proxy-groups'] = groups
    } else {
      config['proxy-groups'] = [{ name: 'PROXY', type: 'select', proxies: ['DIRECT'] }]
    }

    // 注入规则列表，无订阅规则时使用默认 MATCH,PROXY
    config.rules = this.subscriptionRules.length > 0 ? this.subscriptionRules : ['MATCH,PROXY']

    return YAML.stringify(config)
  }

  /** 将生成的 YAML 写入 config.yaml */
  writeConfig(): void {
    const yaml = this.generateConfig()
    const configPath = this.getConfigPath()
    writeFileSync(configPath, yaml, 'utf-8')
    console.debug(`[ConfigManager] writeConfig: path=${configPath}, size=${yaml.length}`)
  }

  getMixedPort(): number {
    return this.config.mixedPort
  }

  /** 获取 REST API 认证密钥 */
  getSecret(): string {
    return this.config.secret
  }

  /** 获取 Mihomo external-controller 的 HTTP 地址 */
  getControllerUrl(): string {
    return `http://${this.config.controllerHost}:${this.config.controllerPort}`
  }

  /**
   * 生成 Electron session 的 proxyRules 格式字符串
   * 用于 session.fromPartition 或 session.setProxy
   */
  getProxyRules(): string {
    const port = this.config.mixedPort
    return `http=127.0.0.1:${port};https=127.0.0.1:${port};ftp=127.0.0.1:${port}`
  }

  /** 更新内部配置模型 */
  updateConfig(overrides: Partial<ProxyConfig>): void {
    this.config = { ...this.config, ...overrides }
  }

  /** 返回内部配置模型的副本 */
  getConfig(): ProxyConfig {
    return { ...this.config }
  }

  /** 从 SubscriptionManager 注入订阅解析后的节点/组/规则数据 */
  setSubscriptionData(
    proxies: Record<string, unknown>[],
    groups: { name: string; type: string; proxies: string[] }[],
    rules: string[]
  ): void {
    console.debug(
      `[ConfigManager] setSubscriptionData: proxies=${proxies.length}, groups=${groups.length}, rules=${rules.length}`
    )
    this.subscriptionProxies = proxies
    this.subscriptionGroups = groups
    this.subscriptionRules = rules
  }

  /** 清除订阅数据，恢复到默认配置 */
  clearSubscriptionData(): void {
    console.debug('[ConfigManager] clearSubscriptionData: resetting to defaults')
    this.subscriptionProxies = []
    this.subscriptionGroups = []
    this.subscriptionRules = []
  }
}
