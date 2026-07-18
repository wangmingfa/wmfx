<template>
  <div class="interceptor-page">
    <div class="header">
      <h1>请求拦截器</h1>
      <div class="header-actions">
        <span class="status">{{ statusText }}</span>
        <button class="action-btn" :class="{ active: capturing }" @click="toggleCapture">
          {{ capturing ? '停止捕获' : '开始捕获' }}
        </button>
        <button class="action-btn" @click="clearLog">
          清空
        </button>
      </div>
    </div>

    <div class="filter-bar">
      <input v-model="filterText" class="filter-input" placeholder="过滤 URL..." />
      <select v-model="filterMethod" class="filter-select">
        <option value="">
          全部方法
        </option>
        <option value="GET">
          GET
        </option>
        <option value="POST">
          POST
        </option>
        <option value="PUT">
          PUT
        </option>
        <option value="DELETE">
          DELETE
        </option>
        <option value="PATCH">
          PATCH
        </option>
      </select>
      <select v-model="filterStatus" class="filter-select">
        <option value="">
          全部状态
        </option>
        <option value="2xx">
          2xx
        </option>
        <option value="3xx">
          3xx
        </option>
        <option value="4xx">
          4xx
        </option>
        <option value="5xx">
          5xx
        </option>
        <option value="error">
          错误
        </option>
      </select>
    </div>

    <div class="main-area">
      <div class="request-list">
        <div
          v-for="req in filteredRequests"
          :key="req.id"
          class="request-item"
          :class="{ selected: selectedId === req.id, intercepted: req.intercepted }"
          @click="selectRequest(req.id)"
        >
          <span class="method" :class="methodClass(req.method)">{{ req.method }}</span>
          <span class="status-badge" :class="statusClass(req.statusCode)">{{ req.statusCode || '—' }}</span>
          <span class="url" :title="req.url">{{ shortenUrl(req.url) }}</span>
          <span class="duration">{{ req.duration }}ms</span>
          <span v-if="req.intercepted" class="tag tag-intercepted">{{ req.ruleName || '拦截' }}</span>
          <span v-if="req.error" class="tag tag-error">错误</span>
        </div>
        <div v-if="filteredRequests.length === 0" class="empty">
          暂无请求
        </div>
      </div>

      <div v-if="selectedRequest" class="request-detail">
        <div class="detail-tabs">
          <button :class="{ active: detailTab === 'headers' }" @click="detailTab = 'headers'">
            请求头
          </button>
          <button :class="{ active: detailTab === 'response' }" @click="detailTab = 'response'">
            响应头
          </button>
          <button :class="{ active: detailTab === 'overview' }" @click="detailTab = 'overview'">
            概览
          </button>
        </div>

        <div class="detail-content">
          <div v-if="detailTab === 'overview'" class="overview">
            <div class="overview-row">
              <label>URL</label>
              <span>{{ selectedRequest.url }}</span>
            </div>
            <div class="overview-row">
              <label>方法</label>
              <span>{{ selectedRequest.method }}</span>
            </div>
            <div class="overview-row">
              <label>状态码</label>
              <span>{{ selectedRequest.statusCode }}</span>
            </div>
            <div class="overview-row">
              <label>类型</label>
              <span>{{ selectedRequest.type }}</span>
            </div>
            <div class="overview-row">
              <label>耗时</label>
              <span>{{ selectedRequest.duration }}ms</span>
            </div>
            <div v-if="selectedRequest.intercepted" class="overview-row">
              <label>拦截</label>
              <span class="intercepted-label">{{ selectedRequest.ruleName }}</span>
            </div>
            <div v-if="selectedRequest.error" class="overview-row">
              <label>错误</label>
              <span class="error-label">{{ selectedRequest.error }}</span>
            </div>
          </div>

          <div v-if="detailTab === 'headers'" class="headers-view">
            <div v-for="(v, k) in selectedRequest.requestHeaders" :key="k" class="header-row">
              <span class="header-key">{{ k }}:</span>
              <span class="header-value">{{ v }}</span>
            </div>
            <div v-if="Object.keys(selectedRequest.requestHeaders).length === 0" class="empty">
              暂无请求头
            </div>
          </div>

          <div v-if="detailTab === 'response'" class="headers-view">
            <div v-for="(v, k) in selectedRequest.responseHeaders" :key="k" class="header-row">
              <span class="header-key">{{ k }}:</span>
              <span class="header-value">{{ v }}</span>
            </div>
            <div v-if="Object.keys(selectedRequest.responseHeaders).length === 0" class="empty">
              暂无响应头
            </div>
          </div>
        </div>
      </div>

      <div v-else class="detail-placeholder">
        选择一个请求查看详情
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CapturedRequest } from '@browser/ipc-contract'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const capturing = ref(false)
const requests = ref<CapturedRequest[]>([])
const selectedId = ref<string | null>(null)
const filterText = ref('')
const filterMethod = ref('')
const filterStatus = ref('')
const detailTab = ref<'overview' | 'headers' | 'response'>('overview')
let pollTimer: ReturnType<typeof setInterval> | null = null

const statusText = computed(() => `已捕获 ${requests.value.length} 条请求`)

const selectedRequest = computed(() => requests.value.find((r) => r.id === selectedId.value) ?? null)

