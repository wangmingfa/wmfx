/**
 * 云同步设置页（MVP）
 *
 * 布局：
 *   - WebDAV 连接配置（启用开关、主机、路径、账号）
 *   - 同步密码输入（PBKDF2 在 renderer 派生 key 传主进程）
 *   - 操作区：测试连接 / 立即同步 / 从云端恢复
 *   - 状态卡片：连接状态、上次同步时间、最近同步记录
 */

<template>
  <div class="cloud-sync">
    <!-- WebDAV 配置 -->
    <Section :title="t('settings.cloudSync.provider')">
      <SectionItem :label="t('settings.cloudSync.enabled')">
        <NSwitch
          v-model:value="config.enabled"
          @update:value="save"
        />
      </SectionItem>

      <SectionItem :label="t('settings.cloudSync.baseUrl')">
        <NInput
          v-model:value="config.webdav.baseUrl"
          :disabled="!config.enabled"
          placeholder="https://dav.jianguoyun.com/dav/"
          @input="save"
        />
      </SectionItem>

      <SectionItem :label="t('settings.cloudSync.remotePath')">
        <NInput
          v-model:value="config.webdav.remotePath"
          :disabled="!config.enabled"
          placeholder="/.wmfx/"
          @input="save"
        />
      </SectionItem>

      <SectionItem :label="t('settings.cloudSync.username')">
        <NInput
          v-model:value="config.webdav.username"
          :disabled="!config.enabled"
          placeholder="WebDAV 用户名"
          @input="save"
        />
      </SectionItem>

      <SectionItem :label="t('settings.cloudSync.password')">
        <NInput
          v-model:value="config.webdav.password"
          :disabled="!config.enabled"
          placeholder="WebDAV 密码"
          type="password"
          show-password-on="mousedown"
          @input="save"
        />
      </SectionItem>
    </Section>

    <!-- 同步密码 -->
    <Section :title="t('settings.cloudSync.syncPasswordTitle')">
      <SectionBlock>
        <div class="sync-pass-wrap">
          <NInput
            v-model:value="localSyncPassword"
            :disabled="!config.enabled"
            :type="showPass ? 'text' : 'password'"
            :placeholder="t('settings.cloudSync.syncPasswordPlaceholder')"
            show-password-on="mousedown"
            @input="deriveKey"
          />
          <NButton
            class="show-pass-btn"
            tertiary
            size="small"
            @click="showPass = !showPass"
          >
            <Icon :icon="showPass ? 'mdi:eye' : 'mdi:eye-off'" />
          </NButton>
        </div>
        <div class="key-hint">
          {{ derived ? t('settings.cloudSync.keyDerived') : t('settings.cloudSync.keyNotDerived') }}
        </div>
        <div class="sync-pass-note">
          {{ t('settings.cloudSync.syncPasswordNote') }}
        </div>
      </SectionBlock>
    </Section>

    <!-- 操作 -->
    <Section :title="t('settings.cloudSync.actions')">
      <SectionBlock>
        <div class="actions-row">
          <NButton
            type="default"
            :disabled="!config.enabled || !config.webdav.baseUrl"
            :loading="testing"
            @click="onTest"
          >
            <template #icon>
              <Icon icon="mdi:test-tube" />
            </template>
            {{ t('settings.cloudSync.testConnection') }}
          </NButton>

          <NButton
            type="primary"
            :disabled="!config.enabled || !derived || syncing"
            :loading="syncing"
            @click="onSync"
          >
            <template #icon>
              <Icon icon="mdi:upload" />
            </template>
            {{ t('settings.cloudSync.syncNow') }}
          </NButton>

          <NButton
            type="warning"
            :disabled="!config.enabled || !derived || restoring"
            :loading="restoring"
            @click="onRestore"
          >
            <template #icon>
              <Icon icon="mdi:download" />
            </template>
            {{ t('settings.cloudSync.restoreNow') }}
          </NButton>
        </div>
        <NAlert
          v-if="lastMessage"
          :type="lastStatus"
          class="last-msg"
          closable
          @close="lastMessage = ''"
        >
          {{ lastMessage }}
        </NAlert>
      </SectionBlock>
    </Section>

    <!-- 状态 -->
    <Section :title="t('settings.cloudSync.status')">
      <SectionBlock>
        <div class="status-grid">
          <div class="status-item">
            <span class="label">{{ t('settings.cloudSync.connected') }}</span>
            <span
              class="value"
              :class="[connected ? 'ok' : 'err']"
            >
              {{ connected ? t('settings.cloudSync.yes') : t('settings.cloudSync.no') }}
            </span>
          </div>
          <div class="status-item">
            <span class="label">{{ t('settings.cloudSync.lastSyncAt') }}</span>
            <span class="value">{{ lastSyncText }}</span>
          </div>
          <div class="status-item">
            <span class="label">{{ t('settings.cloudSync.lastSyncSize') }}</span>
            <span class="value">{{ lastSyncSizeText }}</span>
          </div>
          <div class="status-item">
            <span class="label">{{ t('settings.cloudSync.lastSyncMessage') }}</span>
            <span class="value">{{ config.lastSyncMessage || '—' }}</span>
          </div>
        </div>
      </SectionBlock>
    </Section>

    <!-- 最近记录 -->
    <Section
      v-if="records.length > 0"
      :title="t('settings.cloudSync.recentRecords')"
    >
      <SectionBlock>
        <div class="records">
          <div
            v-for="r in records"
            :key="r.timestamp"
            class="record-row"
          >
            <span
              class="record-status"
              :class="[r.ok ? 'ok' : 'err']"
            >
              {{ r.ok ? '✓' : '✗' }}
            </span>
            <span class="record-action">{{ actionText(r.action) }}</span>
            <span class="record-msg">{{ r.message }}</span>
            <span class="record-when">{{ formatTime(r.timestamp) }}</span>
          </div>
        </div>
      </SectionBlock>
    </Section>

    <!-- 占位说明 -->
    <NAlert
      type="info"
      class="placeholder-note"
      :title="t('settings.cloudSync.placeholderTitle')"
    >
      <ul>
        <li>{{ t('settings.cloudSync.placeholder1') }}</li>
        <li>{{ t('settings.cloudSync.placeholder2') }}</li>
        <li>{{ t('settings.cloudSync.placeholder3') }}</li>
      </ul>
    </NAlert>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue/dist/offline'
