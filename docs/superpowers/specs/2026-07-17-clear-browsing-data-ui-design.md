# 清除浏览数据 UI 设计

- 日期：2026-07-17
- 关联 Roadmap：Phase 3.5 — 「清除浏览数据 UI」
- 范围：仅 Web 存储（Cookie / 缓存 / localStorage / 表单数据），不含应用级历史/书签/下载
- 入口：设置页新增「隐私与安全」分区

## 目标

提供一个设置页 UI，让用户选择要清除的 Web 存储类型与时间范围，并作用到所有 Electron session 分区（default 持久分区、incognito 分区及所有 `persist:*` 分区）。

## 设计决策

| 问题 | 决策 |
|------|------|
| 清除范围 | 仅 Web 存储：Cookie / 缓存 / 本地存储 / 表单数据 |
| 时间范围 | 提供：过去 1 小时 / 24 小时 / 7 天 / 4 周 / 全部 |
| Session 范围 | 所有分区（遍历 `session.getAllSessions()`） |
| 入口 | 设置页新增「隐私与安全」导航项（与 Downloads 同级） |
| 实现方案 | 新增 `PrivacyManager` + 单个 IPC `privacy:clearData`（YAGNI，不做细粒度拆分） |

## 1. 主进程：PrivacyManager

新增 `apps/main/src/privacy-manager.ts`：

```ts
export type ClearDataType = 'cookies' | 'cache' | 'localStorage' | 'formData'

export interface ClearDataOptions {
  types: ClearDataType[]
  since?: number // 时间戳(ms)，0/undefined 表示全部
}

/**
 * 隐私管理器 — 封装 session.clearStorageData
 * 遍历所有 session 分区，按用户选择的数据类型与时间窗口清除 Web 存储。
 */
export class PrivacyManager {
  async clear(opts: ClearDataOptions): Promise<void>
}
```

### 类型到 Electron storage 的映射

`Session.clearStorageData({ storages, since })` 的 `storages` 支持：
`cookies | filesystem | indexeddb | localstorage | shadercache | websql | serviceworkers | cachestorage | all`。

| 用户选项 | storages |
|----------|----------|
| cookies | `['cookies']` |
| cache | `['cachestorage', 'shadercache']` |
| localStorage | `['localstorage']` |
| formData | `['indexeddb']`（表单自动填充数据近似覆盖） |

> **限制说明**：Electron 没有独立的「表单自动填充」storage 类型。表单数据实际持久化在 IndexedDB / localStorage 中，故以 `indexeddb` 近似清除，UI 文案会注明「表单数据（近似清除）」。

### clear 实现

```ts
async clear(opts: ClearDataOptions): Promise<void> {
  const storages = mapTypesToStorages(opts.types)
  const since = opts.since ?? 0
  const sessions = session.getAllSessions()
  console.info(`[PrivacyManager] clear: sessions=${sessions.length} storages=${JSON.stringify(storages)} since=${since}`)
  for (const sess of sessions) {
    await sess.clearStorageData({ storages, since })
  }
  console.info(`[PrivacyManager] clear: done`)
}
```

需要在 `BrowserInstance` 中实例化并暴露 `privacyManager`。

## 2. IPC 层

### ipc-contract/src/channels.ts

在 `IpcChannels` 类型与 `ipcChannelList` 中新增：

```ts
'privacy:clearData': (opts: {
  types: ('cookies' | 'cache' | 'localStorage' | 'formData')[]
  since?: number
}) => void
```

### apps/main/src/ipc/register.ts

沿用现有 `handle` + `getInstance` 模式，日志使用字符串插值（不使用 `%s` 占位符）：

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

### preload 与 browserAPI 类型

`apps/main/src/preload.ts` 与渲染进程的 `browserAPI` 接口同步新增：

```ts
clearPrivacyData: (opts: { types: ClearDataType[]; since?: number }) => Promise<void>
```

## 3. 渲染层 UI

### 核心：ClearDataDialog 弹窗组件

新增 `apps/renderer/src/components/ClearDataDialog.vue`，使用 Naive UI `NModal` 承载。

该弹窗是**唯一**的清除交互载体，被两处复用（设置页按钮 + 三点菜单项）。
内部状态：
- 4 个 `NSwitch` 复选项：Cookie / 缓存 / 本地存储 / 表单数据（默认全选）
- `NSelect` 时间范围：过去 1 小时 / 24 小时 / 7 天 / 4 周 / 全部（默认「全部」）
- 「清除数据」按钮：
  - 未勾选任何类型时禁用
  - 清除中显示 loading 并禁用
  - 点击直接触发清除（弹窗本身即二次确认界面）
  - 确认后调 `window.browserAPI.clearPrivacyData({ types, since })`
  - 成功后关闭弹窗并通过注入的 `NMessage` 提示成功；失败提示错误

时间范围到 `since` 的映射：`Date.now() - 偏移`，「全部」传 `0`。

> **Naive UI 全局 Provider 说明**：当前 renderer 仅在组件内按需引入组件，未挂载全局 `NMessageProvider` / `NDialogProvider`。本组件通过 `useMessage()` 需要上层有 `NMessageProvider`。实现时：在 `ClearDataDialog.vue` 内使用 `NModal` 承载内容，反馈提示用组件内本地状态（成功/失败文案 `NText`），避免引入全局 provider 改造；或若需 toast，则在 `App.vue` 挂载 `NMessageProvider`（按需选择，实现计划阶段定）。

