<template>
  <NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides" style="height: 100%">
    <NDialogProvider>
      <RouterView v-slot="{ Component }" class="router-view">
        <component :is="Component" />
      </RouterView>
    </NDialogProvider>
  </NConfigProvider>
</template>

<script setup lang="ts">
import type { GlobalThemeOverrides } from 'naive-ui'
import { darkTheme, NConfigProvider, NDialogProvider } from 'naive-ui'
import { computed } from 'vue'
import { RouterView } from 'vue-router'
import { useTheme } from '@/composables/useTheme'

console.debug('[App] setup: useTheme 初始化')

const { theme } = useTheme()
const naiveTheme = computed(() => (theme.value === 'dark' ? darkTheme : undefined))

console.debug('[App] resolveColor: 初始化 CSS 变量解析函数')

function resolveColor(cssVar: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = cssVar
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`
}

const themeOverrides = computed<GlobalThemeOverrides>(() => {
  void theme.value
  console.debug('[App] themeOverrides: 重新计算主题覆盖，theme', theme.value)
  const style = getComputedStyle(document.documentElement)
  const primary = resolveColor(style.getPropertyValue('--primary').trim())
  const primaryForeground = resolveColor(style.getPropertyValue('--primary-foreground').trim())
  console.debug('[App] themeOverrides: primary', primary)
  return {
    common: {
      primaryColor: primary,
      primaryColorHover: primary,
      primaryColorPressed: primary,
      primaryColorSuppl: primary,
      primaryTextColor: primaryForeground,
    },
    // 全局收窄 tooltip 尺寸：NTooltip 基于 Popover 渲染，尺寸变量在 Popover 上；字号在 Tooltip/Popover 上
    Tooltip: {
      // 提示文字字号（默认 14px）
      peers: {
        Popover: {
          fontSize: '12px',
          // NTooltip 默认 size="small"，对应 padding-small；一并调小各档以防调用方改 size
          paddingSmall: '4px 8px',
          padding: '4px 8px',
          borderRadius: '6px',
        },
      },
    },
  }
})
</script>

<style lang="less" scoped>
.router-view {
  height: 100%;
}
</style>

<style>
* {
  margin: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #ffffff;
  color: #333333;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  user-select: none;
  -webkit-user-select: none;
}
</style>