import { NAlert, NButton, NInput, NSwitch } from 'naive-ui'
import { computed, onMounted, ref } from 'vue'
import Section from '@/components/Section.vue'
import SectionBlock from '@/components/SectionBlock.vue'
import SectionItem from '@/components/SectionItem.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const config = ref<{
  enabled: boolean
  type: 'webdav'
  webdav: { baseUrl: string, username: string, password: string, remotePath: string }
  pbkdf2Salt?: string
  lastSyncAt?: number
  lastSyncSize?: number
  lastSyncMessage?: string
}>({
  enabled: false,
  type: 'webdav',
  webdav: { baseUrl: '', username: '', password: '', remotePath: '/.wmfx/' },
})

/** 生成 16 字节随机 PBKDF2 salt（base64），避免固定 salt 使所有用户派生同一密钥 */
function generatePbkdf2Salt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

/** 获取当前 salt：配置已持久化则复用，否则生成并保存（首次同步时落盘） */
function getOrCreateSalt(): string {
  if (config.value.pbkdf2Salt) {
    return config.value.pbkdf2Salt
  }
  const salt = generatePbkdf2Salt()
  config.value.pbkdf2Salt = salt
  save()
  return salt
}

const connected = ref(false)
const records = ref<Array<{ timestamp: number, action: 'upload' | 'download' | 'test', ok: boolean, message: string, bytes?: number }>>([])

const localSyncPassword = ref('')
const showPass = ref(false)
const derived = ref(false)
const keyRef = ref<number[]>([])

const testing = ref(false)
const syncing = ref(false)
const restoring = ref(false)
const lastStatus = ref<'success' | 'error' | 'warning'>('warning')
const lastMessage = ref('')

const lastSyncText = computed(() => {
  if (!config.value.lastSyncAt) {
    return '—'
  }
  return new Date(config.value.lastSyncAt).toLocaleString()
})

const lastSyncSizeText = computed(() => {
  if (!config.value.lastSyncSize) {
    return '—'
  }
  const bytes = config.value.lastSyncSize
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
})

function save() {
  void window.browserAPI.cloudSync.setConfig(JSON.parse(JSON.stringify(config.value)))
}

async function loadState() {
  const cfg = await window.browserAPI.cloudSync.getConfig()
  Object.assign(config.value, cfg)
  const state = await window.browserAPI.cloudSync.syncState()
  connected.value = state.connected
  records.value = (state.config.recentRecords ?? []) as { timestamp: number, action: 'upload' | 'download' | 'test', ok: boolean, message: string, bytes?: number }[]
}

