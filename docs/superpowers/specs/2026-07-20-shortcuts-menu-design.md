# 快捷键菜单设计（Shortcuts Menu）

> 状态：设计稿（待 writing-plans 拆实现任务）
> 日期：2026-07-20

## 1. 背景与目标

.settings 页需要新增一个「快捷键」子页，集中展示应用所有快捷键，分「应用内」与「全局」两类。

### 现状调研（关键事实）
- 快捷键当前硬编码在 `apps/main/src/index.ts:110-196` 的 `wireWindowShortcuts` 中，共 9 个，每个只传 `accelerator` 字符串，**无名称/描述/分组/作用域元数据**。
- 全部走 `registerAppShortcut`（窗口焦点型，失焦自动 unregister），**目前无真正的常驻全局快捷键**。
- `packages/ipc-contract/src/channels.ts` 与 preload 中**无**「列举快捷键」通道。
- 设置页结构清晰：`SettingsView.vue` 用 `settingsMenu.ts` 配置左侧导航 + 路由段驱动子页，加子页只需路由 + menu + pages 三处各加一项。

### 目标
- 建立中心化快捷键注册表（SSOT），把分散的快捷键定义与元数据统一管理。
- 设置页新增只读「快捷键」子页，按分组展示所有快捷键，键位按平台本地化，标注作用域（应用内/全局）。

## 2. 范围（已确认）

| 项 | 决定 |
|----|------|
| 菜单范围 | 应用内（现有 9 个）+ 架构支持全局分组；本次**不新增任何全局快捷键**，全局分组显示「暂无」 |
| 交互 | **只读展示**，不支持重绑定 |
| 全局能力 | 注册表预留 `scope:'global'` 字段与菜单空分组，**不实际注册全局快捷键** |
| 键位样式 | Kbd 按键样式 + 按平台本地化（macOS ⌘/⌥/⇧，Win/Linux Ctrl/Alt/Shift） |
| 数据来源 | 主进程注册表 SSOT + 新增 IPC `shortcuts:list`，渲染端挂载时拉一次 |

## 3. 方案选型（已确定：方案 A）

- **方案 A（采用）**：主进程中心化注册表 + IPC 列举。单一数据源，菜单永远与实际声明一致；为全局能力铺路。
- 方案 B（否决）：渲染端硬编码清单。两处维护、易漂移、违反 SSOT。
- 方案 C（否决）：运行时从 `globalShortcut.isRegistered` 探测。焦点型快捷键会随失焦变化，结果不稳定。

## 4. 设计详情

### 4.1 主进程快捷键注册表（SSOT）

新建 `apps/main/src/shortcut-registry.ts`：

```ts
export type ShortcutScope = 'in-app' | 'global'
export type ShortcutGroup = 'navigation' | 'tab' | 'window' | 'devtools'

export interface ShortcutDef {
  id: string                                      // 稳定标识
  accelerator: string                             // Electron 格式: 'CmdOrCtrl+F'
  scope: ShortcutScope
  group: ShortcutGroup
  description: { 'zh-CN': string; 'en-US': string }  // 双语，SSOT，不拆到 i18n
}

// 数组元素按字段纵向对齐，便于阅读
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

- **注册表是纯元数据 SSOT**；注册行为（action 回调）仍闭环在 `index.ts`，按 `id` 分发，不泄漏窗口实例逻辑进注册表文件。
- `wireWindowShortcuts` 改为遍历 `SHORTCUT_REGISTRY.filter(s => s.scope==='in-app')`，按 `id` 调用对应 action。
- `scope:'global'` 本次为空；未来加全局快捷键时由独立全局注册路径（`globalShortcut.register` + 退出时 `unregisterAll`）消费，菜单自动归类。
- **代码风格**：数组元素按字段纵向对齐书写。注意 biome 默认格式化只保证单个对象内对齐、不会维护跨数组元素的列对齐；若 `bun run lint:ts` 重排，以 biome 接受形式收敛，但首次提交尽量保留对齐。

### 4.2 IPC 通道与数据获取

- `packages/ipc-contract/src/channels.ts` 新增：
  ```ts
  shortcuts: { list: void }   // 渲染端请求 → 主进程返回 ShortcutDef[] 元数据
  ```
- `ipc-contract` 定义结构相同的 `ShortcutInfo` 接口（渲染端消费类型，与主进程 `ShortcutDef` 隔离）。
- `apps/main/src/ipc/register.ts` 新增 handler：
  ```ts
  ipcMain.handle('shortcuts:list', () => SHORTCUT_REGISTRY)
  ```
  纯元数据，无回调、无窗口引用，安全。
- preload 暴露 `getShortcuts(): Promise<ShortcutInfo[]>`，加入 `window.browserAPI`。
- 渲染端 `ShortcutsView`：`onMounted` 调 `getShortcuts()`，按 `group` 分组渲染；快捷键运行时不变，挂载拉一次即可。

### 4.3 渲染层：ShortcutsView + KbdKey

新增 `apps/renderer/src/views/settings/ShortcutsView.vue`：
- `onMounted` → `getShortcuts()` → 按 `group` 归组，顺序固定：`navigation` → `tab` → `window` → `devtools`。
- 复用现有 `Section` / `SectionItem`（与设置页其它子页一致）：每个 group 一个 `Section`，每条一个 `SectionItem`。
  - `#label`：描述（按当前语言取 `description`）+ 作用域标签（「应用内」/「全局」）。
  - 控件区：`<KbdKey :accelerator="s.accelerator" />`。
