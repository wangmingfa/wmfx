<template>
  <PageLayout
    v-model:search="searchQuery"
    :title="`${t('passwords.title')} (${passwords.length})`"
    icon="mdi:form-textbox-password"
    :search-placeholder="t('passwords.searchPlaceholder')"
  >
    <template #actions>
      <button
        class="btn btn-sm btn-primary"
        @click="openAdd"
      >
        {{ t('passwords.add') }}
      </button>
    </template>

    <div
      v-if="passwords.length === 0"
      class="empty"
    >
      <p>{{ searchQuery.trim() ? t('passwords.noResult') : t('passwords.empty') }}</p>
    </div>

    <ul
      v-else
      class="pw-list"
    >
      <li
        v-for="item in passwords"
        :key="item.id"
        class="pw-item"
      >
        <div class="pw-main">
          <div class="pw-domain">
            {{ item.domain }}
            <span
              v-if="item.username"
              class="pw-username"
            >· {{ item.username }}</span>
          </div>
          <div class="pw-pass">
            <span class="pw-pass-text">{{ revealed.has(item.id) ? item.password : '••••••••' }}</span>
            <button
              class="link-btn"
              @click="toggleReveal(item)"
            >
              {{ revealed.has(item.id) ? t('passwords.hide') : t('passwords.reveal') }}
            </button>
          </div>
          <div
            v-if="item.note"
            class="pw-note"
          >
            {{ item.note }}
          </div>
        </div>

        <div class="pw-actions">
          <button
            class="link-btn"
            @click="copyPassword(item)"
          >
            {{ t('passwords.copy') }}
          </button>
          <button
            class="link-btn"
            @click="openEdit(item)"
          >
            {{ t('passwords.edit') }}
          </button>
          <button
            class="link-btn danger"
            @click="remove(item)"
          >
            {{ t('passwords.delete') }}
          </button>
        </div>
      </li>
    </ul>

    <!-- 新增 / 编辑弹窗 -->
    <NModal
      v-model:show="showModal"
      :title="editingId ? t('passwords.edit') : t('passwords.add')"
      preset="card"
      style="width: 440px"
    >
      <div class="form">
        <label class="field">
          <span class="field-label">{{ t('passwords.domain') }}</span>
          <NInput
            v-model:value="form.domain"
            :placeholder="t('passwords.domainPlaceholder')"
          />
        </label>
        <label class="field">
          <span class="field-label">{{ t('passwords.username') }}</span>
          <NInput
            v-model:value="form.username"
            :placeholder="t('passwords.usernamePlaceholder')"
          />
        </label>
        <label class="field">
          <span class="field-label">{{ t('passwords.password') }}</span>
          <NInput
            v-model:value="form.password"
            type="password"
            show-password-toggle
            :placeholder="t('passwords.passwordPlaceholder')"
          />
        </label>
        <label class="field">
          <span class="field-label">{{ t('passwords.note') }}</span>
          <NInput
            v-model:value="form.note"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            :placeholder="t('passwords.notePlaceholder')"
          />
        </label>
      </div>
      <template #footer>
        <div class="modal-footer">
          <button
            class="btn btn-sm"
            @click="showModal = false"
          >
            {{ t('passwords.cancel') }}
          </button>
          <button
            class="btn btn-sm btn-primary"
            :disabled="!canSave"
            @click="save"
          >
            {{ t('passwords.save') }}
          </button>
        </div>
      </template>
    </NModal>
  </PageLayout>
</template>

<script setup lang="ts">
import type { PasswordEntry } from '@browser/ipc-contract'
import { NInput, NModal } from 'naive-ui'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PageLayout from '@/components/PageLayout.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const passwords = ref<PasswordEntry[]>([])
const searchQuery = ref('')
const revealed = ref<Set<string>>(new Set())
const showModal = ref(false)
const editingId = ref<string | null>(null)
const form = ref({ domain: '', username: '', password: '', note: '' })

