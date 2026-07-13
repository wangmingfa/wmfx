import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { ConfigManager } from './ConfigManager'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'wmfx-cfg-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('ConfigManager.generateConfig', () => {
  it('默认配置写入混合端口/控制器/密钥/模式', () => {
    const cm = new ConfigManager(tmp)
    const cfg = YAML.parse(cm.generateConfig())
    expect(cfg['mixed-port']).toBe(7890)
    expect(cfg['external-controller']).toBe('127.0.0.1:9090')
    expect(cfg.secret).toBe('wmfx')
    expect(cfg.mode).toBe('rule')
    expect(cfg['allow-lan']).toBe(false)
    expect(cfg['log-level']).toBe('info')
  })

  it('注入订阅节点/组/规则，且组类型转小写', () => {
    const cm = new ConfigManager(tmp)
    cm.setSubscriptionData(
      [{ name: 'node1', type: 'ss', server: '1.1.1.1', port: 1 }],
      [{ name: 'G1', type: 'Select', proxies: ['node1'] }],
      ['DOMAIN-SUFFIX,google.com,PROXY']
    )
    const cfg = YAML.parse(cm.generateConfig())
    expect(cfg.proxies).toHaveLength(1)
    expect(cfg['proxy-groups'][0].type).toBe('select')
    expect(cfg['proxy-groups'].some((g: { name: string }) => g.name === 'PROXY')).toBe(true)
    expect(cfg.rules).toEqual(['DOMAIN-SUFFIX,google.com,PROXY'])
  })

  it('订阅缺少 PROXY 组时自动追加 select 兜底组', () => {
    const cm = new ConfigManager(tmp)
    cm.setSubscriptionData([], [{ name: 'G1', type: 'select', proxies: ['DIRECT'] }], [])
    const cfg = YAML.parse(cm.generateConfig())
    const proxyGroup = cfg['proxy-groups'].find((g: { name: string }) => g.name === 'PROXY')
    expect(proxyGroup).toBeTruthy()
    expect(proxyGroup.type).toBe('select')
    expect(proxyGroup.proxies).toContain('G1')
    expect(proxyGroup.proxies).toContain('DIRECT')
  })

  it('无订阅时使用默认规则 MATCH,PROXY 与单 PROXY 组', () => {
    const cm = new ConfigManager(tmp)
    const cfg = YAML.parse(cm.generateConfig())
    expect(cfg.rules).toEqual(['MATCH,PROXY'])
    expect(cfg['proxy-groups']).toEqual([{ name: 'PROXY', type: 'select', proxies: ['DIRECT'] }])
  })

  it('updateConfig 覆盖内部模型字段', () => {
    const cm = new ConfigManager(tmp)
    cm.updateConfig({ mode: 'global', mixedPort: 8888 })
    const cfg = YAML.parse(cm.generateConfig())
    expect(cfg.mode).toBe('global')
    expect(cfg['mixed-port']).toBe(8888)
  })

  it('clearSubscriptionData 恢复到默认配置', () => {
    const cm = new ConfigManager(tmp)
    cm.setSubscriptionData(
      [{ name: 'n' }],
      [{ name: 'G', type: 'select', proxies: [] }],
      ['MATCH,PROXY']
    )
    cm.clearSubscriptionData()
    const cfg = YAML.parse(cm.generateConfig())
    expect(cfg.proxies).toEqual([])
    expect(cfg.rules).toEqual(['MATCH,PROXY'])
  })
})

describe('ConfigManager 辅助方法', () => {
  it('getProxyRules 生成 Electron session 代理规则', () => {
    const cm = new ConfigManager(tmp, { mixedPort: 7890 })
    expect(cm.getProxyRules()).toBe('http=127.0.0.1:7890;https=127.0.0.1:7890;ftp=127.0.0.1:7890')
  })

  it('getControllerUrl 返回 REST API 地址', () => {
    const cm = new ConfigManager(tmp)
    expect(cm.getControllerUrl()).toBe('http://127.0.0.1:9090')
  })

  it('writeConfig 落盘 config.yaml 且内容可被 YAML 解析', () => {
    const cm = new ConfigManager(tmp)
    cm.writeConfig()
    expect(existsSync(cm.getConfigPath())).toBe(true)
    const written = YAML.parse(readFileSync(cm.getConfigPath(), 'utf8'))
    expect(written['mixed-port']).toBe(7890)
  })
})
