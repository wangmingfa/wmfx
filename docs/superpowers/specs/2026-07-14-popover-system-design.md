# Popover 浮动面层系统 设计规格

- 日期：2026-07-14
- 状态：待实现
- 关联里程碑：M3 代理之后，浏览器外壳打磨（浮层遮挡修复）

## 1. 背景与问题

当前 ChromeUI（TabBar、三点菜单等）渲染在窗口的**基础 webContents** 中。每个标签页的内容是一个 `WebContentsView` 子视图，通过 `setBounds` 覆盖在 Viewport 区域之上。Electron 中，**子视图永远绘制在基础 webContents 之上**。

标签右键菜单、三点下拉都在顶部栏向下展开，恰好落在 `WebContentsView` 的区域内，因此被标签页内容遮挡，无法点击。

目标：建立一个**通用浮层系统（Popover）**，所有需要浮在标签页之上的弹出 UI（标签右键菜单、三点下拉，未来命令面板 / 查找框等）都通过它渲染，且永不被遮挡。

## 2. 方案概述

采用**单个共享的 overlay `WebContentsView`**（`popoverView`），作为 `window.contentView` 的子视图，始终通过 `setTopBrowserView` 保持在标签视图之上。它本身透明，内部包含一个**全窗口透明背景层**（捕获"点击外部"）和一个**定位的菜单盒子**。所有 popover 都复用这同一个视图，通过 IPC 传入不同的描述符（descriptor）切换内容。

命名定为 **Popover**（前端对"锚定触发元素的浮动面层"的标准叫法）。

## 3. 架构

```
┌─ 主进程 (apps/main) ───────────────────────────────┐
│  PopoverManager                                      │
│   - 持有 popoverView (transparent WebContentsView)   │
│   - overlays: Map<popoverId, {anchor, descriptor}>   │
│   - stack: string[]  (可见顺序，栈顶=当前)           │
│   - open / close / select / renderTop                │
└───────────────┬───────────────────┬──────────────────┘
     popover:*  │                   │  popover:* (event)
   (invoke)     │                   │
        ┌───────▼────────┐    ┌─────▼──────────┐
        │ 基础渲染进程    │    │ 面板渲染进程     │
        │ (ChromeUI)     │    │ (panel.html)    │
        │ lib/popover.ts │    │ PanelRoot.vue   │
        │ TabBar.vue ... │    │ 渲染菜单/子菜单  │
        └────────────────┘    └─────────────────┘
```

- **主进程** `PopoverManager`：拥有唯一 `popoverView`（webPreferences `transparent:true`，加载 `wmfx://panel`），负责定位、置顶、按 `popoverId` 路由。
- **面板渲染进程**（`panel.html` → `PanelRoot.vue`）：监听 `popover:render` 渲染菜单，处理 Esc / 背景点击 → `popover:dismiss`，点击叶子项 → `popover:select`。
- **基础渲染进程**（ChromeUI）：菜单*定义*与*动作处理*都在这里。通过 `lib/popover.ts` 的 `Popover` class 打开，接收 `popover:action` 回传。

## 4. 类型定义（加入 `packages/ipc-contract/src/channels.ts`）

```ts
export type PopoverKind = 'menu' // 后续扩展 'command-palette' | 'panel'

export type PopoverPlacement =
  | 'bottom-start' | 'bottom-end'
  | 'top-start' | 'top-end'
  | 'right-start' | 'left-start'

/** 锚点：触发元素的窗口局部坐标，getBoundingClientRect 直传 */
export type PopoverAnchor =
  | { type: 'rect';   rect: ViewBounds; placement?: PopoverPlacement }
  | { type: 'point';  x: number; y: number; placement?: PopoverPlacement }
  | { type: 'cursor'; placement?: PopoverPlacement } // 主进程 screen.getCursorScreenPoint() 减窗口位置

export type MenuItemType = 'item' | 'separator' | 'submenu' // checkbox 后期扩展

/** 菜单项：纯数据描述，动作靠 id 路由，不携带函数（IPC 不可序列化函数） */
export interface MenuItem {
  id: string
  type?: MenuItemType          // 默认 'item'
  label?: string
  icon?: string                // 图标名，复用现有 Icon 组件
  shortcut?: string
  accessKey?: string           // 单字符助记符（如 'A'）；面板打开期间的临时触发键
  disabled?: boolean
  danger?: boolean             // 危险操作红色样式（如关闭标签页）
  children?: MenuItem[]        // submenu -> 递归即多级菜单
}

export interface PopoverDescriptor {
  id: string                   // 逻辑菜单 id，如 'tab-context' / 'app-menu'
  kind: PopoverKind
  items: MenuItem[]
}

/** 动作回调接收的参数 */
export interface PopoverActionPayload {
  menu: MenuItem
  context: { close: () => void }
}
```

