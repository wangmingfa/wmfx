<template>
  <div class="interceptor-page">
    <div class="header">
      <h1>请求拦截器</h1>
      <div class="header-actions">
        <span class="status">{{ statusText }} · {{ rules.length }} 条规则</span>
        <NButton
          size="small"
          :type="capturing ? 'error' : 'primary'"
          @click="toggleCapture"
        >
          {{ capturing ? '停止捕获' : '开始捕获' }}
        </NButton>
        <NButton
          size="small"
          @click="showRuleDialog = true"
        >
          规则管理
        </NButton>
        <NButton
          size="small"
          @click="clearLog"
        >
          清空
        </NButton>
      </div>
    </div>

    <div class="filter-bar">
      <NInput
        v-model:value="filterText"
        size="small"
        placeholder="过滤 URL..."
        clearable
      />
      <NSelect
        v-model:value="filterMethod"
        size="small"
        :options="methodOptions"
        placeholder="全部方法"
        clearable
      />
      <NSelect
        v-model:value="filterStatus"
        size="small"
        :options="statusOptions"
        placeholder="全部状态"
        clearable
      />
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
          <span
            class="method"
            :class="methodClass(req.method)"
          >{{ req.method }}</span>
          <span
            class="status-badge"
            :class="statusClass(req.statusCode)"
          >{{ req.statusCode || '—' }}</span>
          <span
            class="url"
            :title="req.url"
          >{{ shortenUrl(req.url) }}</span>
          <span class="duration">{{ req.duration }}ms</span>
          <span
            v-if="req.intercepted"
            class="tag tag-intercepted"
          >{{ req.ruleName || '拦截' }}</span>
          <span
            v-if="req.error"
            class="tag tag-error"
          >错误</span>
        </div>
        <div
          v-if="filteredRequests.length === 0"
          class="empty"
        >
          暂无请求
        </div>
      </div>

      <div
        v-if="selectedRequest"
        class="request-detail"
      >
        <div class="detail-tabs">
          <NButton
            size="small"
            text
            :type="detailTab === 'headers' ? 'primary' : 'default'"
            @click="detailTab = 'headers'"
          >
            请求头
          </NButton>
          <NButton
            size="small"
            text
            :type="detailTab === 'response' ? 'primary' : 'default'"
            @click="detailTab = 'response'"
          >
            响应头
          </NButton>
          <NButton
            size="small"
            text
            :type="detailTab === 'overview' ? 'primary' : 'default'"
            @click="detailTab = 'overview'"
          >
            概览
          </NButton>
        </div>
        <div class="detail-content">
          <div
            v-if="detailTab === 'overview'"
            class="overview"
          >
            <div class="overview-row">
              <label>URL</label><span>{{ selectedRequest.url }}</span>
            </div>
            <div class="overview-row">
              <label>方法</label><span>{{ selectedRequest.method }}</span>
            </div>
            <div class="overview-row">
              <label>状态码</label><span>{{ selectedRequest.statusCode }}</span>
            </div>
            <div class="overview-row">
              <label>类型</label><span>{{ selectedRequest.type }}</span>
            </div>
            <div class="overview-row">
              <label>耗时</label><span>{{ selectedRequest.duration }}ms</span>
            </div>
            <div
              v-if="selectedRequest.intercepted"
              class="overview-row"
            >
              <label>拦截</label><span class="intercepted-label">{{ selectedRequest.ruleName }}</span>
            </div>
            <div
              v-if="selectedRequest.error"
              class="overview-row"
            >
              <label>错误</label><span class="error-label">{{ selectedRequest.error }}</span>
            </div>
          </div>
          <div
            v-if="detailTab === 'headers'"
            class="headers-view"
          >
            <div
              v-for="(v, k) in selectedRequest.requestHeaders"
              :key="k"
              class="header-row"
            >
              <span class="header-key">{{ k }}:</span>
              <span class="header-value">{{ v }}</span>
            </div>
            <div
              v-if="Object.keys(selectedRequest.requestHeaders).length === 0"
              class="empty"
            >
              暂无请求头
            </div>
          </div>
          <div
            v-if="detailTab === 'response'"
            class="headers-view"
          >
            <div
              v-for="(v, k) in selectedRequest.responseHeaders"
              :key="k"
              class="header-row"
            >
              <span class="header-key">{{ k }}:</span>
              <span class="header-value">{{ v }}</span>
            </div>
            <div
              v-if="Object.keys(selectedRequest.responseHeaders).length === 0"
              class="empty"
            >
              暂无响应头
            </div>
          </div>
        </div>
      </div>
      <div
        v-else
        class="detail-placeholder"
      >
        选择一个请求查看详情
      </div>
    </div>

    <!-- 规则管理弹窗 -->
    <NModal
      v-model:show="showRuleDialog"
      preset="card"
      title="规则管理"
      style="width: 480px; max-width: 92vw"
      :auto-focus="false"
      @close="showRuleDialog = false"
    >
      <div class="rule-list">
        <div
          v-for="rule in rules"
          :key="rule.id"
          class="rule-item"
        >
          <div class="rule-info">
            <span class="rule-name">{{ rule.name }}</span>
            <span
              class="rule-action"
              :class="`action-${rule.action}`"
            >{{ actionLabel(rule.action) }}</span>
            <span class="rule-pattern">{{ rule.urlPattern }}</span>
          </div>
          <div class="rule-actions">
            <NSwitch
              :value="rule.enabled"
              @update:value="toggleRule(rule.id)"
            />
            <NButton
              size="small"
              tertiary
              @click="editRule(rule)"
            >
              编辑
            </NButton>
            <NButton
              size="small"
              tertiary
              type="error"
              @click="deleteRule(rule.id)"
            >
              删除
            </NButton>
          </div>
        </div>
        <div
          v-if="rules.length === 0"
          class="empty"
        >
          暂无规则，点击下方按钮添加
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <NButton
            type="primary"
            @click="openNewRule"
          >
            + 新增规则
          </NButton>
        </div>
      </template>
    </NModal>

    <!-- 规则编辑弹窗 -->
    <NModal
      :show="showEditModal"
      preset="card"
      :title="isNewRule ? '新增规则' : '编辑规则'"
      style="width: 640px; max-width: 92vw"
      :auto-focus="false"
      @close="cancelEdit"
    >
      <div class="form-group">
        <label>规则名称</label>
        <NInput
          v-model:value="editForm.name"
          placeholder="如：屏蔽广告 API"
        />
      </div>
      <div class="form-group">
        <label>URL 模式 (glob)</label>
        <NInput
          v-model:value="editForm.urlPattern"
          placeholder="如：*.example.com/api/*"
        />
      </div>
      <div class="form-row">
        <div class="form-group flex-1">
          <label>方法</label>
          <div class="checkbox-group">
            <NCheckbox
              v-for="m in methodOptions"
              :key="m.value"
              :checked="editForm.methods.includes(m.value)"
              @update:checked="toggleMethod(m.value as HttpMethod)"
            >
              {{ m.label }}
            </NCheckbox>
          </div>
        </div>
        <div class="form-group flex-1">
          <label>资源类型</label>
          <div class="checkbox-group">
            <NCheckbox
              v-for="t in resourceTypeOptions"
              :key="t.value"
              :checked="editForm.resourceTypes.includes(t.value)"
              @update:checked="toggleResourceType(t.value)"
            >
              {{ t.label }}
            </NCheckbox>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label>动作</label>
        <NSelect
          v-model:value="editForm.action"
          :options="actionOptions"
        />
      </div>
      <div
        v-if="editForm.action === 'redirect'"
        class="form-group"
      >
        <label>目标 URL</label>
        <NInput
          v-model:value="editForm.targetUrl"
          placeholder="https://..."
        />
      </div>
      <div
        v-if="editForm.action === 'mock'"
        class="mock-form"
      >
        <div class="form-row">
          <div
            class="form-group"
            style="width: 120px"
          >
            <label>状态码</label>
            <NInputNumber
              v-model:value="editForm.mockStatusCode"
              placeholder="200"
            />
          </div>
        </div>
        <div class="form-group">
          <label>响应头 (每行一个 Key: Value)</label>
          <NInput
            v-model:value="mockHeadersText"
            type="textarea"
            :rows="3"
            placeholder="Content-Type: application/json&#10;Access-Control-Allow-Origin: *"
          />
        </div>
        <div class="form-group">
          <label>响应体</label>
          <NInput
            v-model:value="editForm.mockBody"
            type="textarea"
            :rows="6"
            placeholder="JSON body example"
            :status="isJsonValid ? undefined : 'error'"
          />
          <div class="mock-hint">
            <span>JSON {{ isJsonValid ? '✓' : '✗' }}</span>
            <span>{{ editForm.mockBody?.length || 0 }} 字符</span>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <NButton @click="cancelEdit">
            取消
          </NButton>
          <NButton
            type="primary"
            @click="saveRule"
          >
            保存
          </NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<script setup lang="ts">
