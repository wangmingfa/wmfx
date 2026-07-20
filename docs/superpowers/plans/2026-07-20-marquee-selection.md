# 文件浏览器框选（Marquee Selection）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在文件浏览器中支持鼠标拖拽框选（marquee selection），与现有文件拖拽按"是否选中 + 命中位置"分层共存，行为对齐 Windows 资源管理器。

**Architecture:** 通过把 `draggable` 属性从整行/整块动态下沉到"内容子元素"（未选中时）或提升回整行（选中时），让"压在 draggable 元素上=拖文件、否则=框选"。框选只在 `.files-list` 的空白/列间隙 mousedown 启动，用 window 级 mousemove/mouseup 计算命中（图标视图矩形包围盒、列表视图行区间），以半透明矩形 + 命中高亮实时预览，mouseup 提交选择。

**Tech Stack:** Vue 3 (`<script setup>`) + TypeScript + Naive UI（仅复用已有组件，本功能不新增）、原生 HTML5 Drag and Drop、Electron 渲染进程（无新增 IPC）。

## Global Constraints

- 包管理器用 `bun`；脚本走 `bun run`（lint/typecheck/build 见 AGENTS.md）。
- 调试日志统一用 `console.debug`，关键路径用 `console.info`（AGENTS.md 日志规范）。
- Vue 单文件组件 `<style>` 必须用 LESS 嵌套（`lang="less"`），引用 `style.css` 的 CSS 变量；每个变量有中文注释（AGENTS.md Vue 规范）。
- 新增代码遵循现有目录约定；本功能**只改** `apps/renderer/src/views/FilesView.vue`（模板、脚本、样式），不新增 IPC / 不改动主进程。
- ESLint（vue）+ Biome（ts）lint 全绿；`bun run lint:typecheck` 通过。
- 框选前先 `bun run --filter @browser/shared build`（若改了 i18n——本计划不改 i18n，无需）。

---

## 文件结构

- **Modify:** `apps/renderer/src/views/FilesView.vue`
  - 模板：`.file-item` / `.file-row-cell` 的 `draggable` 动态绑定；新增 `.file-cell-content` 子元素（列表视图文字单元格）；`.files-list` 新增 `@mousedown="onMarqueeStart"` 与 `.marquee-box` 渲染；`.file-item` 增加 `.marquee-hit` 类绑定；`.files-list` 增加 `marquee-active` 类绑定。
  - 脚本：新增 `marqueeRect` / `marqueeHitPaths` / `marqueeActive` ref；新增 `onMarqueeStart` / `onMarqueeMove` / `onMarqueeEnd` / `computeMarqueeHit`；修改 `handleDragStart`（拖已选中批携带整批）；`onUnmounted` 增加监听清理。
  - 样式：新增 `.marquee-box`、`.file-item.marquee-hit`、`.files-list.marquee-active`、`.file-cell-content`。
- **不修改：** 主进程、ipc-contract、preload、env.d.ts、i18n。

---

## Task 1：draggable 动态下沉/提升（选中态分层）

**Files:**
- Modify: `apps/renderer/src/views/FilesView.vue:223-233`（图标视图 `.file-item` 模板）
- Modify: `apps/renderer/src/views/FilesView.vue:270-317`（列表视图 `.file-row-cell` 模板 + `.file-cell` 包 `.file-cell-content`）

**Interfaces:**
- Consumes: `isSelected(path: string): boolean`（已存在，FilesView.vue:646）
- Produces: 改后的模板结构，供 Task 3 判定 `event.target.closest('[draggable="true"]')` 使用

- [ ] **Step 1: 修改图标视图 `.file-item` 的 draggable 绑定**

将 `apps/renderer/src/views/FilesView.vue:223-237` 改为：`.file-item` 的 `draggable` 改为 `:draggable="isSelected(file.path)"`；内部 `.file-icon-cell` 加 `:draggable="!isSelected(file.path)"`（未选中时图标块可拖）。其余不变。

