<template>
  <div class="settings-layout">
    <nav class="settings-nav">
      <RouterLink
        to="/settings/appearance"
        class="settings-nav-item"
      >
        外观
      </RouterLink>
      <RouterLink
        to="/settings/general"
        class="settings-nav-item"
      >
        常规
      </RouterLink>
      <RouterLink
        to="/settings/downloads"
        class="settings-nav-item"
      >
        下载
      </RouterLink>
      <RouterLink
        to="/settings/about"
        class="settings-nav-item"
      >
        关于
      </RouterLink>
    </nav>
    <div class="settings-content">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<style scoped>
.settings-layout {
  display: flex;
  height: 100%;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.settings-nav {
  width: 200px;
  flex-shrink: 0;
  padding: 16px 8px;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-nav-item {
  padding: 10px 16px;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
}

.settings-nav-item:hover {
  background: var(--bg-secondary);
}

.settings-nav-item.router-link-active {
  background: var(--accent-color);
  color: #fff;
}

.settings-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
</style>
