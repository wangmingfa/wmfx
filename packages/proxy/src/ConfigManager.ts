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
  private configDir: string
  private config: ProxyConfig

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
    yaml += `proxies: []\n`
    yaml += `\n`
    yaml += `proxy-groups:\n`
    yaml += `  - name: "PROXY"\n`
    yaml += `    type: select\n`
    yaml += `    proxies:\n`
    yaml += `      - DIRECT\n`
    yaml += `\n`
    yaml += `rules:\n`
    yaml += `  - MATCH,PROXY\n`

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
}
