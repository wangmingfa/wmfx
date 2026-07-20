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
  /** true = 设置页不展示，快捷键仍生效（面向开发者的内部快捷键） */
  hidden?: boolean
}

export const SHORTCUT_REGISTRY: ShortcutDef[] = [
  {
    id:           'find',
    accelerator:  'CmdOrCtrl+F',
    scope:        'in-app',
    group:        'navigation',
    description:  { 'zh-CN': '查找', 'en-US': 'Find in page' },
  },
  {
    id:           'focus-url',
    accelerator:  'CmdOrCtrl+L',
    scope:        'in-app',
    group:        'navigation',
    description:  { 'zh-CN': '聚焦地址栏', 'en-US': 'Focus address bar' },
  },
  {
    id:           'devtools-page',
    accelerator:  'F12',
    scope:        'in-app',
    group:        'devtools',
    description:  { 'zh-CN': '页面开发者工具', 'en-US': 'Page DevTools' },
  },
  {
    id:           'devtools-app',
    accelerator:  'CmdOrCtrl+F12',
    scope:        'in-app',
    group:        'devtools',
    description:  { 'zh-CN': '应用开发者工具', 'en-US': 'App DevTools' },
    hidden:       true,
  },
  {
    id:           'close-tab',
    accelerator:  'CmdOrCtrl+W',
    scope:        'in-app',
    group:        'tab',
    description:  { 'zh-CN': '关闭标签页', 'en-US': 'Close tab' },
  },
  {
    id:           'reload',
    accelerator:  'F5',
    scope:        'in-app',
    group:        'navigation',
    description:  { 'zh-CN': '重新加载', 'en-US': 'Reload' },
  },
  {
    id:           'reopen-tab',
    accelerator:  'CmdOrCtrl+Shift+T',
    scope:        'in-app',
    group:        'tab',
    description:  { 'zh-CN': '恢复关闭的标签页', 'en-US': 'Reopen closed tab' },
  },
  {
    id:           'new-incognito',
    accelerator:  'CmdOrCtrl+Shift+N',
    scope:        'in-app',
    group:        'window',
    description:  { 'zh-CN': '新建无痕窗口', 'en-US': 'New incognito window' },
  },
  {
    id:           'new-window',
    accelerator:  'CmdOrCtrl+N',
    scope:        'in-app',
    group:        'window',
    description:  { 'zh-CN': '新建窗口', 'en-US': 'New window' },
  },
]
