<template>
  <PageLayout :title="t('appMenu.proxy')" icon="mdi:network" :body-scroll="false">
    <template #search>
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
    </template>

    <template #actions>
      <button class="proxy-toggle" :class="{ on: proxyRunning }" @click="toggleProxy">
        {{ proxyRunning ? t('proxy.on') : t('proxy.off') }}
      </button>
    </template>

    <div class="proxy-content">
      <NodeView @go-subscriptions="activeTab = 'subscriptions'" />
      <SubscriptionView v-show="activeTab === 'subscriptions'" />
      <TrafficView v-show="activeTab === 'traffic'" />
      <LogView v-show="activeTab === 'logs'" />
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PageLayout from '@/components/PageLayout.vue'
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
  console.debug('[ProxyPanel] toggleProxy: 当前 running', proxyRunning.value)
  if (proxyRunning.value) {
    await window.browserAPI.stopProxy()
  } else {
    await window.browserAPI.startProxy()
  }
  await checkStatus()
}

async function checkStatus(): Promise<void> {
  const status = await window.browserAPI.getProxyStatus()
  console.debug('[ProxyPanel] checkStatus: running', status.running)
  proxyRunning.value = status.running
}

onMounted(() => {
  console.debug('[ProxyPanel] onMounted: 检查代理状态')
  checkStatus()
})
</script>

<style scoped>
.proxy-tabs {
  display: flex;
  gap: 2px;
}

.proxy-tab {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
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
  height: 100%;
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