```diff
           <div
             v-for="file in sortedFiles"
             :key="file.path"
             class="file-item"
             :class="[{ selected: isSelected(file.path), folder: file.isDir, dragging: dragFiles.includes(file.path) }]"
-            draggable="true"
+            :draggable="isSelected(file.path)"
             @click="handleItemClick(file, $event)"
             @dblclick="handleItemDblClick(file)"
             @contextmenu.prevent="handleFileContextMenu($event, file)"
             @dragstart="handleDragStart($event, file)"
             @dragend="handleDragEnd"
             @mouseenter="itemHovered = file.path"
             @mouseleave="itemHovered = ''"
           >
             <!-- 图标视图 -->
             <div
               v-if="viewMode === 'icon'"
-              class="file-icon-cell"
+              class="file-icon-cell"
+              :draggable="!isSelected(file.path)"
             >
```

- [ ] **Step 2: 修改列表视图 `.file-row-cell` 及其文字单元格**

将 `apps/renderer/src/views/FilesView.vue:270-317` 中：`.file-row-cell` 的 `draggable` 改为 `:draggable="isSelected(file.path)"`；每个 `.file-cell` 的内容包一层 `.file-cell-content` 并设 `draggable="true"`（重命名 input 与 name 高亮 span 也需包入该 content，保持统一）。

列表视图行容器（:271-275）：
```diff
             <div
               v-else
               class="file-row-cell"
               :style="{ gridTemplateColumns: listGridTemplate }"
+              :draggable="isSelected(file.path)"
             >
```
每个 `.file-cell`（原 :297-315、:310-315）改为：
```diff
                 <span
                   v-else-if="col.key === 'name' && searchQuery"
                   class="file-cell cell-name"
                   :title="file.name"
-                ><template
+                ><span
+                  class="file-cell-content"
+                  draggable="true"
+                ><template
                   v-for="(seg, si) in getHighlightParts(file.name)"
                   :key="si"
                 ><mark
                   v-if="seg.hit"
                   class="name-hit"
                 >{{ seg.text }}</mark><template
                   v-else
-                >{{ seg.text }}</template></span>
+                >{{ seg.text }}</template></span></span>
                 <span
                   v-else
                   class="file-cell"
                   :class="`cell-${col.key}`"
                   :title="renderCellContent(file, col.key)"
-                >{{ renderCellContent(file, col.key) }}</span>
+                ><span
+                  class="file-cell-content"
+                  draggable="true"
+                >{{ renderCellContent(file, col.key) }}</span></span>
```
（重命名 input 分支 :287-296 不需包 content，因为 input 自带交互；保留原样。图标列 `.file-icon-small` 也不包 content——图标列整体可视作内容，但为对齐"未选中拖内容"，可保持；本任务仅处理文字 `.file-cell`。图标列在小尺寸下不易误触发框选，可接受。）

- [ ] **Step 3: 运行 lint/typecheck 验证模板合法**

Run: `bun run lint:vue && bun run --filter @browser/renderer typecheck 2>&1 | grep -iE "error|FilesView" | grep -iv interceptorview | head`
Expected: 无 error 输出。

- [ ] **Step 4: Commit**

```bash
git add apps/renderer/src/views/FilesView.vue
git commit -m "feat(files): draggable 按选中态动态下沉/提升，为框选分层"
```

---

## Task 2：新增框选状态与 marquee-box 渲染

**Files:**
- Modify: `apps/renderer/src/views/FilesView.vue`（脚本 ref 区，约 :413 附近 `selectedPaths` 声明后）
- Modify: `apps/renderer/src/views/FilesView.vue`（`.files-list` 模板 :168-175）
- Modify: `apps/renderer/src/views/FilesView.vue`（样式区，新增 `.marquee-box` 等）

**Interfaces:**
- Consumes: `sortedFiles`（已存在，展示列表）
- Produces: `marqueeRect` / `marqueeHitPaths` / `marqueeActive` ref 供 Task 3/4 使用；`.marquee-box` 元素供 Task 3 驱动

