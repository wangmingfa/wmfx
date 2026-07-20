# 快捷键菜单（Shortcuts Menu）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置页新增只读「快捷键」子页，集中展示所有应用内快捷键（含分组、平台本地化键位、作用域标签），架构预留全局快捷键分类。

**Architecture:** 主进程新建中心化快捷键注册表 `SHORTCUT_REGISTRY`（纯元数据 SSOT），`index.ts` 改为遍历注册表注册应用内快捷键；新增 IPC `shortcuts:list` 返回元数据；渲染端新增 `ShortcutsView` + `KbdKey` 组件，挂载时拉取并按 group 分组展示，全局分组为空时显示占位文案。

**Tech Stack:** Electron `ipcMain`/`ipcRenderer`，`naive-ui`（Section/SectionItem），Vue 3 `<script setup>`，bun 工具链（lint/typecheck）。

## Global Constraints

- 包管理器用 `bun`；提交前必须 `bun run lint` 全绿（biome + eslint + typecheck 三阶段）。
- 快捷键注册表是**声明源（SSOT）**：改/增/删快捷键必须同步更新 `SHORTCUT_REGISTRY`；团队公约写进代码注释。
- 注册表数组元素**按字段纵向对齐**书写（便于阅读），见 Task 1。
- description 双语对象（`{'zh-CN','en-US'}`）直接存在注册表，**不**走 i18n key（SSOT）。
- scope 分类：`'in-app'`（焦点型）/ `'global'`（常驻全局）。本次只产出 `in-app` 条目，`global` 分组留空展示。
- 渲染端只消费元数据（accelerator/scope/group/description），**绝不**接收回调或窗口引用。
- 复用现有 `Section` / `SectionItem` 组件，与设置页其它子页风格一致。
- 不实现：真正的全局快捷键注册、重绑定、运行时变更订阅。

---

### Task 1: 主进程快捷键注册表（SSOT）

**Files:**
- Create: `apps/main/src/shortcut-registry.ts`
- Modify: `apps/main/src/index.ts`（`wireWindowShortcuts` 函数，约 110-196 行）

**Interfaces:**
- Produces: `SHORTCUT_REGISTRY: ShortcutDef[]`、`ShortcutDef` / `ShortcutScope` / `ShortcutGroup` 类型——供 Task 4 的 IPC handler 直接返回。

- [ ] **Step 1: 创建注册表文件**

```ts
// apps/main/src/shortcut-registry.ts
/**
 * 快捷键中心化注册表（SSOT）——声明源。
 * 菜单 / 设置页只读元数据，不携带回调（回调在 index.ts 按 id 分发）。
 * 团队公约：增删改快捷键必须同步更新此表，否则菜单与实际注册会不一致。
 * 数组元素按字段纵向对齐，便于阅读。
 */
export type ShortcutScope = 'in-app' | 'global'
export type ShortcutGroup = 'navigation' | 'tab' | 'window' | 'devtools'

export interface ShortcutDef {
  /** 稳定标识，index.ts 按此 id 分发 action 回调 */
  id: string
  /** Electron 加速器格式，如 'CmdOrCtrl+F' */
  accelerator: string
  /** 作用域：in-app=窗口焦点型（失焦注销）；global=常驻全局（本次未启用） */
  scope: ShortcutScope
  /** 分组，决定菜单中归入哪个 Section */
  group: ShortcutGroup
  /** 双语描述（SSOT，不拆到 i18n） */
  description: { 'zh-CN': string; 'en-US': string }
}

export const SHORTCUT_REGISTRY: ShortcutDef[] = [
  { id:'find',            accelerator:'CmdOrCtrl+F',       scope:'in-app', group:'navigation', description:{ 'zh-CN':'查找',           'en-US':'Find in page' } },
  { id:'focus-url',       accelerator:'CmdOrCtrl+L',       scope:'in-app', group:'navigation', description:{ 'zh-CN':'聚焦地址栏',     'en-US':'Focus address bar' } },
  { id:'devtools-page',   accelerator:'F12',               scope:'in-app', group:'devtools',  description:{ 'zh-CN':'页面开发者工具', 'en-US':'Page DevTools' } },
  { id:'devtools-app',    accelerator:'CmdOrCtrl+F12',     scope:'in-app', group:'devtools',  description:{ 'zh-CN':'应用开发者工具', 'en-US':'App DevTools' } },
  { id:'close-tab',       accelerator:'CmdOrCtrl+W',       scope:'in-app', group:'tab',       description:{ 'zh-CN':'关闭标签页',     'en-US':'Close tab' } },
  { id:'reload',          accelerator:'F5',                scope:'in-app', group:'navigation', description:{ 'zh-CN':'重新加载',       'en-US':'Reload' } },
  { id:'reopen-tab',      accelerator:'CmdOrCtrl+Shift+T', scope:'in-app', group:'tab',       description:{ 'zh-CN':'恢复关闭的标签页','en-US':'Reopen closed tab' } },
  { id:'new-incognito',   accelerator:'CmdOrCtrl+Shift+N', scope:'in-app', group:'window',     description:{ 'zh-CN':'新建无痕窗口',   'en-US':'New incognito window' } },
  { id:'new-window',      accelerator:'CmdOrCtrl+N',       scope:'in-app', group:'window',     description:{ 'zh-CN':'新建窗口',       'en-US':'New window' } },
]
```

