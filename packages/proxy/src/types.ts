export interface ProxyConfig {
  mixedPort: number
  controllerPort: number
  controllerHost: string
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
