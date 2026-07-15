<template>
  <NConfigProvider
    :theme="naiveTheme"
    style="height: 100%"
  >
    <RouterView
      v-slot="{ Component }"
      class="router-view"
    >
      <component :is="Component" />
    </RouterView>
  </NConfigProvider>
</template>

<script setup lang="ts">
import { darkTheme, NConfigProvider } from 'naive-ui'
import { computed } from 'vue'
import { RouterView } from 'vue-router'
import { useTheme } from '@/composables/useTheme'

const { theme } = useTheme()
const naiveTheme = computed(() => theme.value === 'dark' ? darkTheme : undefined)
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