- [ ] **Step 2: 改造 `wireWindowShortcuts` 遍历注册表**

将 `apps/main/src/index.ts` 中 `wireWindowShortcuts`（原 110-196 行）替换为：保留各 action 回调定义在一个 `id → callback` 映射，再遍历注册表注册。action 实现与原逻辑一致（取 focused window、inst、activeTabId 等）。

在 `index.ts` 顶部 import 区加入：
```ts
import { registerAppShortcut, toggleDevTools, SHORTCUT_REGISTRY } from './shortcut-registry'
```
（注意：原 `import { registerAppShortcut, toggleDevTools } from './shortcut'` 需改为从 `./shortcut-registry` 引入 `SHORTCUT_REGISTRY`，`registerAppShortcut`/`toggleDevTools` 仍来自 `./shortcut`。）

替换 `wireWindowShortcuts` 函数体为：
```ts
function wireWindowShortcuts(instance: BrowserWindowInstance): void {
  const win = instance.window
  console.debug('[App] wireWindowShortcuts: windowId=%s', win.id)

  // 按 id 分发 action 回调（回调保留原 index.ts 逻辑，不进注册表）
  const actions: Record<string, () => void> = {
    find: () => {
      const focused = BrowserWindow.getFocusedWindow()
      if (!focused) return
      const inst = globalThis.browserInstances.get(String(focused.id))
      if (!inst) return
      const activeTabId = inst.tabManager.getActiveTabId()
      if (!activeTabId) return
      focused.webContents.send('page:openFind', activeTabId)
    },
    'focus-url': () => {
      const focused = BrowserWindow.getFocusedWindow()
      if (!focused) return
      focused.webContents.send('shell:focusAddressBar')
    },
    'devtools-page': () => {
      const focused = BrowserWindow.getFocusedWindow()
      const inst = focused
        ? globalThis.browserInstances.get(String(focused.id))
        : globalThis.browserInstances.get(String(win.id))
      if (!inst) return
      const activeTabId = inst.tabManager.getActiveTabId()
      if (!activeTabId) return
      const wc = inst.tabManager.getWebContents(activeTabId)
      if (!wc) return
      if (wc.isDevToolsOpened()) wc.closeDevTools()
      else wc.openDevTools()
    },
    'devtools-app': () => {
      const focused = BrowserWindow.getFocusedWindow()
      if (!focused) return
      const inst = globalThis.browserInstances.get(String(focused.id))
      if (!inst) return
      toggleDevTools(inst.window, inst.window.webContents)
    },
    'close-tab': () => {
      const focused = BrowserWindow.getFocusedWindow()
      if (!focused) return
      const inst = globalThis.browserInstances.get(String(focused.id))
      if (!inst) return
      const activeTabId = inst.tabManager.getActiveTabId()
      if (!activeTabId) return
      inst.tabManager.close(activeTabId)
      closeWindowIfEmpty(inst)
    },
    reload: () => {
      const focused = BrowserWindow.getFocusedWindow()
      if (!focused) return
      const inst = globalThis.browserInstances.get(String(focused.id))
      if (!inst) return
      const activeTabId = inst.tabManager.getActiveTabId()
      if (!activeTabId) return
      inst.navigationManager.reload(activeTabId)
    },
    'reopen-tab': () => {
      const focused = BrowserWindow.getFocusedWindow()
      if (!focused) return
      const inst = globalThis.browserInstances.get(String(focused.id))
      if (!inst) return
      inst.tabManager.reopenClosed()
    },
    'new-incognito': () => {
      console.debug('[App] shortcut: new incognito window')
      openIncognitoWindow()
    },
    'new-window': () => {
      console.debug('[App] shortcut: new normal window')
      openNormalWindow()
    },
  }

  for (const def of SHORTCUT_REGISTRY) {
    if (def.scope !== 'in-app') continue
    const cb = actions[def.id]
    if (!cb) {
      console.warn('[App] wireWindowShortcuts: 注册表有定义但缺少 action 回调，id=%s', def.id)
      continue
    }
    registerAppShortcut(win, def.accelerator, cb)
  }
}
```