## 5. IPC 契约（加入 `IpcContract`）

```ts
// 基础渲染进程 -> 主进程（invoke）
'popover:open':   (popoverId: string, anchor: PopoverAnchor, descriptor: PopoverDescriptor) => void
'popover:close':  (popoverId: string) => void
// 面板渲染进程 -> 主进程（invoke）
'popover:select': (popoverId: string, itemId: string) => void
// 主进程 -> 面板渲染进程（event）
'popover:render':  (popoverId: string, descriptor: PopoverDescriptor, anchor: PopoverAnchor) => void
'popover:dismiss': (popoverId: string) => void
// 主进程 -> 基础渲染进程（event）
'popover:action':  (payload: { popoverId: string; menu: MenuItem }) => void
```

同步更新 `IPC_CHANNELS` 数组与 `preload.ts` 的监听：`onPopoverRender`、`onPopoverDismiss`（面板侧）、`onPopoverAction`（基础侧）。preload 两渲染进程共用，各自只订阅所需事件。

## 6. 渲染进程用户 API（`apps/renderer/src/lib/popover.ts`）

封装为 **`Popover` class**：构造时传入配置，调用方只依赖 `new Popover(...)` / `open()` / `close()` 这一稳定接口；preload 的 `browserAPI.popover*` 调用全部藏在类内部。这样后期若更换底层实现（如不再用独立 `WebContentsView`），**调用处代码无需改动**。

采用**唯一 id + Map** 路由：每个实例有自己的 `popoverId`，`onAction` 存入模块级 `Map`；主线程只负责按 id 路由，不持有回调（函数无法跨 IPC）。

```ts
const actionMap = new Map<string, (menu: MenuItem) => void>()

// 模块加载时注册一次：主线程回传 popoverId + menu，分发到对应实例
window.browserAPI.onPopoverAction(({ popoverId, menu }) => {
  actionMap.get(popoverId)?.(menu)
})

export interface PopoverOptions {
  anchor: PopoverAnchor
  descriptor: PopoverDescriptor
  onAction: (p: PopoverActionPayload) => void
  autoOpen?: boolean // 默认 true：构造后自动 open；设为 false 时需手动调用 open()
}

export class Popover {
  private popoverId = crypto.randomUUID()
  private opened = false

  constructor(private opts: PopoverOptions) {
    if (opts.autoOpen !== false) this.open()
  }

  open(): void {
    if (this.opened) return
    // 注册回调用例：context.close 指向本实例 close()
    actionMap.set(this.popoverId, (menu) =>
      this.opts.onAction({ menu, context: { close: () => this.close() } }),
    )
    window.browserAPI.popoverOpen(this.popoverId, this.opts.anchor, this.opts.descriptor)
    this.opened = true
  }

  close(): void {
    if (!this.opened) return
    actionMap.delete(this.popoverId)
    window.browserAPI.popoverClose(this.popoverId)
    this.opened = false
  }
}
```

调用方：

```ts
// autoOpen 默认为 true：构造即打开，无需手动 open()
const popover = new Popover({
  anchor: { type: 'point', x: e.clientX, y: e.clientY },
  descriptor,
  onAction: ({ menu, context }) => {
    if (menu.id === 'close') closeTab(menu.id)
    context.close() // 收起 popover
  },
})
// 此处 popover 已打开；后续需要时可：popover.close()

// 若要延迟打开，显式关闭自动打开：
const lazy = new Popover({
  anchor,
  descriptor,
  onAction,
  autoOpen: false, // 构造时不打开
})
// ... 某个时机再：
lazy.open()
```

