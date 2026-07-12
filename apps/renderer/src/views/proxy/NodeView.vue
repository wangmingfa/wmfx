<template>
  <div class="node-view">
    <div class="proxy-mode">
      <button
        :class="{ active: mode === 'rule' }"
        @click="setMode('rule')"
      >
        Rule
        <Tooltip :delay-duration="100">
          <span class="mode-tip">
            <Icon
              icon="carbon:help"
              width="14"
              height="14"
            />
          </span>
          <template #content>
            根据规则决定走代理还是直连（如国内直连、国外走代理）
          </template>
        </Tooltip>
      </button>
      <button
        :class="{ active: mode === 'global' }"
        @click="setMode('global')"
      >
        Global
        <Tooltip :delay-duration="100">
          <span class="mode-tip">
            <Icon
              icon="carbon:help"
              width="14"
              height="14"
            />
          </span>
          <template #content>
            所有流量都走代理节点
          </template>
        </Tooltip>
      </button>
      <button
        :class="{ active: mode === 'direct' }"
        @click="setMode('direct')"
      >
        Direct
        <Tooltip :delay-duration="100">
          <span class="mode-tip">
            <Icon
              icon="carbon:help"
              width="14"
              height="14"
            />
          </span>
          <template #content>
            所有流量直连，不走代理
          </template>
        </Tooltip>
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
      <div class="empty-title">
        No proxy nodes available
      </div>
      <div class="empty-desc">
        Please add a subscription in the <span
          class="link"
          @click="$emit('goSubscriptions')"
        >Subscriptions</span> tab first, then come back to select nodes.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { onMounted, ref } from 'vue'
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'

defineEmits<{ goSubscriptions: [] }>()

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
  display: flex;
  align-items: center;
  justify-content: center;
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

.mode-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  color: inherit;
  opacity: 0.5;
}

.mode-tip:hover {
  opacity: 1;
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

.empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.empty-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.link {
  color: var(--accent-color);
  cursor: pointer;
}

.link:hover {
  text-decoration: underline;
}
</style>
