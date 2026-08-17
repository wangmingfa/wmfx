/**
 * 配置管理器 — 内部 TS 模型 → YAML 配置文件
 *
 * 设计原则：
 * - UI 不直接读写 YAML，只操作 ProxyConfig 对象
 * - 保存时由 ConfigManager 通过 yaml 库生成合法的 config.yaml
 * - 避免手写 YAML 字符串拼接导致的格式错误（中文、特殊字符等）
 */

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import type { ProxyConfig } from './types'

const DEFAULT_CONFIG: ProxyConfig = {
  mixedPort: 7890,
  controllerPort: 9090,
  controllerHost: '127.0.0.1',
  // 占位值：真实 secret 由 loadOrCreateSecret 随机生成并持久化，不再使用固定默认值
  secret: '',
  mode: 'rule',
  allowLan: false,
  logLevel: 'info',
}

/** 随机 secret 持久化文件名（位于 configDir 下） */
const SECRET_FILE = '.secret'

export class ConfigManager {
  /** 配置文件存放目录 */
  readonly configDir: string
  /** 内部配置模型，UI 修改的目标 */
  private config: ProxyConfig
  /** 随机生成的 REST API 密钥（首次运行生成并持久化到 configDir/.secret） */
  private secret: string
  /** 订阅解析后的代理节点列表，保存时注入 config.yaml 的 proxies 字段 */
  private subscriptionProxies: Record<string, unknown>[] = []
  /** 订阅解析后的代理组定义，保存时注入 config.yaml 的 proxy-groups 字段 */
  private subscriptionGroups: { name: string; type: string; proxies: string[] }[] = []
  /** 订阅解析后的路由规则列表，保存时注入 config.yaml 的 rules 字段 */
  private subscriptionRules: string[] = []

  constructor(configDir: string, overrides?: Partial<ProxyConfig>) {
    console.debug(
      `[ConfigManager] constructor: configDir=${configDir}, hasOverrides=${!!overrides}`
    )
    this.configDir = configDir
    this.config = { ...DEFAULT_CONFIG, ...overrides }
    mkdirSync(configDir, { recursive: true })
    this.secret = this.loadOrCreateSecret()
  }

  /**
   * 读取或生成随机 REST API 密钥：
   * - 首次运行生成 32 字节 hex 写入 configDir/.secret（0600），之后复用
   * - 避免使用固定默认值（如 'wmfx'），防止本机任意进程用已知 token 控制代理
   */
  private loadOrCreateSecret(): string {
    const secretPath = join(this.configDir, SECRET_FILE)
    try {
      if (existsSync(secretPath)) {
        const existing = readFileSync(secretPath, 'utf-8').trim()
        if (existing) return existing
      }
    } catch (err) {
      console.warn(`[ConfigManager] loadOrCreateSecret: read failed, regenerating: ${err}`)
    }
    const secret = randomBytes(32).toString('hex')
    writeFileSync(secretPath, secret, { encoding: 'utf-8', mode: 0o600 })
    console.debug('[ConfigManager] loadOrCreateSecret: generated new secret')
    return secret
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
    console.debug('[ConfigManager] generateConfig: building YAML from internal model')
    const { mixedPort, controllerPort, controllerHost, mode, allowLan, logLevel } = this.config

    // 构建 JS 对象，由 YAML.stringify() 负责序列化
    const config: Record<string, unknown> = {
      'mixed-port': mixedPort,
      'allow-lan': allowLan,
      mode,
      'log-level': logLevel,
      'external-controller': `${controllerHost}:${controllerPort}`,
      // 与 getSecret() 同源：写入的 secret 必须与 REST API 认证用的随机值一致
      secret: this.getSecret(),
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
        console.debug('[ConfigManager] generateConfig: no PROXY group, appending default')
        const firstName = this.subscriptionGroups[0]?.name ?? 'DIRECT'
        groups.push({ name: 'PROXY', type: 'select', proxies: [firstName, 'DIRECT'] })
      }
      config['proxy-groups'] = groups
    } else {
      console.debug('[ConfigManager] generateConfig: no subscription groups, using default PROXY')
      config['proxy-groups'] = [{ name: 'PROXY', type: 'select', proxies: ['DIRECT'] }]
    }

    // 注入规则列表，无订阅规则时使用默认 MATCH,PROXY
    config.rules = this.subscriptionRules.length > 0 ? this.subscriptionRules : ['MATCH,PROXY']
    console.debug(
      `[ConfigManager] generateConfig: proxies=${this.subscriptionProxies.length}, groups=${this.subscriptionGroups.length}, rules=${this.subscriptionRules.length}`
    )

    return YAML.stringify(config)
  }

  /** 将生成的 YAML 写入 config.yaml（临时文件 + rename 原子替换，避免崩溃留下截断配置） */
  writeConfig(): void {
    const yaml = this.generateConfig()
    const configPath = this.getConfigPath()
    const tmpPath = `${configPath}.tmp`
    writeFileSync(tmpPath, yaml, 'utf-8')
    renameSync(tmpPath, configPath)
    console.debug(`[ConfigManager] writeConfig: path=${configPath}, size=${yaml.length}`)
  }

  getMixedPort(): number {
    return this.config.mixedPort
  }

  /** 获取 REST API 认证密钥（随机生成并持久化的值，不用占位默认值） */
  getSecret(): string {
    return this.secret
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
    console.debug(`[ConfigManager] updateConfig: keys=${Object.keys(overrides).join(',')}`)
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
