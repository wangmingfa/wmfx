import { messages } from '@browser/shared'
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
  const t = (keyPath: string): string => {
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

  return { t, lang: currentLang }
}
