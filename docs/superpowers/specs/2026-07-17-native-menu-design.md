# NativeMenu 设计文档

## 概述

封装 Electron 原生 `Menu` API，为渲染器提供类型安全的菜单描述符 API。支持 checkbox、radio、多级子菜单，图标通过 Iconify 名称自动转换为 NativeImage。

与现有 `PopoverMenu` 并存：原生菜单用于上下文菜单（标签右键等需要 checkbox/radio 的场景），PopoverMenu 继续用于非菜单类 popover（地址栏建议、下载面板等）。

## 架构

```
渲染器                              主进程
─────                              ─────
new NativeMenu({ items, ... })
  ↓
.open(e)
  ↓
IPC: native-menu:open(menuId, items)
                                ↓
                    NativeIconManager.get(icon) → NativeImage (带缓存)
                    Menu.buildFromTemplate(template)
                    Menu.popup()
                                ↓
                    用户点击菜单项
                                ↓
IPC: native-menu:action { menuId, itemId }
  ↓
NativeMenu.onEvent('select', itemId)
  ↓
业务 handler 执行

用户点击菜单外部 / 按 Esc
                                ↓
                    menu.on('close', ...)
                    IPC: native-menu:closed(menuId)
  ↓
NativeMenu.onClose()
```

## 类型定义

### packages/ipc-contract/src/menu.ts

```ts
import type { NativeIconName } from './icon-names'

type NativeMenuItemType = 'item' | 'separator' | 'checkbox' | 'radio' | 'submenu'

interface NativeMenuItemDescriptor {
  id: string
  type?: NativeMenuItemType  // 默认 'item'
  label?: string
  icon?: NativeIconName      // Iconify 名称，如 'mdi:refresh'
  shortcut?: string          // 仅显示文本，如 'Cmd+R'
  enabled?: boolean          // 默认 true
  checked?: boolean          // checkbox/radio 用
  danger?: boolean           // 预留字段，Electron 原生菜单暂不支持自定义颜色
  children?: NativeMenuItemDescriptor[]  // submenu 递归
}
```

设计要点：
- 无 `click` 字段——主进程点击时把 `menuId + itemId` 发回渲染器，渲染器按 `id` 分发
- checkbox/radio 的 `checked` 由调用方每次传入最新状态，菜单不自行维护
- `icon` 字段类型为 `NativeIconName`，构建时从图标包生成联合类型，传错名字编译报错

### packages/ipc-contract/src/icon-names.d.ts（自动生成）

```ts
// 自动生成，请勿手动编辑
// 运行: bun run generate-icon-types
export type NativeIconName =
  | 'mdi:account-off'
  | 'mdi:bookmark'
  | 'mdi:refresh'
  | 'ic:round-plus'
  | 'carbon:overflow-menu-vertical'
  // ... 全部图标
```

## 渲染器 API

### apps/renderer/src/lib/native-menu.ts

```ts
interface NativeMenuOptions {
  items: NativeMenuItemDescriptor[]
  onEvent?: (eventName: string, eventData?: unknown) => void
  onClose?: () => void
  autoOpen?: boolean  // 默认 true，构造后立即弹出
}

class NativeMenu {
  private menuId = crypto.randomUUID()
  private opened = false

  constructor(private opts: NativeMenuOptions) {
    if (opts.onClose) {
      dismissCallbacks.set(this.menuId, opts.onClose)
    }
    if (opts.autoOpen !== false) this.open()
  }

  /** 弹出菜单，e 用于获取鼠标坐标定位菜单 */
  open(e?: MouseEvent): Promise<void>

  /** 关闭菜单 */
  close(): void

  get id(): string
}
```

### 全局 IPC 监听（模块级）

```ts
const eventMap = new Map<string, (eventName: string, eventData?: unknown) => void>()
const closeCallbacks = new Map<string, () => void>()

// 模块加载时注册一次
window.browserAPI.onNativeMenuAction((payload) => {
  eventMap.get(payload.menuId)?.('select', payload.itemId)
})

window.browserAPI.onNativeMenuClosed((menuId) => {
  eventMap.delete(menuId)
  closeCallbacks.get(menuId)?.()
  closeCallbacks.delete(menuId)
})
```

每个 `NativeMenu` 实例通过 `menuId` 路由到对应回调，全局只有这两个 IPC listener。

### 使用示例

