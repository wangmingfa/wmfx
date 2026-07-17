# 清除浏览数据 UI 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供一个设置页 + 三点菜单共用的「清除浏览数据」弹窗，按用户选择的 Web 存储类型与时间范围，清除所有 Electron session 分区的存储数据。

**Architecture:** 主进程新增 `PrivacyManager`（封装 `session.getAllSessions()` + `clearStorageData`），通过单个 IPC `privacy:clearData` 暴露；渲染进程新增 `ClearDataDialog.vue`（NModal）作为唯一交互载体，被设置页按钮与 AppMenu 菜单项复用。

**Tech Stack:** Electron `session.clearStorageData`、TypeScript、Vue 3 (`<script setup>`)、Naive UI (`NModal`/`NSwitch`/`NSelect`/`NButton`)、Vitest、Playwright。

## Global Constraints

- 日志规范：主进程用 `console.debug`/`console.info`，**不使用 `%s` 占位符，统一用模板字符串插值**；关键 IPC handler 用 `console.info`；格式 `[模块] 方法: 描述含关键参数`。
- 包管理器用 `bun`，依赖用 `bun add`；lint 用 `bun run lint`。
- 渲染层按需引入 Naive UI 组件，不整包引入、不二次封装简单组件。
- 多语言：新增 i18n key 必须在 `packages/shared/src/i18n/messages.ts` 的 `zh-CN` 与 `en` 两处都填。
- TypeScript 严格：所有新增接口/方法需带类型，无 `any`（除非既有代码如此）。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `apps/main/src/privacy-manager.ts` | 新增。`PrivacyManager`：类型→storage 映射 + 遍历所有 session 清除。 |
| `apps/main/src/privacy-manager.test.ts` | 新增。Vitest 单元测试（mock session）。 |
| `packages/ipc-contract/src/channels.ts` | 修改。新增 `privacy:clearData` channel 类型与列表项。 |
| `apps/main/src/ipc/register.ts` | 修改。注册 `privacy:clearData` handler。 |
| `apps/main/src/window-manager.ts` | 修改。`BrowserWindowInstance` 增加 `privacyManager` 并实例化。 |
| `apps/main/src/preload.ts` | 修改。暴露 `clearPrivacyData`。 |
| `apps/renderer/src/env.d.ts` | 修改。`Window['browserAPI']` 增加 `clearPrivacyData`。 |
| `apps/renderer/src/components/ClearDataDialog.vue` | 新增。核心弹窗（NModal）。 |
| `apps/renderer/src/views/settings/PrivacyView.vue` | 新增。设置页按钮触发弹窗。 |
| `apps/renderer/src/components/AppMenuButton.vue` | 修改。三点菜单新增「清空缓存」项。 |
| `apps/renderer/src/router.ts` | 修改。新增 `/settings/privacy` 路由。 |
| `apps/renderer/src/views/settings/SettingsView.vue` | 修改。`pages` 增加 `privacy`。 |
| `apps/renderer/src/views/settings/settingsMenu.ts` | 修改。新增隐私菜单项。 |
| `packages/shared/src/i18n/messages.ts` | 修改。新增 `settings` 与 `appMenu` 相关 key。 |
| E2E spec | 新增清除数据测试。 |

---

### Task 1: PrivacyManager（主进程核心逻辑）

**Files:**
- Create: `apps/main/src/privacy-manager.ts`
- Test: `apps/main/src/privacy-manager.test.ts`

**Interfaces:**
- Produces:
  - `export type ClearDataType = 'cookies' | 'cache' | 'localStorage' | 'formData'`
  - `export interface ClearDataOptions { types: ClearDataType[]; since?: number }`
  - `export class PrivacyManager { async clear(opts: ClearDataOptions): Promise<void> }`

- [ ] **Step1: 写失败测试**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrivacyManager } from './privacy-manager'
import { session } from 'electron'

