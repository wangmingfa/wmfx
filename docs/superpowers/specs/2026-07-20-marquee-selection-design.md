# 文件浏览器：鼠标框选（Marquee Selection）设计

日期：2026-07-20（修订：按选中态分语义 + draggable 下沉/提升）
状态：已确认，待实现

## 背景与目标

文件浏览器（FilesView.vue）当前支持：单击/Ctrl/Shift 选择、右键菜单、原生 HTML5 文件拖拽（移动/复制）。
用户希望增加**鼠标框选（rubber-band / marquee selection）**，在文件列表上拖拽出矩形选区快速选中一批连续的文件/文件夹。

核心约束：**框选的交互（mousedown→move）与原生文件拖拽（mousedown→move）冲突**。本设计按「触发位置 + 当前行是否选中」分层解耦，与 Windows 资源管理器行为一致。

## 行为模型（参照 Windows 资源管理器）

拖拽 vs 框选的区分取决于**鼠标按下时所在位置，以及该行/项是否已选中**：

- **已选中行/项（selected）**：整行/整块任意位置按下拖动 → **拖拽**（拖这一批已选中的文件）。
- **未选中行/项（non-selected）**：
  - 点在**文字/内容**（图标块、文件名等实际渲染区）→ **拖拽**（拖这一个文件）。
  - 点在行/项内**其它空白**（列间大段空白、grid gap、单元格 padding 外区域）→ **框选**。

即：**已选中 = 整行可拖；未选中 = 文字拖、空白框选**。

## 实现手段：draggable 动态下沉 / 提升

原生 HTML5 拖拽的触发看的是「mousedown 是否落在 `draggable="true"` 的元素上」。利用这一点实现上述模型：

### 图标视图（icon）
- `.file-item`（整块）`draggable` 动态绑定：`:draggable="isSelected(file.path)"`。
  - 已选中 → 整块 `draggable=true` → 整块可拖 ✅
  - 未选中 → 整块 `draggable=false`，但内部 `.file-icon-cell`（图标+文件名整体块）`draggable="true"` 常驻 → 只有图标块可拖、块外空白框选 ✅

### 列表视图（list）
- `.file-row-cell`（整行）`draggable` 动态绑定：`:draggable="isSelected(file.path)"`。
  - 已选中 → 整行 `draggable=true` → 整行可拖 ✅
  - 未选中 → 整行 `draggable=false`，但每个 `.file-cell` 内新增一个**内容子元素 `.file-cell-content`**（`max-width:100%`、按内容撑开），其上 `draggable="true"` 常驻 → 只有文字实际渲染区可拖、其余（含列间大段空白、gap）框选 ✅

> 注意：给 `.file-cell` 包 `.file-cell-content` 的目的，是让"可拖区域"精确等于文字渲染区，从而让"未选中行的列间大片空白"自然落在非 `draggable` 区域 → 框选。不需要精确计算间隙坐标。

### 判定规则（onMarqueeStart 内的核心）
```
const rowEl = event.target.closest('.file-item, .file-row-cell')
const isRowSelected = !!rowEl && rowEl.classList.contains('selected')

// 1. 压在任意 draggable 元素上 → 永远是拖文件（含未选中行的 .file-icon-cell / .file-cell-content，以及已选中整行）
if (event.target.closest('[draggable="true"]')) return   // 交原生拖拽，不框选

// 2. 未命中 draggable，但点在已选中行/项上 → 整行可拖（Windows 选中态整行可拖）
if (isRowSelected) return   // 走拖拽（整行 draggable 已为 true，此处兜底）

// 3. 其余（未选中行的空白 / 列间隙 / 容器空白） → 框选
startMarquee(event)
```

该判定等价于「压在 draggable 上 = 拖文件，否则 = 框选」，并天然覆盖列间大段空白。

## 支持范围

- 图标视图（icon）：矩形包围盒命中 —— marquee 矩形覆盖到的 `.file-item` 即选中。
- 列表视图（list）：行区间命中 —— 从起始行到结束行之间的所有行选中（比矩形更自然；列间隙/空白也能正确命中对应行）。

## 交互语义

- 左键在空白/列间隙按下并移动（位移 > 阈值 4px）→ 启动框选。
- 无修饰键：框选**开始前清空**原选择，框内项成为新选择。
- Ctrl/⌘ 按住：在已有选择基础上**切换**框内项（框中已选的取消，未选的选中）。
- Shift 按住：忽略，按普通框选（清空）处理。
- 按下后未移动（位移 < 4px）即松开 → 视为单击空白 → 走现有 `clearSelection`（清空选择），不触发框选。

## 实现方案

