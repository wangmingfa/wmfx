# Popover 双模式设计（overlay / bounded）

日期：2026-07-15

## 背景与动机

当前 `PopoverManager` 使用**唯一一个铺满整个窗口**的 WebContentsView（overlay 模式），
透明背景、永远置顶。这导致任何 popover 打开时都会**挡住整个应用**——用户无法在
popover 未关闭时点击其它区域（标签栏、页面内容等），体验差。

目标：新增 **bounded 模式**——WebContentsView 只覆盖 popover 自身内容区域（按内容动态测量
或按调用方给定固定尺寸），不挡应用其余部分；通过**失焦自动关闭**来 Dismiss。

两种模式并存，调用方可按场景选择：
- **overlay**：全屏、阻断交互（保留给确实需要阻断的场景 / 向后兼容）
- **bounded**：仅覆盖内容区、非阻断、失焦关闭

---

## 1. 模式与 API（ipc-contract）

`packages/ipc-contract/src/channels.ts` 扩展：

```ts
export type PopoverMode = 'overlay' | 'bounded'

export interface PopoverOpenOptions {
  type: PopoverType
  anchor: PopoverAnchor                 // rect / point / cursor（已支持 placement）
  data?: unknown
  mode?: PopoverMode                    // 默认 'overlay'
  size?: { width: number; height: number }  // 仅 bounded：固定尺寸；省略则由面板测量内容动态决定
}

// 新增：面板 → 主进程，上报测量到的内容尺寸
'popover:measure': (popoverId: string, size: { width: number; height: number }) => void

// 修改：popover:render 增加 mode 参数（见第 3 节透传链路）
'popover:render': (
  popoverId: string,
  type: PopoverType,
  anchor: PopoverAnchor,
  data?: unknown,
  mode?: PopoverMode
) => void
```

- `type` 决定"渲染什么内容"（menu / addressbar）
- `mode` 决定"怎么定位 / 尺寸 / 是否挡应用"
- 两者**正交组合**：`addressbar+bounded`、`menu+bounded`、`menu+overlay` 等

---

## 2. 主进程 PopoverManager（bounded 流程）

### 状态扩展
`OverlayState` 增加 `mode: PopoverMode`（默认从 `options.mode` 取，缺省 `'overlay'`）。

### 两趟定位（bounded）
1. `open()` → 把 `mode` 存入 `OverlayState` → 临时显示 view（先按 anchor 估算一个位置/尺寸，或复用上一次尺寸）→ 发 `popover:render(id, type, anchor, data, mode)`
2. 面板渲染后测量 `.popover-box` 实际尺寸 → 发 `popover:measure(id, {width,height})`
3. 主进程收到 `popover:measure` → 用 `anchor + placement + 光标位置 + 窗口尺寸` 计算最终 bounds → `setBounds` 精确定位（view 变为内容尺寸、定位于锚点旁）
4. 内容动态变化（地址栏建议列表增减）→ 面板用 `ResizeObserver` 重新发 `popover:measure` → 主进程 resize + 重新夹紧到窗口内

坐标处理：
- `rect` 锚点：`getBoundingClientRect()` 已是窗口局部坐标，直接用
- `point` / `cursor` 锚点：光标屏幕坐标 `screen.getCursorScreenPoint()` − 窗口 content bounds = 窗口局部坐标
- 最终 bounds 用现有 `computeBoxPosition` 逻辑（下沉到主进程侧）计算并夹紧进窗口

### 失焦关闭（bounded）
`open()` 时对 `popoverView.webContents` 挂 `blur` 监听：失焦即 `close(stack[stack.length-1])`。
overlay 模式不挂此监听。注意 `renderTop()` 中 `webContents.focus()` 不会触发误关（blur 仅在
焦点**离开** view 时触发）。多个 bounded popover 入栈时，blur 关闭栈顶。

### renderTop 分支（避免首帧抖动 / 位置闪烁）
- `mode === 'overlay'`：保持现有 `setBounds({x:0,y:0,width,height})` 铺满窗口 + focus
- `mode === 'bounded'`：**首帧移到屏幕外但保持可见**——`setVisible(true)` +
  `setBounds({x:-10000, y:-10000, width:tempW, height:tempH})`，仅渲染 DOM 供测量。
  注意：**不能用 `setVisible(false)` 来隐藏**——Electron 在 view 不可见时可能挂起
  webContents 渲染，`offsetWidth/offsetHeight` 会返回 0 / 过期值，导致测量失败。保持
  `setVisible(true)` + 屏幕外坐标，DOM 必然正常 layout，测量准确，且用户看不到（无闪烁）。
  收到 `popover:measure` 回执后 `setBounds(最终位置/尺寸)`（原子移动到正确位置）+ `focus()`。
  内容动态变化（建议列表增减）时 view 已可见，主进程直接 resize，无需再隐藏。

---

## 3. mode 透传链路（关键）

`mode` 必须显式传到**前端面板代码**，因为不同模式在前端渲染方式完全不同：