describe('PrivacyManager.clear', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('对每个 session 调用 clearStorageData 且映射 cookies', async () => {
    const s1 = { clearStorageData: vi.fn().mockResolvedValue(undefined) }
    const s2 = { clearStorageData: vi.fn().mockResolvedValue(undefined) }
    vi.spyOn(session, 'getAllSessions').mockReturnValue([s1, s2] as never)
    const mgr = new PrivacyManager()
    await mgr.clear({ types: ['cookies'], since: 0 })
    expect(s1.clearStorageData).toHaveBeenCalledWith({ storages: ['cookies'], since: 0 })
    expect(s2.clearStorageData).toHaveBeenCalledWith({ storages: ['cookies'], since: 0 })
  })

  it('cache 映射 cachestorage + shadercache', async () => {
    const s1 = { clearStorageData: vi.fn().mockResolvedValue(undefined) }
    vi.spyOn(session, 'getAllSessions').mockReturnValue([s1] as never)
    await new PrivacyManager().clear({ types: ['cache'], since: 0 })
    expect(s1.clearStorageData).toHaveBeenCalledWith({
      storages: ['cachestorage', 'shadercache'],
      since: 0,
    })
  })

  it('localStorage 与 formData 映射正确', async () => {
    const s1 = { clearStorageData: vi.fn().mockResolvedValue(undefined) }
    vi.spyOn(session, 'getAllSessions').mockReturnValue([s1] as never)
    await new PrivacyManager().clear({ types: ['localStorage', 'formData'], since: 100 })
    expect(s1.clearStorageData).toHaveBeenCalledWith({
      storages: ['localstorage', 'indexeddb'],
      since: 100,
    })
  })

  it('since 缺省为 0（全部）', async () => {
    const s1 = { clearStorageData: vi.fn().mockResolvedValue(undefined) }
    vi.spyOn(session, 'getAllSessions').mockReturnValue([s1] as never)
    await new PrivacyManager().clear({ types: ['cookies'] })
    expect(s1.clearStorageData).toHaveBeenCalledWith({ storages: ['cookies'], since: 0 })
  })
})
```

- [ ] **Step2: 运行测试确认失败**

Run: `bun run --filter @wmfx/main vitest run privacy-manager`
Expected: FAIL（`Cannot find module './privacy-manager'`）

- [ ] **Step3: 写最小实现**

```ts
/**
 * 隐私管理器 — 封装 Electron session.clearStorageData
 * 遍历所有 session 分区（default / incognito / 各 persist:*），
 * 按用户选择的数据类型与时间窗口清除 Web 存储。
 *
 * 注意：Electron 没有独立的「表单自动填充」storage 类型，
 * 表单数据实际持久化在 IndexedDB / localStorage，故 formData 以 indexeddb 近似覆盖。
 */
import { type Session, session } from 'electron'

export type ClearDataType = 'cookies' | 'cache' | 'localStorage' | 'formData'

export interface ClearDataOptions {
  types: ClearDataType[]
  since?: number
}

const STORAGE_MAP: Record<ClearDataType, string[]> = {
  cookies: ['cookies'],
  cache: ['cachestorage', 'shadercache'],
  localStorage: ['localstorage'],
  formData: ['indexeddb'],
}

export class PrivacyManager {
  async clear(opts: ClearDataOptions): Promise<void> {
    const storages = Array.from(
      new Set(opts.types.flatMap((t) => STORAGE_MAP[t] ?? []))
    )
    const since = opts.since ?? 0
    const sessions = session.getAllSessions()
    console.info(
      `[PrivacyManager] clear: sessions=${sessions.length} storages=${JSON.stringify(storages)} since=${since}`
    )
    for (const sess of sessions as Session[]) {
      await sess.clearStorageData({ storages, since })
    }
    console.info(`[PrivacyManager] clear: done`)
  }
}
```

- [ ] **Step4: 运行测试确认通过**

Run: `bun run --filter @wmfx/main vitest run privacy-manager`
Expected: PASS（4 个用例全过）

- [ ] **Step5: 提交**

```bash
git add apps/main/src/privacy-manager.ts apps/main/src/privacy-manager.test.ts
git commit -m "feat: 新增 PrivacyManager 清除所有 session Web 存储"
```

---

### Task 2: IPC channel 与 handler 注册

**Files:**
- Modify: `packages/ipc-contract/src/channels.ts`
- Modify: `apps/main/src/ipc/register.ts`
- Modify: `apps/main/src/window-manager.ts`

**Interfaces:**
- Consumes: `PrivacyManager`（Task 1 产出）
- Produces:
  - channel 名 `privacy:clearData`，invoke 签名 `(opts: { types: ('cookies'|'cache'|'localStorage'|'formData')[]; since?: number }) => void`
  - `BrowserWindowInstance` 增加字段 `privacyManager: PrivacyManager`

- [ ] **Step1: 在 channels.ts 的 IpcChannels 接口新增 channel**

在 `history:clear` 附近（约 392 行）加入：

```ts
  'privacy:clearData': (opts: {
    types: ('cookies' | 'cache' | 'localStorage' | 'formData')[]
    since?: number
  }) => void
