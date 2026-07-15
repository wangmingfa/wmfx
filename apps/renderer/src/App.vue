<template>
  <NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides" style="height: 100%">
    <RouterView v-slot="{ Component }" class="router-view">
      <component :is="Component" />
    </RouterView>
  </NConfigProvider>
</template>

<script setup lang="ts">
import type { GlobalThemeOverrides } from 'naive-ui'
import { darkTheme, NConfigProvider } from 'naive-ui'
import { computed } from 'vue'
import { RouterView } from 'vue-router'
import { useTheme } from '@/composables/useTheme'

const { theme } = useTheme()
const naiveTheme = computed(() => (theme.value === 'dark' ? darkTheme : undefined))

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
  const style = getComputedStyle(document.documentElement)
  const primary = resolveColor(style.getPropertyValue('--primary').trim())
  const primaryForeground = resolveColor(style.getPropertyValue('--primary-foreground').trim())
  return {
    common: {
      primaryColor: primary,
      primaryColorHover: primary,
      primaryColorPressed: primary,
      primaryColorSuppl: primary,
      primaryTextColor: primaryForeground,
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
