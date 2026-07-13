<template>
  <div class="subscription-view">
    <div class="sub-add">
      <input
        v-model="newSubName"
        placeholder="Name"
        class="sub-input"
      >
      <input
        v-model="newSubUrl"
        placeholder="Subscription URL"
        class="sub-input"
      >
      <button
        class="sub-add-btn"
        :disabled="adding || !newSubUrl || !newSubName"
        @click="addSubscription"
      >
        {{ adding ? 'Adding...' : 'Add' }}
      </button>
      <div
        v-if="addError"
        class="add-error"
      >
        {{ addError }}
      </div>
    </div>

    <div
      v-if="subscriptions.length === 0"
      class="empty"
    >
      <Icon
        icon="carbon:network-4"
        width="32"
        height="32"
        class="empty-icon"
      />
      <div class="empty-title">
        No subscriptions yet
      </div>
      <div class="empty-desc">
        Add a proxy subscription link to get started. You can get a subscription URL from your proxy service provider.
      </div>
    </div>

    <div
      v-else
      class="sub-list"
    >
      <div
        v-for="sub in subscriptions"
        :key="sub.id"
        class="sub-item"
        :class="{ active: sub.active }"
      >
        <div class="sub-info">
          <div class="sub-name">
            {{ sub.name }}
            <span
              v-if="sub.active"
              class="active-badge"
            >Active</span>
          </div>
          <div class="sub-meta">
            <span>Used: {{ formatBytes(sub.download) }}</span>
            <span v-if="sub.total > 0">/ {{ formatBytes(sub.total) }}</span>
          </div>
          <div class="sub-meta">
            <span>Expire: {{ formatDate(sub.expire) }}</span>
          </div>
        </div>
        <div class="sub-actions">
          <button
            class="sub-action-btn"
            :class="{ activate: !sub.active }"
            @click="sub.active ? deactivateSubscription(sub.id) : activateSubscription(sub.id)"
          >
            {{ sub.active ? 'Deactivate' : 'Activate' }}
          </button>
          <button
            class="sub-action-btn"
            @click="updateSubscription(sub.id)"
          >
            Refresh
          </button>
          <button
            class="sub-action-btn danger"
            @click="removeSubscription(sub.id)"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { onMounted, ref } from 'vue'

interface Subscription {
  id: string
  name: string
  url: string
  active: number
  last_update: number
  expire: number
  upload: number
  download: number
  total: number
}

const subscriptions = ref<Subscription[]>([])
const newSubUrl = ref('')
const newSubName = ref('')
const adding = ref(false)
const addError = ref('')

async function loadSubscriptions(): Promise<void> {
  const items = await window.browserAPI.getSubscriptions()
  subscriptions.value = items.map(item => ({ ...item, active: 0 }))
}

async function addSubscription(): Promise<void> {
  if (!newSubUrl.value || !newSubName.value)
    return
  adding.value = true
  addError.value = ''
  try {
    await window.browserAPI.addSubscription(newSubUrl.value, newSubName.value)
    newSubUrl.value = ''
    newSubName.value = ''
    await loadSubscriptions()
  }
  catch (e) {
    addError.value = String(e)
  }
  finally {
    adding.value = false
  }
}

async function removeSubscription(id: string): Promise<void> {
  await window.browserAPI.removeSubscription(id)
  await loadSubscriptions()
}

async function updateSubscription(id: string): Promise<void> {
  await window.browserAPI.updateSubscription(id)
  await loadSubscriptions()
}

async function activateSubscription(id: string): Promise<void> {
  await window.browserAPI.activateSubscription(id)
  await loadSubscriptions()
}

async function deactivateSubscription(id: string): Promise<void> {
  await window.browserAPI.deactivateSubscription(id)
  await loadSubscriptions()
}

function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`
}

function formatDate(ts: number): string {
  if (ts === 0)
    return 'N/A'
  return new Date(ts * 1000).toLocaleDateString()
}

onMounted(loadSubscriptions)
</script>

<style scoped>
.subscription-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sub-add {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sub-input {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

.sub-input:focus {
  border-color: var(--accent-color);
}

.sub-add-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background: var(--accent-color);
  color: #fff;
  cursor: pointer;
  font-size: 12px;
}

.sub-add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.add-error {
  padding: 6px 8px;
  border-radius: 4px;
  background: var(--danger-color);
  color: #fff;
  font-size: 11px;
  line-height: 1.4;
}

.sub-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sub-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.sub-item.active {
  border-color: var(--accent-color);
}

.sub-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sub-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.active-badge {
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--accent-color);
  color: #fff;
  font-size: 10px;
  font-weight: 500;
}

.sub-meta {
  font-size: 11px;
  color: var(--text-secondary);
}

.sub-actions {
  display: flex;
  gap: 4px;
}

.sub-action-btn {
  padding: 3px 8px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
}

.sub-action-btn:hover {
  background: var(--accent-color);
  color: #fff;
}

.sub-action-btn.activate:hover {
  background: #2e7d32;
  color: #fff;
}

.sub-action-btn.danger:hover {
  background: var(--danger-color);
}

.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 20px;
  font-size: 13px;
}

.empty-icon {
  color: var(--text-secondary);
  margin-bottom: 8px;
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
</style>