支持同时打开多个 popover（id 隔离），当前仅"同时显示一个"，但路由与生命周期已按 id 完全隔离，扩展无需改接口。

## 7. 主进程 `PopoverManager`（`apps/main/src/popover-manager.ts`）

```ts
class PopoverManager {
  private popoverView: WebContentsView      // transparent, 加载 wmfx://panel
  private overlays = new Map<string, { anchor: PopoverAnchor; descriptor: PopoverDescriptor }>()
  private stack: string[] = []              // 可见顺序，栈顶=当前面板

  open(popoverId: string, anchor: PopoverAnchor, descriptor: PopoverDescriptor): void {
    this.overlays.set(popoverId, { anchor, descriptor })
    this.stack.push(popoverId)
    this.renderTop()
  }

  private renderTop(): void {
    const id = this.stack[this.stack.length - 1]
    const ov = this.overlays.get(id)!
    const { width, height } = this.window.getContentBounds()
    this.popoverView.setBounds({ x: 0, y: 0, width, height })
    this.popoverView.setVisible(true)
    this.window.contentView.setTopBrowserView(this.popoverView)
    this.popoverView.webContents.send('popover:render', id, ov.descriptor, ov.anchor)
  }

  select(popoverId: string, itemId: string): void {  // panel -> main
    const ov = this.overlays.get(popoverId)
    const menu = ov ? findMenuItem(ov.descriptor.items, itemId) : null
    if (menu) this.window.webContents.send('popover:action', { popoverId, menu })
    this.close(popoverId)
  }

  close(popoverId: string): void {
    this.overlays.delete(popoverId)
    this.stack = this.stack.filter(id => id !== popoverId)
    if (this.stack.length) this.renderTop()
    else this.popoverView.setVisible(false)
  }

}

function findMenuItem(items: MenuItem[], id: string): MenuItem | null {
  for (const it of items) {
    if (it.id === id) return it
    if (it.children) { const r = findMenuItem(it.children, id); if (r) return r }
  }
  return null
}
```

主进程只负责把 `popoverView` 铺满窗口并置顶，**不估算菜单盒子尺寸**——盒子尺寸需渲染后测量，见 §8「测量后定位」。

## 8. 面板渲染进程（`apps/renderer/panel.html` + `src/panel/main.ts` + `PanelRoot.vue`）

- `PanelRoot.vue` 监听 `popover:render(popoverId, descriptor, anchor)`，保存 `currentPopoverId`。

### 测量后定位（避免预估尺寸误差）

1. 首次渲染菜单盒子时，先以 `visibility: hidden`（或 `opacity: 0`）挂载，**不显示**。
2. `onMounted` / `nextTick` 后测量盒子真实尺寸 `getBoundingClientRect()`。
3. 结合 `anchor`（rect/point/cursor 已是窗口局部坐标）+ `placement` + `window.innerWidth/innerHeight`，算出最终 `left/top`，并做边界收敛（右侧溢出左移、底部溢出上翻）。
4. 应用最终定位，再将盒子切到 `visibility: visible`。

因 `popoverView` 铺满窗口、盒子定位在面板 DOM 内，定位全程在面板渲染进程内闭环完成，无需额外 IPC 回传尺寸。

- 渲染 `MenuItem[]`：
  - `separator` → 分隔线
  - `submenu` → 右侧箭头，hover 时本地展开嵌套 flyout（**不**走 IPC）
  - `item` → 点击走 `popover:select(popoverId, id)`
  - `disabled` → 不可点
  - `danger` → 红色样式
  - `shortcut` → **纯展示文本**，渲染在菜单项右侧（如 `Ctrl+T`），提示该项在应用内有全局快捷键；popover 系统**不绑定、不拦截**该全局快捷键，真正的绑定在 popover 之外。若某项需键盘触发，由调用方另行注册快捷键后 `new Popover(...).open()`。
  - `accessKey` → **面板打开期间的临时触发键**（如 `A`）；popover 自行处理：面板打开时监听 `keydown`，按键（忽略大小写）匹配某项 `accessKey` 即 `popover:select(popoverId, id)`。`Alt` 键切换下划线显隐（Windows 风格：平时隐藏，按 Alt 显示助记符下划线）；按键直接触发不受 Alt 影响。
