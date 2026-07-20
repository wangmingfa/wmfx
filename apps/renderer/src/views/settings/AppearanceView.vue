<template>
  <Section :title="t('settings.sections.theme')">
    <SectionItem :label="t('settings.theme')">
      <NRadioGroup
        :value="themeSetting"
        class="settings-radio-group"
        @update:value="onThemeChange"
      >
        <NRadio
          v-for="mode in themeModes"
          :key="mode.value"
          :value="mode.value"
          :label="mode.label"
        />
      </NRadioGroup>
    </SectionItem>
  </Section>

  <Section :title="t('settings.tabBarPosition')">
    <SectionItem :label="t('settings.tabBarPosition')">
      <div class="tab-position-options">
        <label
          class="tab-position-card"
          :class="{ 'tab-position-card--active': tabBarPosition === 'top' }"
          @click="onTabBarPositionChange('top')"
        >
          <div class="tab-position-illustration">
            <!-- 水平标签栏示意图：顶部标签行 + 地址栏 + 内容区 -->
            <div class="illust-row">
              <div class="illust-tab-bar-h">
                <div class="illust-tab" />
                <div class="illust-tab" />
                <div class="illust-tab active" />
              </div>
            </div>
            <div class="illust-row">
              <div class="illust-addressbar" />
            </div>
            <div class="illust-row illust-content" />
          </div>
          <NRadio value="top">
            {{ t('settings.tabBarPositionOptions.top') }}
          </NRadio>
        </label>

        <label
          class="tab-position-card"
          :class="{ 'tab-position-card--active': tabBarPosition === 'left' }"
          @click="onTabBarPositionChange('left')"
        >
          <div class="tab-position-illustration">
            <!-- 垂直标签栏示意图：左侧标签列 + 右侧地址栏/内容区 -->
            <div class="illust-row illust-row--h">
              <div class="illust-tab-bar-v">
                <div class="illust-tab-v" />
                <div class="illust-tab-v active" />
                <div class="illust-tab-v" />
              </div>
              <div class="illust-main-area">
                <div class="illust-addressbar" />
                <div class="illust-row illust-content" />
              </div>
            </div>
          </div>
          <NRadio value="left">
            {{ t('settings.tabBarPositionOptions.left') }}
          </NRadio>
        </label>
      </div>
    </SectionItem>
  </Section>
</template>

<script setup lang="ts">
import type { ThemeMode } from '@browser/ipc-contract'
import { NRadio, NRadioGroup } from 'naive-ui'
import { onMounted, ref } from 'vue'
import Section from '@/components/Section.vue'
import SectionItem from '@/components/SectionItem.vue'
import { useI18n } from '@/composables/useI18n'
import { useTheme } from '@/composables/useTheme'

const { t } = useI18n()
const { themeSetting } = useTheme()

const themeModes: { label: string, value: ThemeMode }[] = [
  { label: t('settings.themeModes.light'), value: 'light' },
  { label: t('settings.themeModes.dark'), value: 'dark' },
  { label: t('settings.themeModes.system'), value: 'system' },
]

async function onThemeChange(theme: ThemeMode): Promise<void> {
  console.debug('[Appearance] onThemeChange: theme', theme)
  await window.browserAPI.setTheme(theme)
}

const tabBarPosition = ref<'top' | 'left'>('top')

async function loadTabBarPosition(): Promise<void> {
  const v = await window.browserAPI.getSetting('tabBarPosition')
  tabBarPosition.value = (v as 'top' | 'left') ?? 'top'
}

function onTabBarPositionChange(value: 'top' | 'left'): void {
  tabBarPosition.value = value
  void window.browserAPI.setSetting({ key: 'tabBarPosition', value })
}

onMounted(() => {
  void loadTabBarPosition()
})
</script>

<style scoped>
.tab-position-options {
  display: flex;
  gap: 12px;
}

.tab-position-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 150ms;
  flex: 1;
}

.tab-position-card--active {
  border-color: var(--accent-color);
}

.tab-position-illustration {
  width: 100%;
  height: 64px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-primary);
}

.illust-row {
  display: flex;
  height: 14px;
}

.illust-row--h {
  height: 100%;
}

.illust-tab-bar-h {
  display: flex;
  gap: 2px;
  padding: 2px 4px;
  background: var(--tabbar-bg, #cddffd);
  width: 100%;
}

.illust-tab {
  flex: 1;
  background: var(--bg-tertiary);
  border-radius: 2px;
}

.illust-tab.active {
  background: var(--accent-color);
  opacity: 0.5;
}

.illust-addressbar {
  height: 10px;
  margin: 2px 4px;
  background: var(--bg-tertiary);
  border-radius: 2px;
}

.illust-content {
  flex: 1;
  background: var(--bg-secondary);
}

.illust-tab-bar-v {
  width: 20px;
  background: var(--tabbar-bg, #cddffd);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px;
}

.illust-tab-v {
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: 2px;
}

.illust-tab-v.active {
  background: var(--accent-color);
  opacity: 0.5;
}

.illust-main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>
