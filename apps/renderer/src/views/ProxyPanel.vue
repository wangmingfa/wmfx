<template>
  <div class="proxy-panel">
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
    <div class="proxy-content">
      <NodeView v-show="activeTab === 'nodes'" />
      <SubscriptionView v-show="activeTab === 'subscriptions'" />
      <TrafficView v-show="activeTab === 'traffic'" />
      <LogView v-show="activeTab === 'logs'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import LogView from './proxy/LogView.vue'
import NodeView from './proxy/NodeView.vue'
import SubscriptionView from './proxy/SubscriptionView.vue'
import TrafficView from './proxy/TrafficView.vue'

const tabs = [
  { key: 'nodes', label: 'Nodes' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'traffic', label: 'Traffic' },
  { key: 'logs', label: 'Logs' },
]
const activeTab = ref('nodes')
</script>

<style scoped>
.proxy-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.proxy-tabs {
  display: flex;
  gap: 2px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
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
</style>