- [ ] **Step 3: 运行 lint 验证**
```bash
bun run lint
```
期望：全绿（biome/eslint/typecheck）。注意 biome 可能重排注册表数组的对齐格式——若能接受则提交；若要求严格保留对齐，按 lint 输出手动调整后再提交（无功能影响）。

- [ ] **Step 4: 提交**
```bash
git add apps/main/src/shortcut-registry.ts apps/main/src/index.ts
git commit -m "feat(main): extract centralized SHORTCUT_REGISTRY and register via iteration"
```

---

### Task 2: IPC 契约与通道（ipc-contract + channels）

**Files:**
- Modify: `packages/ipc-contract/src/channels.ts`（新增 `ShortcutInfo` 接口、`shortcuts:list` 通道、加入 `IPC_CHANNELS` 数组）
- Test: `packages/ipc-contract` 无单测，跳过 TDD（纯类型定义）。以 `bun run build:ipc` + 全仓库 typecheck 作为验证。

**Interfaces:**
- Produces: `ShortcutInfo` 类型（渲染端消费）、`'shortcuts:list'` 通道声明——供 Task 3（主进程 handler）与 Task 4（preload 暴露）引用。

- [ ] **Step 1: 在 channels.ts 增加 `ShortcutInfo` 接口**

在 `BookmarkItem` 接口（约 249 行）之后插入：
```ts
/** 快捷键元数据（主进程注册表映射而来，纯展示用，不含回调） */
export interface ShortcutInfo {
  id: string
  accelerator: string
  scope: 'in-app' | 'global'
  group: 'navigation' | 'tab' | 'window' | 'devtools'
  description: { 'zh-CN': string; 'en-US': string }
}
```

- [ ] **Step 2: 在 `IpcContract` 接口中增加通道**

在 `// Native Menu` 段（约 764 行）之前插入：
```ts
  // Shortcuts
  /** 返回所有已声明快捷键的元数据（不含回调），供设置页展示 */
  'shortcuts:list': () => ShortcutInfo[]
```

- [ ] **Step 3: 在 `IPC_CHANNELS` 数组中加入通道名**

在 `'native-menu:open'` 前（约 960 行）插入：
```ts
  'shortcuts:list',
```

- [ ] **Step 4: 构建 ipc-contract 并 typecheck**
```bash
bun run build:ipc
bun run lint:typecheck
```
期望：构建成功、typecheck 全绿。

- [ ] **Step 5: 提交**
```bash
git add packages/ipc-contract/src/channels.ts
git commit -m "feat(ipc): add shortcuts:list channel and ShortcutInfo type"
```

---

### Task 3: 主进程 IPC handler

**Files:**
- Modify: `apps/main/src/ipc/register.ts`（新增 `shortcuts:list` handler）

**Interfaces:**
- Consumes: `SHORTCUT_REGISTRY`（`apps/main/src/shortcut-registry.ts`，Task 1 产出）、`ShortcutInfo` 类型（Task 2 产出）
- Produces: 无（终端 handler）

- [ ] **Step 1: 在 register.ts 注册 handler**

先查看 `apps/main/src/ipc/register.ts` 现有 import 与 handler 注册模式（实际文件中通常是 `ipcMain.handle('xxx', ...)` 或 `ipcMain.on`）。在文件顶部 import 区加入：
```ts
import { SHORTCUT_REGISTRY } from '../shortcut-registry'
```
在其它 handler 注册附近加入：
```ts
ipcMain.handle('shortcuts:list', () => {
  console.debug('[IPC] shortcuts:list')
  return SHORTCUT_REGISTRY
})
```