| 环节 | 改动 |
|------|------|
| `PopoverOpenOptions.mode` | 调用方传入（见第 1 节） |
| `OverlayState` | 增加 `mode` 字段 |
| `popover:render` 载荷 | 增加第 5 参数 `mode` |
| `preload.onPopoverRender` | 回调签名增加 `mode` 参数并透传 |
| `PanelRoot.onRender` | 签名增加 `mode`，存入 `currentMode` ref |
| `PanelRoot` 渲染 | 按 `currentMode` 分支：overlay 走内部定位+backdrop；bounded 走 100% 充满+测量上报 |

即：`popover-manager.open()` → `send('popover:render', id, type, anchor, data, mode)` →
`preload` 透传 → `PanelRoot.onRender(id, type, anchor, data, mode)` → `currentMode.value = mode`。

前端拿到 `mode` 后才能决定：是否渲染 `.popover-backdrop`、`.popover-box` 是内部绝对定位还是
`position:static; width:100%; height:100%` 充满、是否要 `ResizeObserver` 测量上报。

---

## 4. 面板（renderer）渲染分支

### bounded 模式
- 去掉全屏 `.popover-layer` / `.popover-backdrop`（无 backdrop，点击外面由主进程 blur 关闭）
- `.popover-box` 用 `width: max-content`（未约束宽度时）/ 受 `size` 约束时取指定宽度，
  **自然贴合内容尺寸**而非 100% 充满 view。原因：测量阶段 view 还是临时尺寸，若 box 取 100%
  会量到 view 尺寸而非内容真实尺寸；`max-content` 保证无论 view 多大都量到内容真实尺寸。
  主进程把 view 设为该尺寸后，view 与内容一致，等效于"网页 100% 宽高直接显示"。
  （若调用方传 `size.width` 则 box 取该宽度、高度仍按内容；传完整 `size` 则直接固定。）
- 渲染完成后在 `nextTick` 测量 `.popover-box.offsetWidth/offsetHeight` → 发 `popover:measure`
- 用 `ResizeObserver` 监听 `.popover-box` 尺寸变化（建议列表增减）→ 重新发 `popover:measure`
- 不再做内部 `computeBoxPosition` 定位（定位由主进程对 WebContentsView 做）

### overlay 模式
- 保持现有行为：全屏 layer + backdrop + 内部 `computeBoxPosition` 定位 `.popover-box`

### onRender 伪代码
```ts
function onRender(popoverId, type, anchor, data, mode) {
  currentMode.value = mode ?? 'overlay'
  // ... 现有 type/data/anchor 赋值 ...
  nextTick(() => {
    if (currentMode.value === 'bounded') {
      const el = boxRef.value
      popoverMeasure(popoverId, { width: el.offsetWidth, height: el.offsetHeight })
    } else {
      // 现有内部定位逻辑
    }
  })
}
```

---

## 5. 各调用方梳理结果

| 调用方 | 模式 | 说明 |
|--------|------|------|
| 地址栏 AddressBar | **bounded** | 测量 input+建议区尺寸，WebContentsView 覆盖在输入框上（保留"覆盖输入框"效果），但不挡标签栏等其它区域；建议列表增减时动态 resize |
| AppMenu / TabBar 右键菜单 | **bounded** | 测量菜单内容尺寸，定位在按钮附近，失焦关闭，不挡应用 |
| 其它未来 popover | 按需选 | overlay 保留为可选兼容模式 |

> 地址栏的"覆盖输入框"效果在 bounded 下依然成立：WebContentsView 尺寸=input+建议区，
> 定位在输入框 top-left，仅覆盖该区域，其余区域（标签栏、页面）可点击。

---

## 6. 数据流与边界

- 新增 IPC：`popover:measure`（面板→主进程，`(id, size) => void`）
- `popover:render` 增加 `mode` 参数（透传链路见第 3 节）
- 坐标转换：cursor 屏幕坐标 − 窗口 content bounds = 窗口局部坐标
- 窗口 resize：overlay 仍重渲染栈顶；bounded 重新 `popover:measure` + 重定位并夹紧
- `blur` 关闭仅作用于 bounded；overlay 仍依赖 backdrop 点击 / Esc 关闭
- 多 popover 入栈：bounded 与 overlay 可混栈，按各自模式处理栈顶

---

## 7. 测试

- 单测：把 `computeBoxPosition` 下沉为主进程可复用函数后，测各 placement 计算 + 窗口内夹紧
- 单测：`popover:measure` 触发后 `setBounds` 尺寸/位置正确
- E2E：地址栏聚焦 → popover 覆盖输入框、但不挡标签栏；点击标签栏可切换且 popover 失焦关闭
- E2E：菜单打开 → 不挡应用；点击应用其它区域 → 失焦关闭；建议列表增减 → 尺寸动态调整
- E2E：窗口 resize 后 bounded popover 重定位并夹紧在窗口内