let searchTimer: ReturnType<typeof setTimeout> | null = null

async function loadAll(): Promise<void> {
  console.debug('[Passwords] loadAll')
  passwords.value = await window.browserAPI.getPasswords()
}

async function debouncedSearch(): Promise<void> {
  if (searchTimer)
    clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    console.debug('[Passwords] search: query', searchQuery.value)
    passwords.value = await window.browserAPI.searchPasswords({ query: searchQuery.value })
  }, 200)
}

watch(searchQuery, debouncedSearch)

const canSave = computed(() => form.value.domain.trim() !== '' && form.value.password !== '')

function openAdd(): void {
  console.debug('[Passwords] openAdd')
  editingId.value = null
  form.value = { domain: '', username: '', password: '', note: '' }
  revealed.value.clear()
  showModal.value = true
}

function openEdit(item: PasswordEntry): void {
  console.debug('[Passwords] openEdit: id', item.id)
  editingId.value = item.id
  form.value = {
    domain: item.domain,
    username: item.username,
    password: item.password,
    note: item.note ?? '',
  }
  showModal.value = true
}

async function save(): Promise<void> {
  console.debug('[Passwords] save: editingId', editingId.value)
  await window.browserAPI.savePassword({
    id: editingId.value ?? undefined,
    domain: form.value.domain.trim(),
    username: form.value.username.trim(),
    password: form.value.password,
    note: form.value.note.trim() || undefined,
  })
  showModal.value = false
  await loadAll()
}

async function remove(item: PasswordEntry): Promise<void> {
  console.debug('[Passwords] remove: id', item.id)
  // eslint-disable-next-line no-alert
  if (!confirm(t('passwords.deleteConfirm', { domain: item.domain })))
    return
  await window.browserAPI.deletePassword(item.id)
  revealed.value.delete(item.id)
  await loadAll()
}

function toggleReveal(item: PasswordEntry): void {
  console.debug('[Passwords] toggleReveal: id', item.id)
  const next = new Set(revealed.value)
  if (next.has(item.id))
    next.delete(item.id)
  else next.add(item.id)
  revealed.value = next
}

async function copyPassword(item: PasswordEntry): Promise<void> {
  console.debug('[Passwords] copyPassword: id', item.id)
  await window.browserAPI.copyText(item.password)
}

function onChanged(): void {
  console.debug('[Passwords] onChanged: reload')
  void loadAll()
}

onMounted(async () => {
  console.debug('[Passwords] onMounted: 加载密码列表')
  await loadAll()
  window.browserAPI.onPasswordsChanged(onChanged)
})

onUnmounted(() => {
  if (searchTimer)
    clearTimeout(searchTimer)
  // onPasswordsChanged 通过 ipcRenderer.on 注册，卸载时无需手动移除（renderer 进程单例 contextBridge 会随视图销毁回收）
})
</script>

<style scoped>
.empty {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  color: var(--text-muted, #888);
  font-size: 15px;
}

.pw-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pw-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  background: var(--bg-secondary, #16213e);
}

.pw-main {
  flex: 1;
  min-width: 0;
}

.pw-domain {
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pw-username {
  font-weight: 400;
  color: var(--text-secondary, #aaa);
}

.pw-pass {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.pw-pass-text {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
}

.pw-note {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pw-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.link-btn {
  background: none;
  border: none;
  color: var(--accent-color, #4361ee);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 0;
}

.link-btn:hover {
  opacity: 0.8;
}

.link-btn.danger {
  color: var(--danger-color, #ff6b8a);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  color: var(--text-secondary, #aaa);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-sm {
  padding: 6px 14px;
  font-size: 13px;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  cursor: pointer;
  background: var(--bg-secondary, #16213e);
  color: var(--text-primary, #e0e0e0);
}

.btn-sm:hover {
  opacity: 0.85;
}

.btn-primary {
  background: var(--accent-color, #4361ee);
  border-color: var(--accent-color, #4361ee);
  color: #fff;
}

.btn-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