- [ ] **Step 2: 运行 lint**
```bash
bun run lint
```
期望：全绿。

- [ ] **Step 3: 提交**
```bash
git add apps/main/src/ipc/register.ts
git commit -m "feat(main): add shortcuts:list IPC handler returning registry metadata"
```

---

### Task 4: preload 暴露 getShortcuts

**Files:**
- Modify: `apps/main/src/preload.ts`（类型声明 + 实现两处各加一项）

**Interfaces:**
- Consumes: `ShortcutInfo` 类型（`@browser/ipc-contract`，Task 2 产出）
- Produces: `window.browserAPI.getShortcuts(): Promise<ShortcutInfo[]>`——供 Task 6 的 ShortcutsView 调用。

- [ ] **Step 1: 在 preload 类型声明中加入 getShortcuts**

在 `import type { ... }` 区（第 1-46 行）加入 `ShortcutInfo`：
```ts
  ShortcutInfo,
```
在 `api` 对象类型定义中「Settings」段（约 129 行）之后加入：
```ts
  // Shortcuts
  getShortcuts: () => Promise<ShortcutInfo[]>
```

- [ ] **Step 2: 在 api 实现块中加入 getShortcuts**

在 `getAllSettings: () => ipcRenderer.invoke('settings:getAll'),`（约 398 行）之后加入：
```ts
  // Shortcuts
  getShortcuts: () => ipcRenderer.invoke('shortcuts:list'),
```

- [ ] **Step 3: 运行 lint**
```bash
bun run lint
```
期望：全绿。

- [ ] **Step 4: 提交**
```bash
git add apps/main/src/preload.ts
git commit -m "feat(preload): expose getShortcuts via shortcuts:list"
```

---

### Task 5: KbdKey 组件（平台本地化键位）

**Files:**
- Create: `apps/renderer/src/components/KbdKey.vue`

**Interfaces:**
- Produces: `<KbdKey :accelerator="string" />` 组件——供 Task 6 的 ShortcutsView 使用。

- [ ] **Step 1: 创建 KbdKey.vue**

```vue
<template>
  <span class="kbd-wrap">
    <kbd v-for="(key, i) in keys" :key="i" class="kbd-key">{{ key }}</kbd>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** Electron 加速器字符串，如 'CmdOrCtrl+F' / 'CmdOrCtrl+Shift+T' */
  accelerator: string
}>()

// macOS 用符号，其它平台用文字
const isMac = computed(() => process.platform === 'darwin')

const SYMBOLS: Record<string, string> = {
  CmdOrCtrl: '⌘',
  Command: '⌘',
  Cmd: '⌘',
  Control: 'Ctrl',
  Ctrl: 'Ctrl',
  Alt: '⌥',
  Option: '⌥',
  Shift: '⇧',
  Enter: '↩',
}

// 把 'CmdOrCtrl+Shift+T' 拆为 ['CmdOrCtrl','Shift','T']
function splitParts(acc: string): string[] {
  return acc.split('+').map((p) => p.trim()).filter(Boolean)
}

const keys = computed<string[]>(() => {
  const out: string[] = []
  for (const part of splitParts(props.accelerator)) {
    if (isMac.value && SYMBOLS[part]) {
      out.push(SYMBOLS[part])
    } else if (!isMac.value && part === 'CmdOrCtrl') {
      out.push('Ctrl')
    } else if (SYMBOLS[part] && !isMac.value) {
      // Windows/Linux 下 Alt/Shift 等用文字
      out.push(SYMBOLS[part])
    } else {
      out.push(part)
    }
  }
  return out
})
</script>

<style scoped>
.kbd-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.kbd-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  line-height: 1;
  color: var(--text-secondary);
  background: var(--bg-tertiary, #2a2a2a);
  border: 1px solid var(--border-color, #444);
  border-radius: 4px;
}
</style>
```

- [ ] **Step 2: 运行 lint**
```bash
bun run lint
```
期望：全绿。

- [ ] **Step 3: 提交**
```bash
git add apps/renderer/src/components/KbdKey.vue
git commit -m "feat(renderer): add KbdKey component with platform-localized shortcuts"
```

---

### Task 6: ShortcutsView 与设置页接入

