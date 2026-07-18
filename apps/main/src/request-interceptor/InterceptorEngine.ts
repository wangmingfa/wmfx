/**
 * 拦截规则引擎 — URL 匹配 + 动作决策
 */

import type { InterceptorRule } from '@browser/ipc-contract'

interface MatchInput {
  url: string
  method: string
  type: string
}

/** glob 匹配：支持 * 通配符 */
function globMatch(pattern: string, url: string): boolean {
  // 将 glob 转为正则
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$',
    'i'
  )
  return regex.test(url)
}

export class InterceptorEngine {
  constructor(private getRules: () => InterceptorRule[]) {}

  /** 匹配输入，返回第一个匹配的规则，无匹配返回 null */
  match(input: MatchInput): InterceptorRule | null {
    for (const rule of this.getRules()) {
      if (!rule.enabled) continue
      if (!globMatch(rule.urlPattern, input.url)) continue
      if (rule.methods.length > 0 && !rule.methods.includes(input.method.toUpperCase())) continue
      if (rule.resourceTypes.length > 0 && !rule.resourceTypes.includes(input.type)) continue
      return rule
    }
    return null
  }
}