```

在文件末尾的 `ipcChannelList` 数组（约 536 行起的字符串列表）加入：

```ts
  'privacy:clearData',
```

- [ ] **Step2: 在 window-manager.ts 实例化并挂到实例**

在 `import { HistoryManager } from './history-manager'` 后新增：

```ts
import { PrivacyManager } from './privacy-manager'
```

在 `const historyManager = new HistoryManager(historyRepo)` 后新增：

```ts
const privacyManager = new PrivacyManager()
```

在 `return { ... }` 对象（约 167 行）中 `historyManager,` 之后加入：

```ts
    privacyManager,
```

并在 `BrowserWindowInstance` 接口（约 30 行）`historyManager: HistoryManager` 后加入：

```ts
  privacyManager: PrivacyManager
```

- [ ] **Step3: 在 register.ts 注册 handler**

在 `handle('history:clear', ...)` 块（约 351-359 行）之后新增：

```ts
  handle('privacy:clearData', async (event, opts) => {
    console.info(`[IPC] privacy:clearData: types=${JSON.stringify(opts?.types)} since=${opts?.since}`)
    const inst = getInstance(event)
    if (!inst) {
      console.debug(`[IPC] privacy:clearData: no instance`)
      return
    }
    await inst.privacyManager.clear(opts)
  })
```

- [ ] **Step4: 类型检查**

Run: `bun run lint:typecheck`
Expected: 无类型错误

- [ ] **Step5: 提交**

```bash
git add packages/ipc-contract/src/channels.ts apps/main/src/ipc/register.ts apps/main/src/window-manager.ts
git commit -m "feat: 注册 privacy:clearData IPC 并接入 PrivacyManager"
```

---

### Task 3: preload 与 browserAPI 类型

**Files:**
- Modify: `apps/main/src/preload.ts`
- Modify: `apps/renderer/src/env.d.ts`

**Interfaces:**
- Consumes: `privacy:clearData` channel（Task 2 产出）
- Produces:
  - `window.browserAPI.clearPrivacyData(opts: { types: ClearDataType[]; since?: number }) => Promise<void>`

- [ ] **Step1: preload.ts 新增方法**

在 `clearHistory: () => ipcRenderer.invoke('history:clear'),`（约 263 行）之后新增：

```ts
  clearPrivacyData: (opts: { types: ('cookies' | 'cache' | 'localStorage' | 'formData')[]; since?: number }) =>
    ipcRenderer.invoke('privacy:clearData', opts),
```

- [ ] **Step2: env.d.ts 新增类型声明**

在 `clearHistory: IpcInvoke['history:clear']`（约 48 行）之后新增：

```ts
      clearPrivacyData: IpcInvoke['privacy:clearData']
