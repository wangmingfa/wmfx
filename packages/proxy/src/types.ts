/**
 * 内部代理配置模型
 * 注意：这是 TypeScript 模型，不是 Mihomo 的 YAML 配置
 * UI 修改的是这个对象，保存时由 ConfigManager 统一生成 config.yaml
 */
export interface ProxyConfig {
  mixedPort: number
  controllerPort: number
  controllerHost: string
  /** Mihomo REST API 认证密钥 */
  secret: string
  mode: 'rule' | 'global' | 'direct'
  allowLan: boolean
  logLevel: 'silent' | 'error' | 'warning' | 'info' | 'debug'
}

export interface ProxyNode {
  name: string
  type: string
  server: string
  port: number
  delay?: number
}

export interface ProxyGroup {
  name: string
  type: 'Selector' | 'URLTest' | 'Fallback' | 'Relay' | 'Direct' | 'Reject'
  now?: string
  all?: string[]
}

export interface SubscriptionInfo {
  name: string
  url: string
  upload: number
  download: number
  total: number
  expire: number
}

export interface TrafficData {
  up: number
  down: number
}

export interface MihomoStatus {
  running: boolean
  pid?: number
  port?: number
}