```ts
new NativeMenu({
  items: [
    { id: 'pin', type: 'checkbox', label: '固定标签页', icon: 'mdi:pin', checked: tab.isPinned },
    { id: 'mute', type: 'checkbox', label: '静音网站', icon: 'mdi:volume-off', checked: tab.isMuted },
    { id: 'sep1', type: 'separator' },
    { id: 'close', label: '关闭标签页', icon: 'mdi:close', danger: true },
  ],
  onEvent: (event, itemId) => {
    if (event === 'select') {
      if (itemId === 'pin') pinTab(tab.id, !tab.isPinned)
      else if (itemId === 'mute') muteTab(tab.id, !tab.isMuted)
      else if (itemId === 'close') closeTab(tab.id)
    }
  },
  onClose: () => console.log('menu closed'),
})
```

## 主进程 API

### apps/main/src/native-icon-manager.ts

```ts
class NativeIconManager {
  /** 缓存：iconify name → NativeImage */
  private cache = new Map<string, Electron.NativeImage>()

  /**
   * 将 Iconify 图标名转换为 NativeImage
   * 流程: getIconData() → iconToSVG() → Buffer → nativeImage.createFromBuffer()
   */
  async get(name: string): Promise<Electron.NativeImage | undefined>

  /** 批量预热常用图标 */
  async warmup(names: string[]): Promise<void>
}
```

### apps/main/src/native-menu-manager.ts

```ts
class NativeMenuManager {
  private iconManager = new NativeIconManager()
  private win: BrowserWindow

  constructor(win: BrowserWindow)

  /**
   * 收到渲染器 open 请求后：
   * 1. 递归转换 descriptor → Electron MenuItemConstructorOptions[]
   * 2. icon: NativeIconManager.get(name) → NativeImage
   * 3. click: 通过 IPC 发 { menuId, itemId } 回渲染器
   * 4. submenu: 递归转换 children
   */
  async open(menuId: string, items: NativeMenuItemDescriptor[], position?: { x: number; y: number }): Promise<void>

  close(menuId: string): void
}
```

## IPC 通道

### 新增通道（ipc-contract）

```ts
interface IpcContract {
  // 渲染器 → 主进程
  'native-menu:open': (menuId: string, items: NativeMenuItemDescriptor[], position?: { x: number; y: number }) => Promise<void>
  'native-menu:close': (menuId: string) => Promise<void>

  // 主进程 → 渲染器（广播）
  'native-menu:action': (payload: { menuId: string; itemId: string }) => void
  'native-menu:closed': (menuId: string) => void
}
```

### 修改文件

| 文件 | 改动 |
|------|------|
| `packages/ipc-contract/src/channels.ts` | 新增 4 个 `native-menu:*` 通道 |
| `packages/ipc-contract/src/index.ts` | 导出新类型 |
| `apps/main/src/ipc/register.ts` | 注册 `native-menu:open/close` handler |
| `apps/main/src/preload.ts` | 暴露 `native-menu:*` API + `onNativeMenuAction/onNativeMenuClosed` 监听 |

## 图标类型生成

### scripts/generate-icon-types.ts

从已安装的图标包（`@iconify-json/mdi`、`@iconify-json/ic`、`@iconify-json/carbon`）提取所有图标名，生成 `NativeIconName` 联合类型到 `packages/ipc-contract/src/icon-names.d.ts`。

### dev.ts 集成

在开发启动时执行一次 `bunx tsx scripts/generate-icon-types.ts`，确保类型文件存在。

### 新增图标包时

安装图标包 → 在 `generate-icon-types.ts` 中添加包引用 → 重新运行脚本。

## 新增文件清单

| 文件 | 位置 | 职责 |
|------|------|------|
| `menu.ts` | `packages/ipc-contract/src/` | 类型定义 |
| `icon-names.d.ts` | `packages/ipc-contract/src/`（生成） | `NativeIconName` 联合类型 |
| `native-icon-manager.ts` | `apps/main/src/` | Iconify → NativeImage + 缓存 |
| `native-menu-manager.ts` | `apps/main/src/` | Menu.buildFromTemplate + IPC 路由 |
| `native-menu.ts` | `apps/renderer/src/lib/` | `NativeMenu` class |
| `generate-icon-types.ts` | `scripts/` | 图标类型生成脚本 |

## 接入策略

**首个接入点：TabBar.vue 右键菜单**

当前 TabBar 用 `DropdownMenu`（走 popover 面板），替换为 `NativeMenu`。

**后续逐步迁移**：网页右键、书签右键、历史右键等。PopoverMenu 继续用于非菜单 popover。
