<template>
  <div class="proxy-page">
    <ProxyPanel />
  </div>
</template>

<script setup lang="ts">
import ProxyPanel from './ProxyPanel.vue'
</script>

<style scoped>
.proxy-page {
  height: 100%;
  width: 100%;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
}
</style>
