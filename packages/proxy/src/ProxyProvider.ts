import type { MihomoStatus, TrafficData } from './types'

/**
 * 代理核心抽象接口 — 屏蔽底层核心差异 (Mihomo / Sing-box / Xray)
 *
 * 设计思路：
 * - 上层 UI 只依赖 ProxyProvider 接口，不感知底层是哪个核心
 * - 切换核心时只需新增一个 Provider 实现类，UI 层代码无需改动
 * - 所有方法对应 Mihomo 的 REST API 或进程控制操作
 */
export interface ProxyProvider {
  /** 启动代理核心：写入配置文件 → spawn 进程 → 等待 API 就绪 */
  start(): Promise<void>
  /** 停止代理核心：先调用 API 优雅关闭，再 kill 进程 */
  stop(): void
  /** 获取当前运行状态 */
  getStatus(): MihomoStatus
  /** 获取 Electron session 代理规则 (proxyRules 格式) */
  getProxyRules(): string
  /** 获取所有代理组和节点信息 */
  getProxies(): Promise<Record<string, ProxyGroup & { all?: { name: string; type: string }[] }>>
  /** 切换指定代理组的节点 */
  switchNode(groupName: string, nodeName: string): Promise<void>
  /** 设置代理模式 (rule/global/direct) */
  setMode(mode: 'rule' | 'global' | 'direct'): Promise<void>
  /** 获取当前代理模式 */
  getMode(): Promise<string>
  /** 对指定代理组内所有节点进行延迟检测 */
  checkDelay(groupName: string): Promise<{ nodeName: string; delay: number }[]>
  /** 注入订阅数据（节点列表、代理组、规则），并重启核心 */
  injectProxies(
    proxies: Record<string, unknown>[],
    proxyGroups: { name: string; type: string; proxies: string[] }[],
    rules: string[]
  ): Promise<void>
  /** 清除订阅数据，恢复默认配置并重启核心 */
  resetConfig(): Promise<void>
  /** 订阅流量数据回调，返回取消订阅的函数 */
  onData(cb: (data: TrafficData) => void): () => void
  /** 设置进程日志/错误回调 */
  setCallbacks(callbacks: { onLog?: (msg: string) => void; onError?: (msg: string) => void }): void
}

export interface ProxyGroup {
  name: string
  type: 'Selector' | 'URLTest' | 'Fallback' | 'Relay' | 'Direct' | 'Reject'
  now?: string
  all?: string[]
}
