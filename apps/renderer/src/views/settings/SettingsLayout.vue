<template>
  <div class="settings-layout">
    <nav class="settings-nav">
      <RouterLink to="/settings/appearance" class="settings-nav-item">
        <Icon icon="mdi:palette" width="18" height="18" class="nav-icon" />
        {{ t('settings.navAppearance') }}
      </RouterLink>
      <RouterLink to="/settings/general" class="settings-nav-item">
        <Icon icon="mdi:cog" width="18" height="18" class="nav-icon" />
        {{ t('settings.navGeneral') }}
      </RouterLink>
      <RouterLink to="/settings/downloads" class="settings-nav-item">
        <Icon icon="mdi:download" width="18" height="18" class="nav-icon" />
        {{ t('settings.navDownloads') }}
      </RouterLink>
      <RouterLink to="/settings/about" class="settings-nav-item">
        <Icon icon="mdi:information" width="18" height="18" class="nav-icon" />
        {{ t('settings.navAbout') }}
      </RouterLink>
    </nav>
    <div class="settings-content">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '../../composables/useI18n'

const { t } = useI18n()
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
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
}

.nav-icon {
  flex-shrink: 0;
  opacity: 0.8;
}

.settings-nav-item:hover {
  background: var(--bg-secondary);
}

.settings-nav-item.router-link-active {
  background: var(--accent-color);
  color: #fff;
}

.settings-nav-item.router-link-active .nav-icon {
  opacity: 1;
}

.settings-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
</style>