const filteredRequests = computed(() => {
  let list = requests.value
  if (filterText.value) {
    const q = filterText.value.toLowerCase()
    list = list.filter((r) => r.url.toLowerCase().includes(q))
  }
  if (filterMethod.value) {
    list = list.filter((r) => r.method === filterMethod.value)
  }
  if (filterStatus.value) {
    if (filterStatus.value === 'error') {
      list = list.filter((r) => r.error || r.statusCode >= 400)
    } else {
      const prefix = filterStatus.value[0]
      list = list.filter((r) => String(r.statusCode).startsWith(prefix))
    }
  }
  return list
})

function methodClass(m: string): string {
  const map: Record<string, string> = {
    GET: 'method-get',
    POST: 'method-post',
    PUT: 'method-put',
    DELETE: 'method-delete',
    PATCH: 'method-patch',
  }
  return map[m] ?? ''
}

function statusClass(code: number): string {
  if (code === 0) return 'status-error'
  const s = String(code)[0]
  return `status-${s}xx`
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname + u.search || '/'
  } catch {
    return url
  }
}

function selectRequest(id: string): void {
  selectedId.value = id
  detailTab.value = 'overview'
}

async function toggleCapture(): Promise<void> {
  capturing.value = !capturing.value
  await window.browserAPI.setSetting({ key: 'interceptorEnabled', value: capturing.value })
  // 通过 IPC 切换
  await window.browserAPI.interceptorSetEnabled?.(capturing.value)
  if (capturing.value) startPolling()
  else stopPolling()
}

async function clearLog(): Promise<void> {
  requests.value = []
  await window.browserAPI.interceptorClearLog?.()
}

async function fetchCaptured(): Promise<void> {
  const list = await window.browserAPI.interceptorGetCaptured?.({ limit: 500 })
  if (list) requests.value = list
}

function startPolling(): void {
  if (pollTimer) return
  pollTimer = setInterval(fetchCaptured, 1000)
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(async () => {
  // 加载初始状态
  const status = await window.browserAPI.interceptorGetStatus?.()
  if (status) {
    capturing.value = status.enabled
  }
  if (capturing.value) startPolling()
  await fetchCaptured()
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<style scoped lang="less">
.interceptor-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 13px;
  color: var(--text-primary);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);

  h1 {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;

    .status {
      color: var(--text-secondary);
      font-size: 12px;
    }
    .action-btn {
      padding: 4px 12px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      cursor: pointer;
      font-size: 12px;
      &.active {
        background: var(--accent);
        color: #fff;
        border-color: var(--accent);
      }
      &:hover:not(.active) {
        background: var(--bg-tertiary);
      }
    }
  }
}

.filter-bar {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);

  .filter-input {
    flex: 1;
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 12px;
    outline: none;
  }

  .filter-select {
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 12px;
    outline: none;
  }
}

.main-area {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.request-list {
  width: 45%;
  min-width: 300px;
  overflow-y: auto;
  border-right: 1px solid var(--border-color);

  .request-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--border-color);
    &:hover {
      background: var(--bg-hover);
    }
    &.selected {
      background: var(--bg-active);
    }
    &.intercepted {
      background: rgba(255, 200, 0, 0.08);
    }

    .method {
      font-weight: 600;
      font-size: 11px;
      width: 50px;
      flex-shrink: 0;
      &.method-get {
        color: #61affe;
      }
      &.method-post {
        color: #49cc90;
      }
      &.method-put {
        color: #fca130;
      }
      &.method-delete {
        color: #f93e3e;
      }
      &.method-patch {
        color: #50e3c2;
      }
    }

    .status-badge {
      font-size: 11px;
      width: 36px;
      text-align: right;
      flex-shrink: 0;
      &.status-2xx {
        color: #49cc90;
      }
      &.status-3xx {
        color: #fca130;
      }
      &.status-4xx {
        color: #f93e3e;
      }
      &.status-5xx {
        color: #f93e3e;
      }
      &.status-error {
        color: #f93e3e;
      }
    }

    .url {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
    }

    .duration {
      font-size: 11px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .tag {
      font-size: 10px;
      padding: 1px 4px;
      border-radius: 3px;
      flex-shrink: 0;
      &.tag-intercepted {
        background: #ffc107;
        color: #000;
      }
      &.tag-error {
        background: #f93e3e;
        color: #fff;
      }
    }
  }

  .empty {
    padding: 24px;
    text-align: center;
    color: var(--text-secondary);
  }
}

.request-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .detail-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-color);

    button {
      padding: 8px 16px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 12px;
      border-bottom: 2px solid transparent;
      &.active {
        color: var(--accent);
        border-bottom-color: var(--accent);
      }
    }
  }

  .detail-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;

    .overview {
      .overview-row {
        display: flex;
        gap: 8px;
        padding: 4px 0;
        label {
          color: var(--text-secondary);
          width: 60px;
          flex-shrink: 0;
        }
        span {
          word-break: break-all;
        }
        .intercepted-label {
          color: #ffc107;
        }
        .error-label {
          color: #f93e3e;
        }
      }
    }

    .headers-view {
      .header-row {
        display: flex;
        gap: 8px;
        padding: 2px 0;
        .header-key {
          color: var(--accent);
          font-weight: 500;
        }
        .header-value {
          color: var(--text-primary);
          word-break: break-all;
        }
      }
      .empty {
        color: var(--text-secondary);
        padding: 12px 0;
        text-align: center;
      }
    }
  }
}

.detail-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
