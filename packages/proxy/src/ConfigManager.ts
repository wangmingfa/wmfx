import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProxyConfig } from './types'

const DEFAULT_CONFIG: ProxyConfig = {
  mixedPort: 7890,
  controllerPort: 9090,
  controllerHost: '127.0.0.1',
  mode: 'rule',
  allowLan: false,
  logLevel: 'info',
}

export class ConfigManager {
  readonly configDir: string
  private config: ProxyConfig
  private subscriptionProxies: Record<string, unknown>[] = []
  private subscriptionGroups: { name: string; type: string; proxies: string[] }[] = []
  private subscriptionRules: string[] = []

  constructor(configDir: string, overrides?: Partial<ProxyConfig>) {
    this.configDir = configDir
    this.config = { ...DEFAULT_CONFIG, ...overrides }
    mkdirSync(configDir, { recursive: true })
  }

  getConfigPath(): string {
    return join(this.configDir, 'config.yaml')
  }

  generateConfig(): string {
    const { mixedPort, controllerPort, controllerHost, mode, allowLan, logLevel } = this.config

    let yaml = `mixed-port: ${mixedPort}\n`
    yaml += `allow-lan: ${allowLan}\n`
    yaml += `mode: ${mode}\n`
    yaml += `log-level: ${logLevel}\n`
    yaml += `external-controller: ${controllerHost}:${controllerPort}\n`
    yaml += `\n`

    // Proxies
    if (this.subscriptionProxies.length > 0) {
      yaml += `proxies:\n`
      for (const p of this.subscriptionProxies) {
        for (const [k, v] of Object.entries(p)) {
          if (v === undefined || v === null) continue
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            yaml += `  - ${k}: ${v}\n`
          }
        }
        yaml += `\n`
      }
    } else {
      yaml += `proxies: []\n`
    }
    yaml += `\n`

    // Proxy groups
    if (this.subscriptionGroups.length > 0) {
      yaml += `proxy-groups:\n`
      for (const g of this.subscriptionGroups) {
        yaml += `  - name: "${g.name}"\n`
        yaml += `    type: ${g.type}\n`
        yaml += `    proxies:\n`
        for (const p of g.proxies) {
          yaml += `      - "${p}"\n`
        }
        yaml += `\n`
      }
      // Add a default PROXY group if subscription groups exist
      const hasProxyGroup = this.subscriptionGroups.some((g) => g.name === 'PROXY')
      if (!hasProxyGroup) {
        const firstName = this.subscriptionGroups[0]?.name ?? 'DIRECT'
        yaml += `  - name: "PROXY"\n`
        yaml += `    type: select\n`
        yaml += `    proxies:\n`
        yaml += `      - "${firstName}"\n`
        yaml += `      - DIRECT\n`
        yaml += `\n`
      }
    } else {
      yaml += `proxy-groups:\n`
      yaml += `  - name: "PROXY"\n`
      yaml += `    type: select\n`
      yaml += `    proxies:\n`
      yaml += `      - DIRECT\n`
      yaml += `\n`
    }

    // Rules
    yaml += `rules:\n`
    if (this.subscriptionRules.length > 0) {
      for (const r of this.subscriptionRules) {
        yaml += `  - ${r}\n`
      }
    } else {
      yaml += `  - MATCH,PROXY\n`
    }

    return yaml
  }

  writeConfig(): void {
    const yaml = this.generateConfig()
    writeFileSync(this.getConfigPath(), yaml, 'utf-8')
  }

  getMixedPort(): number {
    return this.config.mixedPort
  }

  getControllerUrl(): string {
    return `http://${this.config.controllerHost}:${this.config.controllerPort}`
  }

  getProxyRules(): string {
    const port = this.config.mixedPort
    return `http=127.0.0.1:${port};https=127.0.0.1:${port};ftp=127.0.0.1:${port}`
  }

  updateConfig(overrides: Partial<ProxyConfig>): void {
    this.config = { ...this.config, ...overrides }
  }

  getConfig(): ProxyConfig {
    return { ...this.config }
  }

  setSubscriptionData(
    proxies: Record<string, unknown>[],
    groups: { name: string; type: string; proxies: string[] }[],
    rules: string[]
  ): void {
    this.subscriptionProxies = proxies
    this.subscriptionGroups = groups
    this.subscriptionRules = rules
  }

  clearSubscriptionData(): void {
    this.subscriptionProxies = []
    this.subscriptionGroups = []
    this.subscriptionRules = []
  }
}
