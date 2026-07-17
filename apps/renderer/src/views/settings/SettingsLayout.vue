<template>
  <section class="settings-layout">
    <!-- Sidebar -->
    <aside class="settings-sidebar">
      <nav class="settings-nav">
        <RouterLink
          v-for="item in menu"
          :key="item.key"
          :to="item.to ?? ''"
          class="settings-nav-item"
          :class="{ active: item.to && isActive(item.to) }"
          :aria-label="t(item.labelKey)"
        >
          <Icon v-if="item.icon" :icon="item.icon" width="20" height="20" class="settings-nav-icon" />
          <span class="settings-nav-label">{{ t(item.labelKey) }}</span>
        </RouterLink>
      </nav>
    </aside>

    <!-- Content -->
    <main class="settings-content">
      <div class="settings-content-inner">
        <header class="settings-header">
          <Icon v-if="icon" :icon="icon" width="22" height="22" class="settings-header-icon" />
          <h1 class="settings-header-title">
            {{ title }}
          </h1>
        </header>

        <div class="settings-body">
          <slot />
        </div>
      </div>
    </main>
  </section>
</template>

<script setup lang="ts">
import type { SideMenuItem } from '@/components/side-menu'
import { Icon } from '@iconify/vue'
import { useRoute } from 'vue-router'
import { useI18n } from '@/composables/useI18n'

defineProps<{
  title: string
  icon: string
  menu: SideMenuItem[]
}>()

const { t } = useI18n()
const route = useRoute()

function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<style scoped>
.settings-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  background: var(--bg-primary);
}

.settings-sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 20px 16px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
  border: none;
  outline: none;
  transition: background 0.15s ease;
}

.settings-nav-icon {
  flex-shrink: 0;
  opacity: 0.8;
}

.settings-nav-item:hover {
  background: var(--bg-tertiary);
}

.settings-nav-item.active {
  background: var(--accent-color);
  color: #fff;
}

.settings-nav-item.active .settings-nav-icon {
  opacity: 1;
}

.settings-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}

.settings-content-inner {
  width: 100%;
  max-width: 800px;
  margin-left: 28px;
  padding: 20px 24px 24px;
  box-sizing: border-box;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}

.settings-header-icon {
  flex-shrink: 0;
}

.settings-header-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-body {
  display: flex;
  flex-direction: column;
}
</style>