- [ ] **Step 1: 新增响应式状态**

在 `apps/renderer/src/views/FilesView.vue` 中 `const selectedPaths = ref<string[]>([])`（约 :413）之后新增：

```ts
// 框选（marquee selection）状态
const marqueeRect = ref<{ left: number; top: number; right: number; bottom: number } | null>(null)
const marqueeHitPaths = ref<string[]>([])
const marqueeActive = ref(false)
```

- [ ] **Step 2: `.files-list` 模板新增 mousedown 与 marquee-box**

将 `apps/renderer/src/views/FilesView.vue:168-175` 的 `.files-list` 容器改为：

```diff
       <div
         class="files-list"
         :class="[viewMode, { 'drag-over': dragOverFilesList, 'marquee-active': marqueeActive }]"
         @click="clearSelection($event)"
         @contextmenu="handleContextMenu"
+        @mousedown="onMarqueeStart"
         @dragover="handleDragOverList($event)"
         @dragleave="handleDragLeaveList"
         @drop="handleDropOnList"
       >
```
并在 `.files-list` 内部（最外层，作为兄弟节点，位于 `v-if="showSkeleton"` 等 template 之后、`.files-list` 闭合前）新增：

```html
         <div
           v-if="marqueeRect"
           class="marquee-box"
           :style="{
             left: `${marqueeRect.left}px`,
             top: `${marqueeRect.top}px`,
             width: `${marqueeRect.right - marqueeRect.left}px`,
             height: `${marqueeRect.bottom - marqueeRect.top}px`,
           }"
         />
```

- [ ] **Step 3: `.file-item` 增加 marquee-hit 高亮类绑定**

将 `apps/renderer/src/views/FilesView.vue:223-224` 的 `:class` 改为包含 `marquee-hit`：

```diff
             :class="[{ selected: isSelected(file.path), folder: file.isDir, dragging: dragFiles.includes(file.path), 'marquee-hit': marqueeHitPaths.includes(file.path) }]"
```

- [ ] **Step 4: 新增样式**

在 `apps/renderer/src/views/FilesView.vue` 的 `<style lang="less">` 中（`.files-list` 规则之后）新增：

```less
  /* 框选矩形 */
  .marquee-box {
    position: absolute;
    background: var(--accent-color-translucent);
    border: 1px solid var(--accent-color);
    pointer-events: none;
    z-index: 5;
  }

  /* 框选命中高亮 */
  .file-item.marquee-hit {
    background: var(--bg-selected);
  }

  /* 框选进行中禁用文本选择 */
  .files-list.marquee-active {
    user-select: none;
  }

  /* 列表视图文字内容子元素（仅它是拖拽手柄） */
  .file-cell-content {
    max-width: 100%;
  }
```

- [ ] **Step 5: 运行 lint/typecheck**

Run: `bun run lint:vue && bun run --filter @browser/renderer typecheck 2>&1 | grep -iE "error|FilesView" | grep -iv interceptorview | head`
Expected: 无 error。

- [ ] **Step 6: Commit**

```bash
git add apps/renderer/src/views/FilesView.vue
git commit -m "feat(files): 新增框选状态与半透明矩形/命中高亮渲染"
```

---

## Task 3：框选触发判定与命中计算

**Files:**
- Modify: `apps/renderer/src/views/FilesView.vue`（脚本，Task 2 ref 之后新增函数）

**Interfaces:**
- Consumes: `marqueeRect` / `marqueeHitPaths` / `marqueeActive` ref；`sortedFiles`；`isSelected`；`viewMode`；`selectedPaths`；`clearSelection(event)`（已存在 :670 附近）
- Produces: `onMarqueeStart(event)` / `onMarqueeMove(event)` / `onMarqueeEnd(event)` / `computeMarqueeHit(rect)` 函数，供 Task 4 提交逻辑与 Task 5 清理复用