```

- [ ] **Step3: 类型检查**

Run: `bun run lint:typecheck`
Expected: 无类型错误

- [ ] **Step4: 提交**

```bash
git add apps/main/src/preload.ts apps/renderer/src/env.d.ts
git commit -m "feat: preload 与 browserAPI 暴露 clearPrivacyData"
```

---

### Task 4: i18n 文案

**Files:**
- Modify: `packages/shared/src/i18n/messages.ts`

**Interfaces:**
- Produces: i18n key（供 Task 5/6/7 使用）
  - `settings.navPrivacy`、`settings.sections.privacy`、`settings.openClearDialog`、`settings.clearDataDesc`、`settings.clearDataTitle`、`settings.dataCookies`、`settings.dataCache`、`settings.dataLocalStorage`、`settings.dataFormData`、`settings.timeRange`、`settings.timeLastHour`、`settings.timeLastDay`、`settings.timeLastWeek`、`settings.timeLast4Weeks`、`settings.timeAll`、`settings.clearDataSuccess`、`settings.clearDataError`
  - `appMenu.clearData`

- [ ] **Step1: 扩展 I18nMessages 类型**

在 `settings` 命名空间的 `sections` 接口（约 100-107 行）的 `theme: string` 后加入 `privacy: string`。

在 `settings` 命名空间 `navAbout: string`（约 99 行）后加入：

```ts
    navPrivacy: string
    openClearDialog: string
    clearDataDesc: string
    clearDataTitle: string
    dataCookies: string
    dataCache: string
    dataLocalStorage: string
    dataFormData: string
    timeRange: string
    timeLastHour: string
    timeLastDay: string
    timeLastWeek: string
    timeLast4Weeks: string
    timeAll: string
    clearDataSuccess: string
    clearDataError: string
```

在 `appMenu` 命名空间接口（约 25-35 行）`settings: string` 后加入：

```ts
    clearData: string
```

- [ ] **Step2: 填充 zh-CN 文案**

在 zh-CN 的 `settings.sections` 对象（约 352 行起）`theme:` 后加入 `privacy: '隐私与安全',`。

在 zh-CN 的 `settings` 对象 `navAbout:`（约 350 行）后加入：

```ts
      navPrivacy: '隐私与安全',
      openClearDialog: '清除浏览数据',
      clearDataDesc: '清除 Cookie、缓存等浏览数据',
      clearDataTitle: '清除浏览数据',
      dataCookies: 'Cookie',
      dataCache: '缓存',
      dataLocalStorage: '本地存储',
      dataFormData: '表单数据（近似清除）',
      timeRange: '时间范围',
      timeLastHour: '过去 1 小时',
      timeLastDay: '过去 24 小时',
      timeLastWeek: '过去 7 天',
      timeLast4Weeks: '过去 4 周',
      timeAll: '全部',
      clearDataSuccess: '已清除浏览数据',
      clearDataError: '清除失败',
```

在 zh-CN 的 `appMenu` 对象 `settings:`（约 286 行）后加入：

```ts
      clearData: '清空缓存',
```

- [ ] **Step3: 填充 en 文案**

在 en 的 `settings.sections` 对象 `theme:` 后加入 `privacy: 'Privacy & Security',`。

在 en 的 `settings` 对象 `navAbout:` 后加入：

```ts
      navPrivacy: 'Privacy & Security',
      openClearDialog: 'Clear browsing data',
      clearDataDesc: 'Clear cookies, cache and other browsing data',
      clearDataTitle: 'Clear browsing data',
      dataCookies: 'Cookies',
      dataCache: 'Cache',
      dataLocalStorage: 'Local storage',
      dataFormData: 'Form data (approximate)',
      timeRange: 'Time range',
      timeLastHour: 'Last hour',
      timeLastDay: 'Last 24 hours',
      timeLastWeek: 'Last 7 days',
      timeLast4Weeks: 'Last 4 weeks',
      timeAll: 'All time',
      clearDataSuccess: 'Browsing data cleared',
      clearDataError: 'Failed to clear',
```

在 en 的 `appMenu` 对象 `settings:` 后加入：

```ts
      clearData: 'Clear cache',