async function deriveKey() {
  const pw = localSyncPassword.value
  if (!pw) {
    derived.value = false
    return
  }
  try {
    const enc = new TextEncoder()
    const saltB64 = getOrCreateSalt()
    // base64 → bytes 作为 PBKDF2 salt（持久化在 CloudSyncConfig，与其它实例/用户区分）
    const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0))
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
    const exported = await crypto.subtle.exportKey('raw', key)
    keyRef.value = Array.from(new Uint8Array(exported))
    derived.value = true
  } catch {
    derived.value = false
  }
}

async function onTest() {
  testing.value = true
  lastStatus.value = 'warning'
  lastMessage.value = ''
  try {
    const result = await window.browserAPI.cloudSync.testConnection()
    if (result.ok) {
      connected.value = true
      lastStatus.value = 'success'
      lastMessage.value = t('settings.cloudSync.testSuccess', { host: config.value.webdav.baseUrl })
    } else {
      connected.value = false
      lastStatus.value = 'error'
      lastMessage.value = t('settings.cloudSync.testFailed', { msg: result.message })
    }
    await loadState()
  } catch (e) {
    connected.value = false
    lastStatus.value = 'error'
    lastMessage.value = String(e)
  } finally {
    testing.value = false
  }
}

async function onSync() {
  syncing.value = true
  lastStatus.value = 'warning'
  lastMessage.value = ''
  try {
    const result = await window.browserAPI.cloudSync.performSync({ key: keyRef.value })
    if (result.ok) {
      lastStatus.value = 'success'
      lastMessage.value = t('settings.cloudSync.syncSuccess', { bytes: result.bytes ?? 0 })
      config.value.lastSyncAt = Date.now()
      config.value.lastSyncSize = result.bytes
      config.value.lastSyncMessage = '成功'
      void window.browserAPI.cloudSync.setConfig(JSON.parse(JSON.stringify(config.value)))
    } else {
      lastStatus.value = 'error'
      lastMessage.value = t('settings.cloudSync.syncFailed', { msg: result.message })
    }
    await loadState()
  } catch (e) {
    lastStatus.value = 'error'
    lastMessage.value = String(e)
  } finally {
    syncing.value = false
  }
}

async function onRestore() {
  restoring.value = true
  lastStatus.value = 'warning'
  lastMessage.value = ''
  try {
    const result = await window.browserAPI.cloudSync.performRestore({ key: keyRef.value })
    if (result.ok) {
      lastStatus.value = 'success'
      lastMessage.value = t('settings.cloudSync.restoreSuccess')
    } else {
      lastStatus.value = 'error'
      lastMessage.value = t('settings.cloudSync.restoreFailed', { msg: result.message })
    }
    await loadState()
  } catch (e) {
    lastStatus.value = 'error'
    lastMessage.value = String(e)
  } finally {
    restoring.value = false
  }
}

function actionText(a: string): string {
  const map: Record<string, string> = {
    upload: t('settings.cloudSync.actionUpload'),
    download: t('settings.cloudSync.actionDownload'),
    test: t('settings.cloudSync.actionTest'),
  }
  return map[a] || a
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}

onMounted(loadState)
</script>

<style lang="less" scoped>
.cloud-sync {
  display: flex;
  flex-direction: column;
  gap: 20px;
  font-family: var(--font-sans);
}

.sync-pass-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sync-pass-wrap .n-input { flex: 1 }

.show-pass-btn {
  min-width: 32px;
  height: 32px;
}

.key-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
  grid-column: 1 / -1;
}

.sync-pass-note {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 12px;
  line-height: 1.6;
}

.actions-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.last-msg {
  margin-top: 12px;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 32px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 12px;
}
.status-item .label {
  min-width: 88px;
  font-size: 13px;
  color: var(--text-muted);
}
.status-item .value {
  font-size: 14px;
}
.status-item .value.ok { color: #52c41a }
.status-item .value.err { color: #ff4d4f }

.records {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.record-row {
  display: grid;
  grid-template-columns: 16px 60px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 4px 0;
  font-size: 13px;
  border-bottom: 1px solid var(--border-color, #333);
}
.record-status { font-weight: bold }
.record-status.ok { color: #52c41a }
.record-status.err { color: #ff4d4f }
.record-action { color: var(--text-muted) }
.record-when { color: var(--text-muted); font-size: 12px }

.placeholder-note {
  margin-top: 4px;
}
.placeholder-note ul {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
}
</style>
