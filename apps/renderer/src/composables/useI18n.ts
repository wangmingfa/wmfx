import { type I18nKey, type I18nParams, messages } from '@browser/shared'
import { computed, ref } from 'vue'

/** 当前语言（存储值：'zh-CN' | 'en-US' | 'system'） */
const currentLang = ref<string>('zh-CN')

/** 解析后的实际语言码（'system' 按浏览器语言映射） */
const resolvedLang = computed(() => {
  if (currentLang.value === 'system') {
    return navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US'
  }
  return currentLang.value
})

/** 更新语言（同时通知所有组件重算） */
export function setLang(lang: string): void {
  currentLang.value = lang
}

/** 获取当前解析后的语言码 */
export function getResolvedLang(): string {
  return resolvedLang.value
}

export function useI18n() {
  const lookup = (keyPath: I18nKey): string => {
    const keys = keyPath.split('.')
    let obj = messages[resolvedLang.value] as unknown as Record<string, unknown>
    for (const k of keys) {
      if (obj && typeof obj === 'object' && k in obj) {
        obj = (obj as Record<string, unknown>)[k] as unknown as Record<string, unknown>
      } else {
        return keyPath
      }
    }
    return typeof obj === 'string' ? obj : keyPath
  }

  /** 将模板中的 {name} 占位符替换为 params 中的值；未提供的占位符原样保留 */
  const interpolate = (template: string, params?: Record<string, string | number>): string => {
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
      name in params ? String(params[name]) : `{${name}}`
    )
  }

  // 重载：普通 key 无参数；含占位符的 key 必须传对应参数
  function t<K extends I18nKey>(keyPath: K): string
  function t<K extends keyof I18nParams>(keyPath: K, params: I18nParams[K]): string
  function t(keyPath: I18nKey, params?: Record<string, string | number>): string {
    return interpolate(lookup(keyPath), params)
  }

  return { t, lang: currentLang }
}
