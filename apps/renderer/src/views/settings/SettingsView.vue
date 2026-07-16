<template>
  <PageLayout
    :title="`${t('appMenu.settings')} - ${t(active.labelKey)}`"
    icon="mdi:cog"
    :side-menu="settingsSideMenu"
    :max-content-width="800"
  >
    <component :is="active.component" />
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, markRaw } from 'vue'
import { useRoute } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import { useI18n } from '@/composables/useI18n'
import AboutView from './AboutView.vue'
import AppearanceView from './AppearanceView.vue'
import DownloadsView from './DownloadsView.vue'
import GeneralView from './GeneralView.vue'
import { settingsSideMenu } from './settingsMenu'

const { t } = useI18n()
const route = useRoute()

// 子页面配置：key 对应路由段，组件仅渲染 body 区域（PageLayout 统一在此提供）
const pages = {
  appearance: { component: markRaw(AppearanceView), labelKey: 'settings.navAppearance' as const },
  general: { component: markRaw(GeneralView), labelKey: 'settings.navGeneral' as const },
  downloads: { component: markRaw(DownloadsView), labelKey: 'settings.navDownloads' as const },
  about: { component: markRaw(AboutView), labelKey: 'settings.navAbout' as const },
}

// 依据当前路由段选取子页面；未知路由回退到 appearance
const active = computed(
  () => pages[(route.path.split('/')[2] as keyof typeof pages) ?? 'appearance'] ?? pages.appearance,
)
</script>