- [ ] **Step 1: 实现 onMarqueeStart（判定规则）**

在脚本区（Task 2 的 ref 声明之后）新增。判定：压在 `[draggable="true"]` 上 = 拖文件（不框选）；已选中行兜底拖拽；其余空白/列间隙 = 框选。

```ts
// 框选起点：仅在空白/列间隙（未命中 draggable）启动；已选中行兜底走拖拽
function onMarqueeStart(event: MouseEvent): void {
  console.debug('[FilesView] onMarqueeStart')
  if (event.button !== 0)
    return
  // 命中 draggable 元素（未选中行的 .file-icon-cell / .file-cell-content，或已选中整行/整块）→ 拖文件
  if ((event.target as HTMLElement).closest('[draggable="true"]'))
    return
  const rowEl = (event.target as HTMLElement).closest('.file-item, .file-row-cell')
  const isRowSelected = !!rowEl && rowEl.classList.contains('selected')
  // 已选中行的非内容空白区域：整行可拖（draggable 已为 true，此处兜底）
  if (isRowSelected)
    return
  // 否则进入框选
  console.debug('[FilesView] onMarqueeStart: 启动框选')
  marqueeActive.value = true
  const startX = event.clientX
  const startY = event.clientY
  let baseSelection: string[] = []
  let ctrl = event.ctrlKey || event.metaKey
  // 拖拽整批：若起点所在文件已选中且为 Ctrl，则基于当前选择做切换；否则清空
  const startFile = sortedFiles.value.find(f => f.path === (rowEl as HTMLElement | null)?.getAttribute('data-path'))
  if (ctrl && startFile && selectedPaths.value.includes(startFile.path)) {
    baseSelection = [...selectedPaths.value]
  }
  const onMove = (e: MouseEvent) => {
    const left = Math.min(startX, e.clientX)
    const top = Math.min(startY, e.clientY)
    const right = Math.max(startX, e.clientX)
    const bottom = Math.max(startY, e.clientY)
    marqueeRect.value = { left, top, right, bottom }
    marqueeHitPaths.value = computeMarqueeHit({ left, top, right, bottom }, ctrl, baseSelection)
  }
  const onUp = (e: MouseEvent) => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    onMarqueeEnd(e, startX, startY)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
```

注意：`rowEl` 需要能取到 `data-path`。Task 5 会在 `.file-item` 上加 `:data-path="file.path"`。此处用 `getAttribute('data-path')` 安全读取；若取不到（点在容器空白）`startFile` 为 undefined，属正常（纯空白框选）。

- [ ] **Step 2: 实现 computeMarqueeHit（图标矩形 / 列表行区间）**

```ts
// 根据 marquee 矩形计算命中文件集合
function computeMarqueeHit(
  rect: { left: number; top: number; right: number; bottom: number },
  ctrl: boolean,
  baseSelection: string[],
): string[] {
  const hit: string[] = []
  for (const file of sortedFiles.value) {
    const el = document.querySelector(`.file-item[data-path="${CSS.escape(file.path)}"]`) as HTMLElement | null
    if (!el)
      continue
    const r = el.getBoundingClientRect()
    let matched = false
    if (viewMode.value === 'icon') {
      // 矩形包围盒相交
      matched = !(r.right < rect.left || r.left > rect.right || r.bottom < rect.top || r.top > rect.bottom)
    }
    else {
      // 列表视图：行区间（行顶/底落入矩形纵向区间）
      matched = !(r.bottom < rect.top || r.top > rect.bottom)
    }
    if (matched)
      hit.push(file.path)
  }
  if (ctrl && baseSelection.length > 0) {
    // Ctrl：在基准集合上对称差切换
    const set = new Set(baseSelection)
    for (const p of hit) {
      if (set.has(p))
        set.delete(p)
      else
        set.add(p)
    }
    return [...set]
  }
  return hit
}
```

- [ ] **Step 3: 实现 onMarqueeEnd（提交 / 单击判定）**

