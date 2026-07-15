import type { ResolvedThemeMode, ThemeMode } from '@browser/ipc-contract'
import { computed, ref } from 'vue'

/** 用户在设置页选择的主题（含 'system'） */
const themeSetting = ref<ThemeMode>('light')

const resolveThemeFlag = ref(0)
/** 最终渲染到 DOM 的主题，始终为 'light' | 'dark' */
const resolvedTheme = computed<ResolvedThemeMode>(() => {
  // resolveThemeFlag用于设置主题为“跟随系统”，系统切换主题的情况，刷新resolvedTheme
  // 因为themeSetting是不变的，所以需要用resolveThemeFlag来重新计算resolvedTheme
  if (resolveThemeFlag.value < 0) return 'light'
  if (themeSetting.value === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return themeSetting.value
})

function applyToDOM(theme: ResolvedThemeMode): void {
  document.documentElement.setAttribute('data-theme', theme)
}

export function useTheme() {
  return {
    /** 用户选择（设置页回显），可选 'light' | 'dark' | 'system' */
    themeSetting,
    /** 最终渲染主题（UI 组件用），始终 'light' | 'dark' */
    theme: resolvedTheme,
    setTheme,
  }
}

function setTheme(setting: ThemeMode): void {
  if (themeSetting.value === setting) {
    resolveThemeFlag.value++
  }
  themeSetting.value = setting
  applyToDOM(resolvedTheme.value)
}

/**
 * 启动时同步主题到外壳 WebContentsView（TabBar/AddressBar 所在页面）。
 * 1. 注册 onThemeChange 监听后续变化
 * 2. 初始读取当前主题并应用
 */
export async function syncThemeToShell(): Promise<void> {
  window.browserAPI?.onThemeChange?.((theme) => {
    setTheme(theme)
  })
  return new Promise((resolve) => {
    window.browserAPI?.getTheme()?.then((theme) => {
      setTheme(theme)
      resolve()
    })
  })
}
