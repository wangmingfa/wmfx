import { type I18nKey, messages } from '@browser/shared'
import { describe, expect, it } from 'vitest'

/** 按点分路径从消息对象取值 */
function resolve(dict: unknown, keyPath: I18nKey): unknown {
  const keys = keyPath.split('.')
  let obj: unknown = dict
  for (const k of keys) {
    if (obj && typeof obj === 'object' && k in obj) {
      obj = (obj as Record<string, unknown>)[k]
    } else {
      return undefined
    }
  }
  return obj
}

const LANGS = ['zh-CN', 'en-US'] as const

describe('i18n 完整性', () => {
  it('zh-CN 与 en-US 均包含全部 key 且为字符串', () => {
    for (const lang of LANGS) {
      const dict = messages[lang]
      expect(dict).toBeDefined()
      // 遍历 zh-CN 的叶子路径，断言每种语言都能取到 string（抓漏译/缺字段）
      walkKeys(messages['zh-CN'], (path) => {
        const value = resolve(dict, path as unknown as I18nKey)
        expect(value, `${lang} 缺少或类型错误: ${path}`).toBeTypeOf('string')
      })
    }
  })
})

/** 递归遍历嵌套对象，对每一个叶子（string）调用 cb(path) */
function walkKeys(obj: unknown, cb: (path: string) => void, prefix = ''): void {
  if (typeof obj === 'string') {
    cb(prefix)
    return
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      walkKeys(v, cb, prefix ? `${prefix}.${k}` : k)
    }
  }
}