- **键盘导航（方向键）**：popover 打开期间支持方向键，激活态由 `PanelRoot` 集中管理（`activePath: string[]` 记录已展开的子菜单链，`activeIndex` 记录当前层可选中项索引）：
  - `↑` / `↓`：在当前层可选中项（跳过 `separator`）间循环移动 `activeIndex` 并高亮。
  - `→`：若当前项为 `submenu`，将其 id 压入 `activePath`，聚焦首项（进入下一级）。
  - `←`：若 `activePath` 非空，弹出末级并聚焦刚离开的子菜单项（回到上一级）；根层级无操作。
  - `Enter` / `Space`：若当前项为 `submenu` 等同 `→`，否则触发 `popover:select`。
  - 鼠标 `hover` 经同一状态机（`pathToItem` 解析该项在菜单树中的祖先链，统一设置 `activePath`/`activeIndex`），与键盘共享高亮与子菜单展开逻辑。
  - 纯函数 `getLevelItems` / `getSelectable` / `selectableIndexOf` / `pathToItem`（位于 `panel/navigation.ts`）可单测。
- 背景层：全窗口透明 `div` 覆盖，`@click` → `popover:dismiss(popoverId)`。
- Esc 键 → `popover:dismiss(popoverId)`。
- 复用主题 CSS 变量与现有 `Icon` 组件，保证视觉一致。

## 9. 构建变更（Vite 多入口）

- `apps/renderer/panel.html` 新增入口，挂载 `src/panel/main.ts` → `PanelRoot.vue`。
- Vite 配置增加 `panel` 入口（与现有 `index` 并列）。
- `internal-url.ts` 的 `loadInternalView` 复用：为 `popoverView` 加载 `wmfx://panel`。
- preload 对 `popoverView` 同样 `exposeInMainWorld('browserAPI', ...)`。

## 10. 迁移范围（第一阶段）

将 `apps/renderer/src/components/TabBar.vue` 的两处 HTML 菜单改为 Popover 驱动：

- **标签右键菜单**：`onTabContextMenu` 中计算触发元素 `getBoundingClientRect()`，构造 `PopoverDescriptor`（含 `submenu` 多级"更多"示例），`new Popover({ anchor, descriptor, onAction })` 后 `open()`，`onAction` 内按 `menu.id` 分发到现有处理函数（`newTabToRight` / `reloadTab` / `togglePin` / `closeTab` / `closeOthers` / `closeRight` / `closeLeft` 等），`context.close()` 收起。
- **三点菜单**：`toggleAppMenu` 改为 `new Popover(...).open()`，锚点用三点按钮 `rect` + `placement: 'bottom-end'`（右上角防止右溢出）。

现有内联 `<div class="tab-context-menu">` / `<div class="app-menu-dropdown">` 及相关 `v-if` 状态删除，改为 Popover 渲染。

## 11. 测试

- E2E（Playwright）：打开标签右键菜单 / 三点菜单，断言菜单元素位于 popover 的 webContents 中且**不被遮挡**（验证点击菜单项能生效、而非被底层页面吞掉）；验证 Esc / 背景点击可关闭；验证多级 submenu 展开。
- 单元（Vitest）：`findMenuItem` 递归解析、面板测量后边界收敛逻辑、`getLevelItems`/`pathToItem` 等导航纯函数、渲染进程 `actionMap` 按 `popoverId` 路由。

## 12. 扩展点

- `stack` 已为多 popover 预留：子菜单/嵌套面板只需 `new Popover(...).open()` 新 `popoverId` 入栈，面板渲染栈顶即可。
- `PopoverKind` 已预留 `'command-palette'` / `'panel'`，同一套定位/关闭机制可承载命令面板、查找框。

## 13. 不做的事（YAGNI）

- 不引入独立 `BrowserWindow` 作为浮层。
- 不实现 per-menu 独立 `WebContentsView`（单实例视图 + id 路由已足够）。
- 不实现透明背景层的"穿透点击"（菜单打开期间整体模态，符合下拉惯例）。