import type { CapturedRequest, InterceptorRule } from '@browser/ipc-contract'
import {
  NButton,
  NCheckbox,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSwitch,
} from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const capturing = ref(false)
const requests = ref<CapturedRequest[]>([])
const selectedId = ref<string | null>(null)
const filterText = ref('')
const filterMethod = ref<string | null>(null)
const filterStatus = ref<string | null>(null)
const detailTab = ref<'overview' | 'headers' | 'response'>('overview')
const rules = ref<InterceptorRule[]>([])
const showRuleDialog = ref(false)
const editingRule = ref<InterceptorRule | null>(null)
const showEditModal = computed(() => editingRule.value !== null)
const isNewRule = ref(false)
const editForm = ref<InterceptorRule>(createEmptyRule())
const mockHeadersText = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null

const methodOptions = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'DELETE', value: 'DELETE' },
  { label: 'PATCH', value: 'PATCH' },
]

const statusOptions = [
  { label: '2xx', value: '2xx' },
  { label: '3xx', value: '3xx' },
  { label: '4xx', value: '4xx' },
  { label: '5xx', value: '5xx' },
  { label: '错误', value: 'error' },
]

const resourceTypeOptions = [
  { label: '页面', value: 'mainFrame' },
  { label: '子框架', value: 'subFrame' },
  { label: '脚本', value: 'script' },
  { label: 'XHR', value: 'xhr' },
  { label: 'Fetch', value: 'fetch' },
  { label: '图片', value: 'image' },
  { label: '媒体', value: 'media' },
  { label: '样式', value: 'stylesheet' },
  { label: '字体', value: 'font' },
  { label: '其他', value: 'other' },
] as const