### 1. 触发区分
- `.files-list` 容器新增 `@mousedown="onMarqueeStart"`。
- `onMarqueeStart(event)`：
  - 仅响应左键（`event.button === 0`）。
  - 按上述「判定规则」决定是否启动框选。
  - 记录 `marqueeStart = { x, y }`、当前 `selectedPaths`（用于 Ctrl 切换时保留基准）、`event.ctrlKey/metaKey`。
  - 在 `window` 上注册 `mousemove` → `onMarqueeMove`、`mouseup` → `onMarqueeEnd`（一次性，结束即移除）。

### 2. 框选进行中（onMarqueeMove）
- 计算 marquee 矩形 `{ left, top, right, bottom }`（规范化 start→current）。
- 更新响应式 `marqueeRect` ref（驱动 `.marquee-box` 渲染）。
- 命中计算：
  - 图标视图：遍历 `sortedFiles`，取每项 `.file-item` 元素的 `getBoundingClientRect()`，与 marquee 矩形相交则命中。
  - 列表视图：遍历行的 `getBoundingClientRect()`，行顶/底落入 `[marquee.top, marquee.bottom]` 区间即命中（行区间）。
- 实时预览：命中项路径集合写入临时 `marqueeHitPaths` ref，模板对命中的 `.file-item` 加 `.marquee-hit` 高亮（复用 `--bg-selected`）。预览阶段**不写** `selectedPaths`；Ctrl 模式下预览叠加/切换基准集合。
- 性能：仅在 `mousemove` 时计算；文件数大时可用 requestAnimationFrame 节流。

### 3. 框选结束（onMarqueeEnd）
- 若位移 < 4px：视为单击空白 → 调用 `clearSelection(event)`（现有逻辑：无修饰键才清空），不画矩形。
- 否则：提交选择。
  - 普通：`selectedPaths.value = marqueeHitPaths`。
  - Ctrl/⌘：`selectedPaths.value = 基准集合 与 命中集合 做对称差`（切换）。
- 清理：`marqueeRect = null`、`marqueeHitPaths = []`、移除 window 监听。

### 4. 视觉
- 新增 `.marquee-box`：绝对定位在 `.files-list` 内，`background: var(--accent-color-translucent)`、`border: 1px solid var(--accent-color)`、`pointer-events: none`、`z-index` 高于列表项但低于菜单。由 `marqueeRect` 驱动 `left/top/width/height`。
- 命中项高亮：`.file-item.marquee-hit { background: var(--bg-selected); }`。
- 框选期间禁用文本选择（`.files-list.marquee-active { user-select: none; }`）。

### 5. 与现有逻辑的关系（不破坏）
- 右键菜单（`handleFileContextMenu`）、键盘选择（方向键 / F2 / Delete）、现有单击选择 `handleItemClick`、clearSelection 修饰键保护 **全部不变**。
- 框选的「单击空白清空」复用 `clearSelection` 分支。
- **拖拽 dataTransfer 增强（顺带修正）**：当前 `handleDragStart` 只带单项 `file.path`。当拖拽的是「已选中的一批」中的某一项时，应带整批 `selectedPaths`（若该项在选中集合内），否则带单项。这保证 Windows 式"拖已选中行 = 拖整批"生效。

## 状态变量（新增 ref）
- `marqueeRect: ref<{ left: number; top: number; right: number; bottom: number } | null>(null)`
- `marqueeHitPaths: ref<string[]>([])`
- `marqueeActive: ref<boolean>(false)`（是否处于框选进行中，用于样式 / user-select）
- 模块级临时变量：`marqueeStart`、`marqueeBaseSelection`（Ctrl 基准）、`marqueeModifiers`。

## 边界与错误处理
- 搜索结果视图同样适用框选：命中计算基于当前 `sortedFiles`（即展示列表），无特殊处理。
- 框选进行中若目录被外部切换（`onMarqueeEnd` 始终清理监听，避免泄漏）。
- 组件卸载（`onUnmounted`）时若框选进行中，移除 window 监听。
- `.file-rename-input`（重命名输入框）命中时既非 draggable 也非空白框选触发区，且其 `@mousedown.stop` 已阻止冒泡，不受影响。

## 测试要点
- 图标视图：未选中项拖图标块 = 拖文件；拖块外空白 = 框选；已选中项整块拖动 = 拖整批。
- 列表视图：未选中行拖文件名 = 拖文件；拖列间大段空白 / gap = 框选；已选中行整行拖动 = 拖整批。
- 无修饰框选清空原选择；Ctrl 框选切换；单击空白清空。
- 框选矩形视觉与命中高亮正确；mouseup 后清理无残留。
- 框选期间不误触发文本选择 / 右键菜单。

## 不在范围内（YAGNI）
- 跨目录框选、触屏长按框选、框选后整体拖拽移动（框选仅做选择，移动仍走现有文件拖拽）。
- 侧边栏等列间隙外区域的框选。
