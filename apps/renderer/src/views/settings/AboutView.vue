<template>
  <div class="about-page">
    <!-- 第一行：logo + 应用名称 -->
    <div class="about-header">
      <img
        class="about-logo"
        src="/logo.png"
        alt="logo"
      />
      <span class="about-app-name">WMFX</span>
    </div>

    <!-- 第二行：状态卡片（图标 + 中间信息 + 右侧操作） -->
    <div class="about-status-card">
      <div
        class="about-status-icon"
        :class="iconClass"
      >
        <Icon
          v-if="icon === 'check'"
          icon="mdi:check-circle"
          width="28"
          height="28"
        />
        <Icon
          v-else-if="icon === 'download'"
          icon="mdi:cloud-download"
          width="28"
          height="28"
        />
        <Icon
          v-else
          icon="mdi:loading"
          width="28"
          height="28"
          class="about-spin"
        />
      </div>

      <div class="about-status-main">
        <div class="about-status-title">
          {{ statusTitle }}
        </div>
        <div class="about-status-sub">
          {{ versionText }}
        </div>
      </div>

      <div class="about-status-action">
        <NButton
          v-if="status.state === 'downloaded'"
          type="primary"
          :loading="restarting"
          @click="restart"
        >
          {{ t('about.restartToUpdate') }}
        </NButton>
        <NButton
          v-else
          type="primary"
          :loading="updating"
          @click="checkUpdates"
        >
          {{ updating ? t('about.checking') : t('about.checkForUpdates') }}
        </NButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AppInfo, UpdaterStatus } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { NButton } from 'naive-ui'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const status = ref<UpdaterStatus>({ state: 'idle' })
const updating = ref(false)
const restarting = ref(false)
const appInfo = ref<AppInfo>({ version: '', arch: '', platform: '' })

const versionText = computed(() =>
  appInfo.value.version ? t('about.versionArch', { version: appInfo.value.version, arch: appInfo.value.arch }) : '',
)

// 状态图标：最新/无更新显示勾；检查中/下载中显示转圈；有新版本未下载显示下载
const icon = computed<'check' | 'download' | 'loading'>(() => {
  const s = status.value.state
  if (s === 'checking' || s === 'downloading') {
    return 'loading'
  }
  if (s === 'available') {
    return 'download'
  }
  return 'check'
})

const iconClass = computed(() =>
  icon.value === 'check' ? 'is-check' : icon.value === 'download' ? 'is-download' : 'is-loading',
)

// 中间主标题文案：依据更新状态映射
const statusTitle = computed(() => {
  switch (status.value.state) {
    case 'checking':
      return t('about.checking')
    case 'available':
      return t('about.updateAvailable', { version: status.value.info?.version ?? '?' })
    case 'downloading':
      return t('about.downloading', { percent: String(Math.round(status.value.percent ?? 0)) })
    case 'downloaded':
      return t('about.downloaded')
    case 'error':
      return t('about.updateFailed')
    case 'not-available':
    case 'idle':
    default:
      return t('about.latestVersion')
  }
})

async function checkUpdates(): Promise<void> {
  console.debug('[About] checkUpdates')
  updating.value = true
  try {
    await window.browserAPI.checkForUpdates()
  }
  finally {
    updating.value = false
  }
}

async function restart(): Promise<void> {
  console.debug('[About] restart: 重启并安装更新')
  restarting.value = true
  try {
    await window.browserAPI.restartAndInstall()
  }
  catch {
    console.error('[About] restart 失败')
    restarting.value = false
  }
}

function handleUpdaterStatus(s: UpdaterStatus): void {
  console.debug('[About] handleUpdaterStatus: state', s.state)
  status.value = s
}

onMounted(async () => {
  console.debug('[About] onMounted: 加载应用信息与更新状态')
  try {
    appInfo.value = await window.browserAPI.getAppInfo()
  }
  catch {
    /* 开发期无此 API 时静默降级 */
  }
  status.value = await window.browserAPI.getUpdaterStatus()
  window.browserAPI.onUpdaterStatus(handleUpdaterStatus)
})
</script>

<style scoped>
.about-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.about-header {
  display: flex;
  align-items: center;
  gap: 14px;
}

.about-logo {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  object-fit: contain;
  border: 1px solid var(--border-color);
}

.about-app-name {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
}

.about-status-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.about-status-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;

  &.is-check {
    color: var(--success-color, #18a058);
    background: color-mix(in srgb, var(--success-color, #18a058) 14%, transparent);
  }

  &.is-download {
    color: var(--accent-color);
    background: color-mix(in srgb, var(--accent-color) 14%, transparent);
  }

  &.is-loading {
    color: var(--text-secondary);
  }
}

.about-spin {
  animation: about-spin 1s linear infinite;
}

@keyframes about-spin {
  to {
    transform: rotate(360deg);
  }
}

.about-status-main {
  flex: 1;
  min-width: 0;
}

.about-status-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.about-status-sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.about-status-action {
  flex-shrink: 0;
}
</style>