**Files:**
- Create: `apps/renderer/src/views/settings/ShortcutsView.vue`
- Modify: `apps/renderer/src/views/settings/SettingsView.vue`（`pages` 对象，约 28-34 行）
- Modify: `apps/renderer/src/views/settings/settingsMenu.ts`（菜单项数组）
- Modify: `apps/renderer/src/router.ts`（`/settings/shortcuts` 路由，约 24-29 行）
- Modify: `packages/shared/src/i18n/messages.ts`（`settings.navShortcuts` + `shortcuts.*` 文案，中英文两段）

**Interfaces:**
- Consumes: `window.browserAPI.getShortcuts()`（Task 4 产出，返回 `ShortcutInfo[]`）、`KbdKey` 组件（Task 5 产出）、`Section` / `SectionItem` 组件（现有）、`useI18n`（现有）

- [ ] **Step 1: 新增 i18n 文案**

在 `packages/shared/src/i18n/messages.ts` 的 `settings` 段（含 `navAppearance` 等 key）的 key 联合类型（`settings: { ... }` 接口）中加 `navShortcuts: string`；在 `shortcuts` 段加入：
```ts
shortcuts: {
  navGroupNavigation: string
  navGroupTab: string
  navGroupWindow: string
  navGroupDevtools: string
  scopeInApp: string
  scopeGlobal: string
  emptyGlobal: string
}
```
（若该 `shortcuts` 段已存在，仅追加缺失字段。）

在 zh-CN 实现对象（约 395 行 `settings:` 段附近）的 `settings` 段加：`navShortcuts: '快捷键'`，并新增/补全 `shortcuts` 段：
```ts
shortcuts: {
  navGroupNavigation: '导航',
  navGroupTab: '标签',
  navGroupWindow: '窗口',
  navGroupDevtools: '开发者工具',
  scopeInApp: '应用内',
  scopeGlobal: '全局',
  emptyGlobal: '暂无全局快捷键',
},
```
在 en-US 实现对象（约 706 行 `settings:` 段附近）的 `settings` 段加：`navShortcuts: 'Shortcuts'`，并新增/补全：
```ts
shortcuts: {
  navGroupNavigation: 'Navigation',
  navGroupTab: 'Tabs',
  navGroupWindow: 'Window',
  navGroupDevtools: 'Developer Tools',
  scopeInApp: 'In-app',
  scopeGlobal: 'Global',
  emptyGlobal: 'No global shortcuts',
},
```

- [ ] **Step 2: 新增 ShortcutsView.vue**

```vue
<template>
  <div class="shortcuts-view">
    <Section
      v-for="grp in orderedGroups"
      :key="grp"
      :title="groupTitle(grp)"
    >
      <SectionItem v-for="s in grouped[grp]" :key="s.id">
        <template #label>
          <span class="shortcut-label">{{ currentLang === 'zh-CN' ? s.description['zh-CN'] : s.description['en-US'] }}</span>
          <span class="scope-tag" :class="s.scope">{{ s.scope === 'global' ? t('shortcuts.scopeGlobal') : t('shortcuts.scopeInApp') }}</span>
        </template>
        <KbdKey :accelerator="s.accelerator" />
      </SectionItem>
    </Section>

    <!-- 全局分组为空时占位 -->
    <Section v-if="grouped.global && grouped.global.length === 0" :title="groupTitle('global')">
      <div class="empty-global">{{ t('shortcuts.emptyGlobal') }}</div>
    </Section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { ShortcutInfo } from '@browser/ipc-contract'
import Section from '@/components/Section.vue'
import SectionItem from '@/components/SectionItem.vue'
import KbdKey from '@/components/KbdKey.vue'
import { useI18n } from '@/composables/useI18n'

const { t, lang } = useI18n()
const currentLang = computed(() => (lang.value === 'system' ? (navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US') : lang.value))

type Group = 'navigation' | 'tab' | 'window' | 'devtools' | 'global'
const ORDER: Group[] = ['navigation', 'tab', 'window', 'devtools', 'global']

const shortcuts = ref<ShortcutInfo[]>([])

const grouped = computed<Record<string, ShortcutInfo[]>>(() => {
  const map: Record<string, ShortcutInfo[]> = {}
  for (const g of ORDER) map[g] = []
  for (const s of shortcuts.value) {
    if (!map[s.group]) map[s.group] = []
    map[s.group].push(s)
  }
  return map
})

// 只渲染有内容的分组（按固定顺序）
const orderedGroups = computed<Group[]>(() => ORDER.filter((g) => (grouped.value[g]?.length ?? 0) > 0))

function groupTitle(g: Group): string {
  const titles: Record<Group, string> = {
    navigation: t('shortcuts.navGroupNavigation'),
    tab: t('shortcuts.navGroupTab'),
    window: t('shortcuts.navGroupWindow'),
    devtools: t('shortcuts.navGroupDevtools'),
    global: t('shortcuts.scopeGlobal'),
  }
  return titles[g]
}

onMounted(async () => {
  console.debug('[ShortcutsView] onMounted: 拉取快捷键列表')
  shortcuts.value = await window.browserAPI.getShortcuts()
})
</script>

<style scoped>
.shortcuts-view {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.shortcut-label {
  font-size: 14px;
  color: var(--text-primary);
}

.scope-tag {
  margin-left: 8px;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  color: var(--text-muted);
}

.scope-tag.global {
  color: var(--color-primary, #4361ee);
  border-color: var(--color-primary, #4361ee);
}

.empty-global {
  padding: 16px 20px;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
```