```ts
function onMarqueeEnd(event: MouseEvent, startX: number, startY: number): void {
  console.debug('[FilesView] onMarqueeEnd')
  const dx = Math.abs(event.clientX - startX)
  const dy = Math.abs(event.clientY - startY)
  // 位移极小 → 视为单击空白 → 复用 clearSelection（现有逻辑：无修饰键才清空）
  if (dx < 4 && dy < 4) {
    clearSelection(event)
  }
  else {
    selectedPaths.value = marqueeHitPaths.value
  }
  marqueeRect.value = null
  marqueeHitPaths.value = []
  marqueeActive.value = false
}
```

- [ ] **Step 4: 运行 lint/typecheck**

Run: `bun run lint:vue && bun run --filter @browser/renderer typecheck 2>&1 | grep -iE "error|FilesView" | grep -iv interceptorview | head`
Expected: 无 error。

- [ ] **Step 5: Commit**

```bash
git add apps/renderer/src/views/FilesView.vue
git commit -m "feat(files): 实现框选触发判定与命中计算（图标矩形/列表行区间）"
```

---

## Task 4：拖拽 dataTransfer 携带整批选中项

**Files:**
- Modify: `apps/renderer/src/views/FilesView.vue:820-829`（`handleDragStart`）

**Interfaces:**
- Consumes: `selectedPaths`、`isSelected`、`file`（参数）
- Produces: 拖已选中批中某项时 dataTransfer 携带整批路径（供后续移动整批；主进程现有 `pasteFiles`/移动逻辑无需改）

- [ ] **Step 1: 修改 handleDragStart**

```diff
 function handleDragStart(event: DragEvent, file: FileEntry): void {
   console.debug('[FilesView] handleDragStart:', file.name)
   if (!event.dataTransfer)
     return
-  dragFiles.value = [file.path]
-  event.dataTransfer.setData('application/x-wmfx-files', file.path)
-  event.dataTransfer.setData('text/plain', file.name)
+  // 拖已选中批中的某项 → 携带整批；否则仅单项（Windows 式"拖已选中行=拖整批"）
+  const paths = selectedPaths.value.includes(file.path) && selectedPaths.value.length > 1
+    ? [...selectedPaths.value]
+    : [file.path]
+  dragFiles.value = paths
+  event.dataTransfer.setData('application/x-wmfx-files', JSON.stringify(paths))
+  event.dataTransfer.setData('text/plain', paths.join('\n'))
   event.dataTransfer.effectAllowed = 'copy'
   event.dataTransfer.dropEffect = 'copy'
 }
```
注意：主进程读取 `application/x-wmfx-files` 处若按单字符串解析需相应兼容（本计划范围：仅修改渲染端写入整批；若主进程解析报错需同步放宽，另行评估，本任务不强制改主进程）。

- [ ] **Step 2: 运行 lint/typecheck**

Run: `bun run lint:vue && bun run --filter @browser/renderer typecheck 2>&1 | grep -iE "error|FilesView" | grep -iv interceptorview | head`
Expected: 无 error。

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/views/FilesView.vue
git commit -m "feat(files): 拖拽已选中批时 dataTransfer 携带整批路径"
```

---

## Task 5：data-path 属性与卸载清理

**Files:**
- Modify: `apps/renderer/src/views/FilesView.vue:223`（`.file-item` 加 `:data-path`）
- Modify: `apps/renderer/src/views/FilesView.vue`（`onUnmounted`，约 :1561）

**Interfaces:**
- Consumes: `marqueeActive` ref
- Produces: `.file-item` 携带 `data-path`，供 Task 3 `computeMarqueeHit` / `onMarqueeStart` 用 `querySelector` 与 `getAttribute` 定位

- [ ] **Step 1: `.file-item` 增加 data-path**

```diff
           <div
             v-for="file in sortedFiles"
             :key="file.path"
             class="file-item"
