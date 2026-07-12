<template>
  <div class="node-view">
    <div class="proxy-mode">
      <button
        :class="{ active: mode === 'rule' }"
        @click="setMode('rule')"
      >
        Rule
      </button>
      <button
        :class="{ active: mode === 'global' }"
        @click="setMode('global')"
      >
        Global
      </button>
      <button
        :class="{ active: mode === 'direct' }"
        @click="setMode('direct')"
      >
        Direct
      </button>
    </div>

    <div
      v-if="selectedGroup && proxies[selectedGroup]"
      class="proxy-group"
    >
      <div class="group-header">
        <span class="group-name">{{ selectedGroup }}</span>
        <button
          class="delay-btn"
          :disabled="loading"
          @click="checkDelay"
        >
          {{ loading ? 'Testing...' : 'Test Delay' }}
        </button>
      </div>
      <div class="node-list">
        <div
          v-for="node in proxies[selectedGroup].all"
          :key="node"
          class="node-item"
          :class="{ active: selectedNode === node }"
          @click="switchNode(node)"
        >
          <span class="node-name">{{ node }}</span>
          <span
            v-if="delays[node] !== undefined"
            class="node-delay"
          >
            {{ formatDelay(delays[node]) }}
          </span>
        </div>
      </div>
    </div>
    <div
      v-else
      class="empty"
    >
      No proxy groups available
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

interface ProxyGroup {
  name: string
  type: string
  now?: string
  all?: string[]
}

const proxies = ref<Record<string, ProxyGroup>>({})
const selectedGroup = ref<string>('')
const selectedNode = ref<string>('')
const mode = ref<string>('rule')
const loading = ref(false)
const delays = ref<Record<string, number>>({})

async function loadProxies(): Promise<void> {
  proxies.value = await window.browserAPI.getProxies()
  const groups = Object.keys(proxies.value).filter(k => proxies.value[k].type === 'Selector')
  if (groups.length > 0 && !selectedGroup.value) {
    selectedGroup.value = groups[0]
  }
  if (selectedGroup.value) {
    const g = proxies.value[selectedGroup.value]
    if (g?.now)
      selectedNode.value = g.now
  }
}

async function loadMode(): Promise<void> {
  mode.value = await window.browserAPI.getProxyMode()
}

async function switchNode(nodeName: string): Promise<void> {
  if (!selectedGroup.value)
    return
  selectedNode.value = nodeName
  await window.browserAPI.switchProxyNode(selectedGroup.value, nodeName)
}

async function setMode(m: 'rule' | 'global' | 'direct'): Promise<void> {
  mode.value = m
  await window.browserAPI.setProxyMode(m)
}

async function checkDelay(): Promise<void> {
  if (!selectedGroup.value)
    return
  loading.value = true
  const results = await window.browserAPI.checkProxyDelay(selectedGroup.value)
  const map: Record<string, number> = {}
  for (const r of results) map[r.nodeName] = r.delay
  delays.value = map
  loading.value = false
}

function formatDelay(d: number): string {
  if (d < 0)
    return 'timeout'
  return `${d}ms`
}

onMounted(async () => {
  await Promise.all([loadProxies(), loadMode()])
})
</script>

<style scoped>
.node-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.proxy-mode {
  display: flex;
  gap: 4px;
}

.proxy-mode button {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
}

.proxy-mode button.active {
  background: var(--accent-color);
  color: #fff;
  border-color: var(--accent-color);
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.group-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.delay-btn {
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
}

.delay-btn:hover {
  background: var(--accent-color);
  color: #fff;
}

.node-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.node-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.node-item:hover {
  background: var(--bg-tertiary);
}

.node-item.active {
  background: var(--accent-color);
  color: #fff;
}

.node-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-delay {
  font-size: 11px;
  opacity: 0.7;
}

.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 20px;
  font-size: 13px;
}
</style>
