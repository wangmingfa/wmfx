<template>
  <div class="proxy-panel">
    <div class="proxy-header">
      <div class="proxy-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="proxy-tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>
      <button
        class="proxy-toggle"
        :class="{ on: proxyRunning }"
        @click="toggleProxy"
      >
        {{ proxyRunning ? t('proxy.on') : t('proxy.off') }}
      </button>
    </div>
    <div class="proxy-content">
      <NodeView @go-subscriptions="activeTab = 'subscriptions'" />
      <SubscriptionView v-show="activeTab === 'subscriptions'" />
      <TrafficView v-show="activeTab === 'traffic'" />
      <LogView v-show="activeTab === 'logs'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
import LogView from './proxy/LogView.vue'
import NodeView from './proxy/NodeView.vue'
import SubscriptionView from './proxy/SubscriptionView.vue'
import TrafficView from './proxy/TrafficView.vue'

const { t } = useI18n()

const tabs = computed(() => [
  { key: 'nodes', label: t('proxy.tabNodes') },
  { key: 'subscriptions', label: t('proxy.tabSubscriptions') },
  { key: 'traffic', label: t('proxy.tabTraffic') },
  { key: 'logs', label: t('proxy.tabLogs') },
])
const activeTab = ref('nodes')
const proxyRunning = ref(false)

async function toggleProxy(): Promise<void> {
  if (proxyRunning.value) {
    await window.browserAPI.stopProxy()
  }
  else {
    await window.browserAPI.startProxy()
  }
  await checkStatus()
}

async function checkStatus(): Promise<void> {
  const status = await window.browserAPI.getProxyStatus()
  proxyRunning.value = status.running
}

onMounted(checkStatus)
</script>

<style scoped>
.proxy-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.proxy-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
}

.proxy-tabs {
  display: flex;
  flex: 1;
  gap: 2px;
}

.proxy-tab {
  flex: 1;
  padding: 6px 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  text-align: center;
}

.proxy-tab.active {
  background: var(--accent-color);
  color: #fff;
}

.proxy-tab:hover:not(.active) {
  background: var(--bg-tertiary);
}

.proxy-content {
  flex: 1;
  overflow-y: auto;
}

.proxy-toggle {
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.proxy-toggle.on {
  background: #2e7d32;
  border-color: #2e7d32;
  color: #fff;
}
</style>
