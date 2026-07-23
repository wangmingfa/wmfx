<template>
  <div
    v-if="!isMacOS"
    class="window-controls"
  >
    <div
      class="window-btn"
      @click="minimizeWindow"
    >
      <Icon
        icon="mdi:window-minimize"
        :width="22"
        :height="22"
      />
    </div>
    <div
      class="window-btn"
      @click="maximizeWindow"
    >
      <Icon
        :icon="isMaximized ? 'mdi:window-restore' : 'mdi:window-maximize'"
        :width="22"
        :height="22"
      />
    </div>
    <div
      class="window-btn close-btn"
      @click="closeWindow"
    >
      <Icon
        icon="mdi:window-close"
        :width="22"
        :height="22"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { isMacOS } from '@/utils/os'

defineProps<{
  isMaximized: boolean
}>()

function minimizeWindow(): void {
  console.debug('[WindowControls] minimizeWindow')
  window.browserAPI.minimizeWindow()
}

function maximizeWindow(): void {
  console.debug('[WindowControls] maximizeWindow')
  window.browserAPI.maximizeWindow()
}

function closeWindow(): void {
  console.debug('[WindowControls] closeWindow')
  window.browserAPI.closeWindow()
}
</script>

<style scoped lang="less">
.window-controls {
  display: flex;
  align-items: center;
  height: 100%;
  gap: 0;
  margin-left: 8px;
  -webkit-app-region: no-drag;
  flex-shrink: 0;
}

.window-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 100%;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;

  &:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  &.close-btn:hover {
    background: var(--danger-color);
    color: white;
  }
}
</style>