+            :data-path="file.path"
             :class="[{ selected: isSelected(file.path), folder: file.isDir, dragging: dragFiles.includes(file.path), 'marquee-hit': marqueeHitPaths.includes(file.path) }]"
```

- [ ] **Step 2: onUnmounted 清理框选监听（防止泄漏）**

找到 `apps/renderer/src/views/FilesView.vue` 的 `onUnmounted`（约 :1561），在其内新增：若 `marqueeActive` 则移除潜在监听并复位状态。

```diff
 onUnmounted(() => {
   console.debug('[FilesView] onUnmounted')
   window.removeEventListener('keydown', handleKeyDown)
+  // 框选进行中卸载：复位状态（window 监听为一次性，mouseup 已移除；兜底清理）
+  if (marqueeActive.value) {
+    marqueeRect.value = null
+    marqueeHitPaths.value = []
+    marqueeActive.value = false
+  }
 })
```

- [ ] **Step 3: 运行完整 lint + typecheck**

Run: `bun run lint:vue && bun run lint:typecheck 2>&1 | grep -iE "error|FilesView" | grep -iv interceptorview | head`
Expected: 无 error。

- [ ] **Step 4: Commit**

```bash
git add apps/renderer/src/views/FilesView.vue
git commit -m "feat(files): 文件项加 data-path 并卸载时清理框选状态"
```

---

## Task 6：手动验证与边界核对

**Files:**
- 无代码改动，仅验证

- [ ] **Step 1: 启动 dev 并逐项验证**

Run: `bun run dev`（或项目既定启动方式），在文件浏览器中验证：
1. 图标视图：未选中项拖**图标块** = 拖文件；拖块**外空白** = 框选（矩形命中连续项）。已选中项整块拖动 = 拖整批。
2. 列表视图：未选中行拖**文件名** = 拖文件；拖**列间大段空白 / grid gap** = 框选（行区间命中）。已选中行整行拖动 = 拖整批。
3. 无修饰键框选 = 开始前清空原选择，框内为新选择。
4. Ctrl/⌘ 框选 = 在已有选择上切换框内项。
5. 在空白按下未移动（<4px）松开 = 清空选择（clearSelection），无矩形残留。
6. 框选矩形（半透明蓝）与命中项高亮（--bg-selected）正确显示；mouseup 后清理无残留。
7. 框选期间不误触发文本选择 / 右键菜单。
8. 文件项上拖拽仍触发原生文件拖拽，不触发框选。

- [ ] **Step 2: 回归现有功能**

验证：右键菜单（文件/书签）、键盘选择（方向键/F2/Delete）、搜索高亮、书签重命名聚焦，均不受框选改动影响。

- [ ] **Step 3: 如有问题修正并补 commit**

```bash
git add apps/renderer/src/views/FilesView.vue
git commit -m "fix(files): 框选边界修正（按验证结果）"
```

---

## Self-Review 对照 Spec

- **按选中态分语义**：Task 1（draggable 动态）+ Task 3 判定规则（已选中整行兜底拖拽）覆盖。✅
- **draggable 下沉到 content 子元素**：Task 1 列表视图 `.file-cell-content`、图标视图 `.file-icon-cell`。✅
- **判定规则** `closest('[draggable="true"]')`：Task 3 `onMarqueeStart`。✅
- **图标矩形 / 列表行区间命中**：Task 3 `computeMarqueeHit`。✅
- **视觉**：Task 2 `.marquee-box` / `.marquee-hit` / `.marquee-active` / `.file-cell-content`。✅
- **交互语义**（无修饰清空 / Ctrl 切换 / <4px 单击清空）：Task 3 `onMarqueeEnd` + `computeMarqueeHit` ctrl 对称差。✅
- **drag dataTransfer 整批**：Task 4。✅
- **data-path + 卸载清理**：Task 5。✅
- **不破坏现有**：Task 3/4/5 均保留 `handleFileContextMenu`、键盘、`clearSelection`、`.file-item` draggable 右键等。✅