const actionOptions = [
  { label: 'Block — 拦截请求', value: 'block' },
  { label: 'Redirect — 重定向', value: 'redirect' },
  { label: 'Mock — 自定义响应', value: 'mock' },
]

const statusText = computed(() => `已捕获 ${requests.value.length} 条请求`)

const selectedRequest = computed(() => requests.value.find(r => r.id === selectedId.value) ?? null)

const isJsonValid = computed(() => {
  if (!editForm.value.mockBody) {
    return true
  }
  try {
    JSON.parse(editForm.value.mockBody)
    return true
  } catch {
    return false
  }
})

const filteredRequests = computed(() => {
  let list = requests.value
  if (filterText.value) {
    const q = filterText.value.toLowerCase()
    list = list.filter(r => r.url.toLowerCase().includes(q))
  }
  if (filterMethod.value) {
    list = list.filter(r => r.method === filterMethod.value)
  }
  if (filterStatus.value) {
    if (filterStatus.value === 'error') {
      list = list.filter(r => r.error || r.statusCode >= 400)
    } else {
      const prefix = filterStatus.value[0]
      list = list.filter(r => String(r.statusCode).startsWith(prefix))
    }
  }
  return list
})

function createEmptyRule(): InterceptorRule {
  return {
    id: '',
    name: '',
    enabled: true,
    action: 'block',
    urlPattern: '',
    methods: [],
    resourceTypes: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function actionLabel(a: string): string {
  return { block: '拦截', redirect: '重定向', mock: 'Mock' }[a] ?? a
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
type ResourceType = 'mainFrame' | 'subFrame' | 'script' | 'xhr' | 'fetch' | 'image' | 'media' | 'stylesheet' | 'font' | 'other'

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
  if (code === 0) {
    return 'status-error'
  }
  return `status-${String(code)[0]}xx`
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
  await window.browserAPI.interceptorSetEnabled?.(capturing.value)
  if (capturing.value) {
    startPolling()
  } else {
    stopPolling()
  }
}

async function clearLog(): Promise<void> {
  requests.value = []
  await window.browserAPI.interceptorClearLog?.()
}

async function fetchCaptured(): Promise<void> {
  const list = await window.browserAPI.interceptorGetCaptured?.({ limit: 500 })
  if (list) {
    requests.value = list
  }
}

async function fetchRules(): Promise<void> {
  const list = await window.browserAPI.interceptorGetRules?.()
  if (list) {
    rules.value = list
  }
}

function toggleRule(ruleId: string): void {
  const rule = rules.value.find(r => r.id === ruleId)
  if (rule) {
    rule.enabled = !rule.enabled
    window.browserAPI.interceptorUpdateRule?.(rule)
  }
}

async function deleteRule(ruleId: string): Promise<void> {
  rules.value = rules.value.filter(r => r.id !== ruleId)
  await window.browserAPI.interceptorDeleteRule?.(ruleId)
}

function openNewRule(): void {
  isNewRule.value = true
  editForm.value = createEmptyRule()
  mockHeadersText.value = ''
  editingRule.value = editForm.value
}

function editRule(rule: InterceptorRule): void {
  isNewRule.value = false
  editForm.value = { ...rule }
  mockHeadersText.value = rule.mockHeaders
    ? Object.entries(rule.mockHeaders)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : ''
  editingRule.value = rule
}

function cancelEdit(): void {
  editingRule.value = null
}

function toggleMethod(m: HttpMethod): void {
  const idx = editForm.value.methods.indexOf(m)
  if (idx >= 0) {
    editForm.value.methods.splice(idx, 1)
  } else {
    editForm.value.methods.push(m)
  }
}

function toggleResourceType(t: ResourceType): void {
  const idx = editForm.value.resourceTypes.indexOf(t)
  if (idx >= 0) {
    editForm.value.resourceTypes.splice(idx, 1)
  } else {
    editForm.value.resourceTypes.push(t)
  }
}

async function saveRule(): Promise<void> {
  const now = Date.now()
  if (editForm.value.action === 'mock') {
    const headers: Record<string, string> = {}
    for (const line of mockHeadersText.value.split('\n')) {
      const idx = line.indexOf(':')
      if (idx > 0) {
        headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
      }
    }
    editForm.value.mockHeaders = headers
  }
  if (isNewRule.value) {
    editForm.value.id = `rule-${now}-${Math.random().toString(36).slice(2, 6)}`
    editForm.value.createdAt = now
    editForm.value.updatedAt = now
    rules.value.push({ ...editForm.value })
    await window.browserAPI.interceptorAddRule?.(editForm.value)
  } else {
    editForm.value.updatedAt = now
    const idx = rules.value.findIndex(r => r.id === editForm.value.id)
    if (idx >= 0) {
      rules.value[idx] = { ...editForm.value }
      await window.browserAPI.interceptorUpdateRule?.(editForm.value)
    }
  }
  editingRule.value = null
}

function startPolling(): void {
  if (pollTimer) {
    return
  }
  pollTimer = setInterval(fetchCaptured, 1000)
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(async () => {
  const status = await window.browserAPI.interceptorGetStatus?.()
  if (status) {
    capturing.value = status.enabled
  }
  if (capturing.value) {
    startPolling()
  }
  await fetchCaptured()
  await fetchRules()
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
  h1 { font-size: 16px; font-weight: 600; margin: 0; }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    .status { color: var(--text-secondary); font-size: 12px; }
  }
}

.filter-bar {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  :deep(.n-input),
  :deep(.n-select) { flex: 1; }
  :deep(.n-select) { max-width: 160px; }
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
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; cursor: pointer;
    border-bottom: 1px solid var(--border-color);
    &:hover { background: var(--bg-hover); }
    &.selected { background: var(--bg-active); }
    &.intercepted { background: rgba(255, 200, 0, 0.08); }
    .method { font-weight: 600; font-size: 11px; width: 50px; flex-shrink: 0; }
    .method.method-get { color: #61affe; }
    .method.method-post { color: #49cc90; }
    .method.method-put { color: #fca130; }
    .method.method-delete { color: #f93e3e; }
    .method.method-patch { color: #50e3c2; }
    .status-badge { font-size: 11px; width: 36px; text-align: right; flex-shrink: 0; }
    .status-badge.status-2xx { color: #49cc90; }
    .status-badge.status-3xx { color: #fca130; }
    .status-badge.status-4xx { color: #f93e3e; }
    .status-badge.status-5xx { color: #f93e3e; }
    .status-badge.status-error { color: #f93e3e; }
    .url { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
    .duration { font-size: 11px; color: var(--text-secondary); flex-shrink: 0; }
    .tag { font-size: 10px; padding: 1px 4px; border-radius: 3px; flex-shrink: 0; }
    .tag.tag-intercepted { background: #ffc107; color: #000; }
    .tag.tag-error { background: #f93e3e; color: #fff; }
  }
  .empty { padding: 24px; text-align: center; color: var(--text-secondary); }
}

.request-detail {
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
  .detail-tabs { display: flex; align-items: center; gap: 4px; padding: 8px 16px; border-bottom: 1px solid var(--border-color); }
  .detail-content { flex: 1; overflow-y: auto; padding: 12px 16px; }
}

.detail-placeholder {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: var(--text-secondary); font-size: 14px;
}

// Dialog
.rule-list {
  .rule-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; border-radius: 6px; margin-bottom: 4px;
    &:hover { background: var(--bg-hover); }
    .rule-info { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
    .rule-name { font-weight: 500; font-size: 13px; }
    .rule-action { font-size: 10px; padding: 1px 6px; border-radius: 3px; flex-shrink: 0; color: #fff; }
    .rule-action.action-block { background: #f93e3e; }
    .rule-action.action-redirect { background: #fca130; }
    .rule-action.action-mock { background: #49cc90; }
    .rule-pattern { font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rule-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  }
}

.dialog-footer { display: flex; justify-content: flex-end; gap: 8px; }

// Form
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
.form-row { display: flex; gap: 12px; }
.flex-1 { flex: 1; }
.checkbox-group { display: flex; flex-wrap: wrap; gap: 4px; }
.mock-hint { display: flex; gap: 12px; margin-top: 4px; font-size: 11px; color: var(--text-secondary); }
</style>