```

- [ ] **Step4: 类型检查**

Run: `bun run lint:typecheck`
Expected: 无类型错误

- [ ] **Step5: 提交**

```bash
git add packages/shared/src/i18n/messages.ts
git commit -m "feat: 清除浏览数据相关 i18n 文案"
```

---

### Task 5: ClearDataDialog 弹窗组件

**Files:**
- Create: `apps/renderer/src/components/ClearDataDialog.vue`

**Interfaces:**
- Consumes: `window.browserAPI.clearPrivacyData`（Task 3）、i18n key（Task 4）
- Produces: 组件 `ClearDataDialog`，props `{ show: boolean }`，emits `update:show`

- [ ] **Step1: 创建组件**

```vue
<template>
  <NModal
    :show="show"
    preset="card"
    :title="t('settings.clearDataTitle')"
    style="width: 460px; max-width: 92vw"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <div class="clear-data-body">
      <div class="cd-section">
        <div class="cd-label">{{ t('settings.timeRange') }}</div>
        <NSelect
          v-model:value="timeRange"
          :options="timeOptions"
          size="medium"
        />
      </div>

      <div class="cd-section">
        <NCheckbox
          v-for="opt in typeOptions"
          :key="opt.value"
          v-model:checked="selected[opt.value]"
          class="cd-check"
        >
          {{ opt.label }}
        </NCheckbox>
      </div>

      <NText v-if="feedback" :type="feedbackType" class="cd-feedback">
        {{ feedback }}
      </NText>
    </div>

    <template #footer>
      <div class="cd-footer">
        <NButton @click="emit('update:show', false)">{{ t('common.cancel') }}</NButton>
        <NButton
          type="primary"
          :disabled="!hasSelection || loading"
          :loading="loading"
          @click="onClear"
        >
          {{ t('settings.openClearDialog') }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { NButton, NCheckbox, NModal, NSelect, NText } from 'naive-ui'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [boolean] }>()

const { t } = useI18n()

type DataType = 'cookies' | 'cache' | 'localStorage' | 'formData'

const selected = reactive<Record<DataType, boolean>>({
  cookies: true,
  cache: true,
  localStorage: true,
  formData: true,
})

const timeRange = ref<number>(0) // 0 = 全部

const typeOptions = computed(() => [
  { value: 'cookies' as DataType, label: t('settings.dataCookies') },
  { value: 'cache' as DataType, label: t('settings.dataCache') },
  { value: 'localStorage' as DataType, label: t('settings.dataLocalStorage') },
  { value: 'formData' as DataType, label: t('settings.dataFormData') },
])

const timeOptions = computed(() => [
  { value: 60 * 60 * 1000, label: t('settings.timeLastHour') },
  { value: 24 * 60 * 60 * 1000, label: t('settings.timeLastDay') },
  { value: 7 * 24 * 60 * 60 * 1000, label: t('settings.timeLastWeek') },
  { value: 4 * 7 * 24 * 60 * 60 * 1000, label: t('settings.timeLast4Weeks') },
  { value: 0, label: t('settings.timeAll') },
])

const hasSelection = computed(() =>
  (Object.keys(selected) as DataType[]).some((k) => selected[k])
)

const loading = ref(false)
const feedback = ref('')
const feedbackType = ref<'success' | 'error'>('success')

function sinceTs(): number {
  return timeRange.value === 0 ? 0 : Date.now() - timeRange.value
}