> 注：`groupTitle` 复用了 `shortcuts.scopeGlobal` 作为 global 分组标题；导航/标签/窗口/开发者工具四个分组标题需追加 i18n key（`navGroupNavigation` 等）到 messages.ts 的 `shortcuts` 段。若你想复用既有文案或简化，可改为直接用硬编码中文/英文常量——但优先遵循「所有 UI 文案走 i18n」的项目约定，故在 messages.ts 补 4 个分组标题 key。

- [ ] **Step 3: 设置页接入 settingsMenu.ts**

在 `settingsSideMenu` 数组（`apps/renderer/src/views/settings/settingsMenu.ts`）末尾追加：
```ts
  { key: 'shortcuts', labelKey: 'settings.navShortcuts', icon: 'mdi:keyboard', to: '/settings/shortcuts' },
```

- [ ] **Step 4: 路由接入 router.ts**

在 `apps/renderer/src/router.ts` 的 `/settings/*` 路由块（约 24-29 行）加入：
```ts
    { path: '/settings/shortcuts', component: SettingsView },
```

- [ ] **Step 5: SettingsView.vue 的 pages 对象**

在 `apps/renderer/src/views/settings/SettingsView.vue` 的 `pages` 对象（约 28-34 行）加入：
```ts
   shortcuts: { component: markRaw(ShortcutsView), labelKey: 'settings.navShortcuts' as const },
```
并在顶部 import 区加入 `import ShortcutsView from './ShortcutsView.vue'`。

- [ ] **Step 6: 运行 lint**
```bash
bun run lint
```
期望：全绿。

- [ ] **Step 7: 提交**
```bash
git add apps/renderer/src/views/settings/ShortcutsView.vue apps/renderer/src/views/settings/SettingsView.vue apps/renderer/src/views/settings/settingsMenu.ts apps/renderer/src/router.ts packages/shared/src/i18n/messages.ts
git commit -m "feat(renderer): add Shortcuts settings page showing grouped shortcuts"
```

---

### Task 7: 构建与主进程冒烟验证

**Files:** 无新增文件。本任务做全量构建 + 手动冒烟。

- [ ] **Step 1: 全量构建**
```bash
bun run build
```
期望：所有包构建成功（shared → ipc-contract → renderer → main）。

- [ ] **Step 2: typecheck 全绿**
```bash
bun run lint:typecheck
```
期望：6 包 typecheck 全部 Exited with code 0。

- [ ] **Step 3: 手动冒烟（需运行应用）**
启动开发环境后打开 设置 → 快捷键，确认：
1. 出现「导航 / 标签 / 窗口 / 开发者工具」四个分组；
2. 共 9 条应用内快捷键，每条显示描述 + 「应用内」标签 + KbdKey 键位；
3. macOS 显示 `⌘F` / `⌘⇧T` 等符号；Windows/Linux 显示 `Ctrl+F` / `Ctrl+Shift+T`；
4. 「全局」分组显示「暂无全局快捷键」占位；
5. 切到其它设置子页再回来，数据仍正常（挂载拉取一次）。

- [ ] **Step 4: 若发现缺陷，修复并重新 lint 后补提交**
```bash
bun run lint
git add -p   # 只暂存本次修复
git commit -m "fix(shortcuts): <具体描述>"
```
