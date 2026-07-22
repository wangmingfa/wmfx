import type { FileEntry } from '@browser/ipc-contract'
import { type ComputedRef, onUnmounted, type Ref, ref } from 'vue'

/** useMarqueeSelection 依赖的外部状态（由 FilesView 注入） */
interface MarqueeSelectionDeps {
  sortedFiles: ComputedRef<FileEntry[]>
  viewMode: Ref<'icon' | 'list'>
  selectedPaths: Ref<string[]>
  /** 清空选中前取消挂起的重命名计时器 */
  onCancelRename: () => void
}

/**
 * 框选（marquee selection）与清空选中。
 * 框选起点仅在空白/列间隙（未命中 draggable）启动；已选中行兜底走拖拽。
 */
export function useMarqueeSelection(deps: MarqueeSelectionDeps) {
  const { sortedFiles, viewMode, selectedPaths, onCancelRename } = deps

  // 框选状态
  const marqueeRect = ref<{ left: number; top: number; right: number; bottom: number } | null>(null)
  const marqueeHitPaths = ref<string[]>([])
  const marqueeActive = ref(false)
  // 框选提交后抑制紧随 mouseup 的 click（click 会触发 .files-list 的 clearSelection 清空选择）
  const marqueeSuppressClick = ref(false)

  // 框选起点：仅在空白/列间隙（未命中 draggable）启动；已选中行兜底走拖拽
  function onMarqueeStart(event: MouseEvent): void {
    console.debug(
      '[useMarqueeSelection] onMarqueeStart: target=%o isElement=%s button=%d',
      event.target,
      event.target instanceof HTMLElement,
      event.button
    )
    if (event.button !== 0) {
      return
    }
    // text node 没有 closest()，点击文件名文字时 event.target 可能是 text node
    if (!(event.target instanceof HTMLElement)) {
      console.debug(
        '[useMarqueeSelection] onMarqueeStart: target is not HTMLElement, skip. nodeType=%d',
        (event.target as Node | null)?.nodeType
      )
      return
    }
    // 命中 draggable 元素（未选中行的 .file-icon-cell / .file-cell-content，或已选中整行/整块）→ 拖文件
    if (event.target.closest('[draggable="true"]')) {
      console.debug('[useMarqueeSelection] onMarqueeStart: hit draggable, skip')
      return
    }
    const rowEl = event.target.closest('.file-item, .file-row-cell')
    const isRowSelected = !!rowEl && rowEl.classList.contains('selected')
    console.debug(
      '[useMarqueeSelection] onMarqueeStart: rowEl=%s isRowSelected=%s',
      rowEl?.className,
      isRowSelected
    )
    // 已选中行的非内容空白区域：整行可拖（draggable 已为 true，此处兜底）
    if (isRowSelected) {
      return
    }
    // 否则进入框选
    console.debug('[useMarqueeSelection] onMarqueeStart: 启动框选')
    marqueeActive.value = true
    const startX = event.clientX
    const startY = event.clientY
    let baseSelection: string[] = []
    const ctrl = event.ctrlKey || event.metaKey
    // 若起点所在文件已选中且为 Ctrl，则基于当前选择做切换；否则清空
    const startFile = sortedFiles.value.find(
      (f) => f.path === (rowEl as HTMLElement | null)?.getAttribute('data-path')
    )
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

  // 根据 marquee 矩形计算命中文件集合
  function computeMarqueeHit(
    rect: { left: number; top: number; right: number; bottom: number },
    ctrl: boolean,
    baseSelection: string[]
  ): string[] {
    const hit: string[] = []
    for (const file of sortedFiles.value) {
      const el = document.querySelector(
        `.file-item[data-path="${CSS.escape(file.path)}"]`
      ) as HTMLElement | null
      if (!el) {
        continue
      }
      const r = el.getBoundingClientRect()
      let matched = false
      if (viewMode.value === 'icon') {
        matched = !(
          r.right < rect.left ||
          r.left > rect.right ||
          r.bottom < rect.top ||
          r.top > rect.bottom
        )
      } else {
        matched = !(r.bottom < rect.top || r.top > rect.bottom)
      }
      if (matched) {
        hit.push(file.path)
      }
    }
    if (ctrl && baseSelection.length > 0) {
      const set = new Set(baseSelection)
      for (const p of hit) {
        if (set.has(p)) {
          set.delete(p)
        } else {
          set.add(p)
        }
      }
      return [...set]
    }
    return hit
  }

  function onMarqueeEnd(event: MouseEvent, startX: number, startY: number): void {
    console.debug('[useMarqueeSelection] onMarqueeEnd')
    const dx = Math.abs(event.clientX - startX)
    const dy = Math.abs(event.clientY - startY)
    // 位移极小 → 视为单击空白 → 复用 clearSelection
    if (dx < 4 && dy < 4) {
      clearSelection(event)
    } else {
      // 抑制紧随 mouseup 的 click（会触发 .files-list clearSelection 清空刚提交的框选）
      marqueeSuppressClick.value = true
      selectedPaths.value = marqueeHitPaths.value
    }
    marqueeRect.value = null
    marqueeHitPaths.value = []
    marqueeActive.value = false
  }

  // 清空选中：点击列表空白处时触发。多选模式（按住 Ctrl/Shift/⌘）下误触空白间隙不应清掉已选，故忽略带修饰键的点击
  function clearSelection(event: MouseEvent): void {
    console.debug(
      '[useMarqueeSelection] clearSelection: ctrl=%s shift=%s marqueeSuppress=%s',
      event.ctrlKey || event.metaKey,
      event.shiftKey,
      marqueeSuppressClick.value
    )
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      return
    }
    // 框选提交后产生的 click：保留刚框选的结果，不清除
    if (marqueeSuppressClick.value) {
      marqueeSuppressClick.value = false
      return
    }
    onCancelRename()
    selectedPaths.value = []
  }

  onUnmounted(() => {
    // 框选进行中卸载：复位状态（window 监听为一次性，mouseup 已移除；兜底清理）
    if (marqueeActive.value) {
      marqueeRect.value = null
      marqueeHitPaths.value = []
      marqueeActive.value = false
    }
  })

  return {
    marqueeRect,
    marqueeHitPaths,
    marqueeActive,
    onMarqueeStart,
    clearSelection,
  }
}