- **全局分组为空**时：渲染一个 Section 显示「暂无全局快捷键」。

新增 `apps/renderer/src/components/KbdKey.vue`（或 `formatAccelerator` util）：
- 平台本地化：`process.platform === 'darwin'` 时 `CmdOrCtrl`→`⌘`、`Ctrl`→`⌃`、`Alt`→`⌥`、`Shift`→`⇧`；否则 `CmdOrCtrl`→`Ctrl`，显示 `Ctrl+F` / `Ctrl+Shift+T`。
- 每个修饰键渲染为 `<kbd>` 小方块（圆角、浅底、等宽），纯 CSS。
- `description` 双语对象直接存注册表、不进 i18n（SSOT）；渲染端按当前语言取。

### 4.4 设置页接入

- `apps/renderer/src/router.ts`：`/settings/shortcuts` → `SettingsView`。
- `settingsMenu.ts`：新增 `{ key:'shortcuts', labelKey:'settings.navShortcuts', icon:'mdi:keyboard', to:'/settings/shortcuts' }`。
- `SettingsView.vue`：`pages` 增加 `shortcuts: { component: markRaw(ShortcutsView), labelKey:'settings.navShortcuts' }`。
- i18n `messages.ts` 新增：`settings.navShortcuts`（快捷键 / Shortcuts）、`shortcuts.scopeInApp`（应用内 / In-app）、`shortcuts.scopeGlobal`（全局 / Global）、`shortcuts.emptyGlobal`（暂无全局快捷键 / No global shortcuts）。

### 4.5 改动文件清单

新增：`shortcut-registry.ts`、`ShortcutsView.vue`、`KbdKey.vue`
修改：`index.ts`、`ipc/register.ts`、`preload.ts`、`channels.ts`、ipc-contract（ShortcutInfo）、`router.ts`、`settingsMenu.ts`、`SettingsView.vue`、`messages.ts`

### 4.6 暂不做的（YAGNI）

- 实际注册全局快捷键（仅留字段与空分组）
- 快捷键重绑定/编辑
- 运行时变更订阅

### 4.7 已知边界

- 注册表是「声明源」：菜单反映声明，不反映「是否真的注册成功」。若有人在 `index.ts` 删了 action 却忘了更新注册表，菜单仍会显示该快捷键。
- **团队公约**：改/增/删快捷键必须同步更新 `SHORTCUT_REGISTRY`（写进 spec 与代码注释）。

### 4.8 测试与验证

- `bun run lint` 全绿（biome / eslint / typecheck）。
- 手动验证：设置 → 快捷键，确认 9 条应用内快捷键按 4 分组展示、键位按平台显示、作用域标签正确；全局分组显示「暂无全局快捷键」。
- 主进程无单测新增（注册表为静态数据）。可选 E2E 断言「设置页存在快捷键子页」（依项目惯例）。

## 5. 后续（不在本次范围）

- 新增真正的常驻全局快捷键（需退出时 `unregisterAll`）。
- 快捷键重绑定（持久化到 electron-store）。