async function onClear(): Promise<void> {
  console.debug(`[ClearDataDialog] onClear: timeRange=${timeRange.value}`)
  if (!hasSelection.value) return
  loading.value = true
  feedback.value = ''
  const types = (Object.keys(selected) as DataType[]).filter((k) => selected[k])
  try {
    await window.browserAPI.clearPrivacyData({ types, since: sinceTs() })
    feedbackType.value = 'success'
    feedback.value = t('settings.clearDataSuccess')
    console.info(`[ClearDataDialog] onClear: success types=${JSON.stringify(types)}`)
    setTimeout(() => emit('update:show', false), 800)
  } catch (err) {
    feedbackType.value = 'error'
    feedback.value = t('settings.clearDataError')
    console.error(`[ClearDataDialog] onClear: failed`, err)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.clear-data-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.cd-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cd-label {
  font-size: 13px;
  color: var(--text-secondary);
}
.cd-check {
  margin: 2px 0;
}
.cd-feedback {
  font-size: 13px;
}
.cd-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
```

> 注：弹窗内用本地 `NText` 反馈代替全局 toast，避免改动 `App.vue` 挂载 `NMessageProvider`。文案 key `common.cancel` 若未定义，可在 i18n 增加或直接用 `t('settings.clearDataCancel')`——如缺失则在 Task 4 补 `settings.clearDataCancel: '取消'`。

- [ ] **Step2: 类型检查**

Run: `bun run lint:typecheck`
Expected: 无类型错误（若 `common.cancel` 缺失，补 i18n 后再跑）

- [ ] **Step3: 提交**

```bash
git add apps/renderer/src/components/ClearDataDialog.vue
git commit -m "feat: 新增 ClearDataDialog 清除浏览数据弹窗"
```

---

### Task 6: 设置页 PrivacyView + 路由 + 菜单

**Files:**
- Create: `apps/renderer/src/views/settings/PrivacyView.vue`
- Modify: `apps/renderer/src/router.ts`
- Modify: `apps/renderer/src/views/settings/SettingsView.vue`
- Modify: `apps/renderer/src/views/settings/settingsMenu.ts`

**Interfaces:**
- Consumes: `ClearDataDialog`（Task 5）、i18n key（Task 4）
- Produces: 设置页入口 `/settings/privacy`

- [ ] **Step1: 创建 PrivacyView.vue**

```vue
<template>
  <SettingsSection :title="t('settings.sections.privacy')">
    <SettingsItem :label="t('settings.clearDataDesc')">
      <NButton @click="showDialog = true">{{ t('settings.openClearDialog') }}</NButton>
    </SettingsItem>
    <ClearDataDialog v-model:show="showDialog" />
  </SettingsSection>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NButton } from 'naive-ui'
import SettingsItem from '@/components/SettingsItem.vue'
import SettingsSection from '@/components/SettingsSection.vue'
import ClearDataDialog from '@/components/ClearDataDialog.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const showDialog = ref(false)
</script>
```

- [ ] **Step2: 路由注册**

在 `apps/renderer/src/router.ts` 的 `routes` 数组中 `/settings/about` 行后新增：

```ts
    { path: '/settings/privacy', component: SettingsView },
```

- [ ] **Step3: SettingsView 注册页面**

在 `apps/renderer/src/views/settings/SettingsView.vue` 顶部 import 区新增：

```ts
import PrivacyView from './PrivacyView.vue'
```

在 `pages` 对象（`downloads:` 后）新增：

```ts
  privacy: { component: markRaw(PrivacyView), labelKey: 'settings.navPrivacy' as const },
```

- [ ] **Step4: 侧边菜单项**

在 `apps/renderer/src/views/settings/settingsMenu.ts` 数组中 `downloads` 项之后新增：

```ts
  {
    key: 'privacy',
    labelKey: 'settings.navPrivacy',
    icon: 'mdi:shield',
    to: '/settings/privacy',
  },
```

- [ ] **Step5: 类型检查 + lint**

Run: `bun run lint:typecheck`
Expected: 无类型错误

- [ ] **Step6: 提交**

```bash
git add apps/renderer/src/views/settings/PrivacyView.vue apps/renderer/src/router.ts apps/renderer/src/views/settings/SettingsView.vue apps/renderer/src/views/settings/settingsMenu.ts
git commit -m "feat: 设置页新增隐私与安全分区入口清除弹窗"
```

---

### Task 7: 三点菜单「清空缓存」入口

**Files:**
- Modify: `apps/renderer/src/components/AppMenuButton.vue`

**Interfaces:**
- Consumes: `ClearDataDialog`（Task 5）、i18n key `appMenu.clearData`（Task 4）

- [ ] **Step1: import 弹窗**

在 `AppMenuButton.vue` 顶部 import 区（`import IconButton from './ui/IconButton.vue'` 后）新增：

```ts
import ClearDataDialog from './ClearDataDialog.vue'
```

在 `const showBookmarkBar = ref(false)` 后新增：

```ts
const showClearDialog = ref(false)
```

在 `<template>` 根（`<IconButton .../>` 之后）新增：

```vue
  <ClearDataDialog v-model:show="showClearDialog" />
```

- [ ] **Step2: 新增菜单项**

在 `menuItems` computed 的返回数组中 `wmfx://settings` 项（约 53 行）之后新增：

```ts
    { id: 'clear-data', label: t('appMenu.clearData'), icon: 'mdi:delete-sweep' },
```

- [ ] **Step3: 处理菜单动作**

在 `runMenuItem` 函数开头（`if (id === 'incognito')` 之前）新增：

```ts
  if (id === 'clear-data') {
    console.debug('[AppMenuButton] runMenuItem: open clear-data dialog')
    showClearDialog.value = true
    return
  }
```

- [ ] **Step4: 类型检查 + lint**

Run: `bun run lint:typecheck`
Expected: 无类型错误

- [ ] **Step5: 提交**

```bash
git add apps/renderer/src/components/AppMenuButton.vue
git commit -m "feat: 三点菜单新增清空缓存入口复用清除弹窗"
```

---

### Task 8: E2E 测试

**Files:**
- Create: `apps/renderer/__tests__/clear-data.spec.ts`（或项目既有 E2E 目录）

**Interfaces:**
- Consumes: 设置页入口（Task 6）、AppMenu 入口（Task 7）、`clearPrivacyData` IPC（Task 3）

- [ ] **Step1: 写 E2E 测试**

```ts
import { test, expect } from '@playwright/test'

test('设置页清除浏览数据弹窗', async ({ page }) => {
  await page.goto('#/settings/privacy')
  await page.getByText('清除浏览数据').first().click()
  await expect(page.getByText('清除浏览数据')).toBeVisible()
  // 取消全部勾选后按钮禁用
  await page.getByText('缓存').click()
  await page.getByText('Cookie').click()
  await page.getByText('本地存储').click()
  await page.getByText('表单数据').click()
  await expect(page.getByRole('button', { name: '清除浏览数据' })).toBeDisabled()
  // 重新勾选并清除
  await page.getByText('缓存').click()
  await page.getByRole('button', { name: '清除浏览数据' }).click()
  await expect(page.getByText('已清除浏览数据')).toBeVisible()
})

test('三点菜单清空缓存打开同一弹窗', async ({ page }) => {
  await page.goto('#/')
  await page.getByTitle('菜单').click()
  await page.getByText('清空缓存').click()
  await expect(page.getByText('清除浏览数据')).toBeVisible()
})
```

> 选择器以实际渲染文本为准，若按钮名称与文案冲突，按实际 `openClearDialog` / `clearDataTitle` 文案调整。

- [ ] **Step2: 运行 E2E（如环境允许）**

Run: `bun x playwright test clear-data`
Expected: 两个用例 PASS（无 Electron 运行时环境下可仅做 lint/typecheck 保证编译）

- [ ] **Step3: 提交**

```bash
git add apps/renderer/__tests__/clear-data.spec.ts
git commit -m "test: 清除浏览数据 E2E 用例"
```

---

## 自审核对（Self-Review）

- **Spec 覆盖**：PrivacyManager（Task 1）✅；IPC channel + handler（Task 2）✅；preload/browserAPI（Task 3）✅；设置页弹窗按钮（Task 6）✅；三点菜单入口（Task 7）✅；i18n（Task 4）✅；弹窗组件（Task 5）✅；测试（Task 1 单测 + Task 8 E2E）✅。
- **占位符扫描**：无 TBD/TODO；所有代码步骤均含实际代码。
- **类型一致性**：`ClearDataType` 在 Task 1 定义，`ClearDataOptions.types` 与 preload/env/browserAPI 使用同一联合类型字面量；`ClearDataDialog` 的 `DataType` 与 `ClearDataOptions.types` 元素一致；`privacy:clearData` 在 channels/register/preload/env 四处签名一致。
- **注意项**：`common.cancel` 若 i18n 未定义，需在 Task 4 补 `settings.clearDataCancel`；已在上文注明。