### 设置页入口：PrivacyView.vue

路径：`apps/renderer/src/views/settings/PrivacyView.vue`。

复用现有 `SettingsSection` / `SettingsItem`。页面只放一个「清除浏览数据」按钮（区块标题「隐私与安全」），点击 `showDialog = true` 打开 `ClearDataDialog`：

```vue
<SettingsSection :title="t('settings.sections.privacy')">
  <SettingsItem :label="t('settings.clearDataDesc')">
    <NButton @click="showDialog = true">{{ t('settings.openClearDialog') }}</NButton>
  </SettingsItem>
  <ClearDataDialog v-model:show="showDialog" />
</SettingsSection>
```

### 三点菜单入口：AppMenuButton.vue

在 `AppMenuButton.vue` 的 `menuItems` 中新增一项：

```ts
{ id: 'clear-data', label: t('appMenu.clearData'), icon: 'mdi:delete-sweep' }
```

在 `runMenuItem` 中处理 `clear-data`：打开同一 `ClearDataDialog`。由于 `AppMenuButton` 是 ChromeUI 内的组件，弹窗以 `Teleport` 到 `body` 的 `NModal` 呈现，保证层级正确。实现时可把 `ClearDataDialog` 的 `v-model:show` 提升到 `ChromeUI.vue` 顶层状态，由菜单项与设置页共享触发。

### 注册路由与菜单

- `apps/renderer/src/router.ts`：新增 `{ path: '/settings/privacy', component: SettingsView }`
- `apps/renderer/src/views/settings/SettingsView.vue`：`pages` 增加 `privacy`
- `apps/renderer/src/views/settings/settingsMenu.ts`：新增
  ```ts
  { key: 'privacy', labelKey: 'settings.navPrivacy', icon: 'mdi:shield', to: '/settings/privacy' }
  ```

## 4. i18n

在 `packages/shared/src/i18n/messages.ts` 的 `settings` 下补充（中英文）：

`settings` 命名空间下补充（中英文）：

```ts
navPrivacy: string
sections: { ... privacy: string }
openClearDialog: string        // 清除浏览数据（按钮文案）
clearDataDesc: string          // 清除 Cookie、缓存等浏览数据
clearDataTitle: string         // 清除浏览数据（弹窗标题）
dataCookies: string            // Cookie
dataCache: string              // 缓存
dataLocalStorage: string       // 本地存储
dataFormData: string           // 表单数据（近似清除）
timeRange: string              // 时间范围
timeLastHour: string           // 过去 1 小时
timeLastDay: string            // 过去 24 小时
timeLastWeek: string           // 过去 7 天
timeLast4Weeks: string         // 过去 4 周
timeAll: string                // 全部
clearDataSuccess: string       // 已清除浏览数据
clearDataError: string         // 清除失败
```

`appMenu` 命名空间下补充：`clearData: string`（三点菜单项文案，如「清空缓存」）。

## 5. 测试

### 单元测试（Vitest，apps/main/src）

`privacy-manager.test.ts`：
- mock `session.getAllSessions()` 返回若干 fake session（带 `clearStorageData` spy）
- 验证 `clear` 对每个 session 调用 `clearStorageData`
- 验证 `types` → `storages` 映射正确（含 formData → indexeddb）
- 验证 `since` 为「全部」时传 `0`，否则为正确时间戳

### E2E（Playwright）

- 用例1（设置页）：打开 `/settings/privacy` → 点「清除浏览数据」→ 弹窗出现 → 勾选「缓存」、选「全部」→ 点「清除数据」→ 弹窗关闭 + 成功提示
- 用例2（三点菜单）：点 AppMenu → 点「清空缓存」→ 同一弹窗出现 → 完成清除

## 6. 文件改动清单

| 文件 | 改动 |
|------|------|
| `apps/main/src/privacy-manager.ts` | 新增 |
| `apps/main/src/privacy-manager.test.ts` | 新增 |
| `apps/main/src/ipc/register.ts` | 注册 `privacy:clearData` |
| `packages/ipc-contract/src/channels.ts` | 新增 channel 类型与列表项 |
| `apps/main/src/preload.ts` | 新增 `clearPrivacyData` |
| 渲染 `browserAPI` 类型声明 | 新增 `clearPrivacyData` |
| `apps/renderer/src/components/ClearDataDialog.vue` | 新增（核心弹窗，NModal） |
| `apps/renderer/src/views/settings/PrivacyView.vue` | 新增（按钮触发弹窗） |
| `apps/renderer/src/components/AppMenuButton.vue` | 三点菜单新增「清空缓存」项 |
| `apps/renderer/src/components/ChromeUI.vue` | 提升弹窗 `show` 状态（如需跨组件共享） |
| `apps/renderer/src/router.ts` | 新增 `/settings/privacy` 路由 |
| `apps/renderer/src/views/settings/SettingsView.vue` | `pages` 增加 privacy |
| `apps/renderer/src/views/settings/settingsMenu.ts` | 新增隐私菜单项 |
| `packages/shared/src/i18n/messages.ts` | 补充隐私相关 i18n key |
| E2E spec | 新增清除数据测试 |
