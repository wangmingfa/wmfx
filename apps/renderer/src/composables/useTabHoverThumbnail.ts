/**
 * 标签悬停缩略图 Popover 的共享逻辑，供 TabBar 与 VerticalTabBar 复用。
 * 两栏差异（anchor 位置、弹层尺寸）通过 opts.buildAnchor / opts.popoverExtra 回调注入，
 * composable 内部统一维护 hover 延迟/离开定时器与 Popover 生命周期。
 */
import type { PopoverAnchor, TabState } from '@browser/ipc-contract'
import { onUnmounted, ref } from 'vue'
import { Popover } from '@/lib/popover'

export interface UseTabHoverThumbnailOptions {
  /** 缩略图缓存（来自 useTabList 的模块级共享缓存） */
  thumbnailCache: Map<string, string>
  /** 内部页判断（wmfx://） */
  isInternalUrl: (url: string) => boolean
  /** 由具体栏位根据元素 rect 与 tab 计算锚点 */
  buildAnchor: (rect: DOMRect, tab: TabState) => PopoverAnchor
  /** 额外 popover 参数（如 Vertical 传 size:{width:280}） */
  popoverExtra?: (tab: TabState) => Partial<ConstructorParameters<typeof Popover>[0]>
}

export function useTabHoverThumbnail(opts: UseTabHoverThumbnailOptions) {
  const HOVER_DELAY = 300
  const HOVER_LEAVE_DELAY = 200

  // 当前 hover 目标（用于 enter 时若已指向同一标签则不重置）
  const hoveringTabId = ref<string | null>(null)
  let hoverDelayTimer: ReturnType<typeof setTimeout> | null = null
  let hoverLeaveTimer: ReturnType<typeof setTimeout> | null = null
  let hoverPopover: Popover | null = null
  let hoverPopoverTabId: string | null = null

  function onTabEnter(event: MouseEvent, tab: TabState): void {
    if (tab.active || tab.isPinned) {
      return
    }
    cancelHoverLeave()
    if (hoveringTabId.value === tab.id) {
      return
    }
    hoveringTabId.value = tab.id
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    hoverDelayTimer = setTimeout(() => {
      const src = opts.thumbnailCache.get(tab.id) ?? null
      const data = {
        src,
        loading: !src,
        title: tab.title || 'New Tab',
        url: tab.navigation.displayUrl,
      }
      const anchor = opts.buildAnchor(rect, tab)
      // 关闭旧的 hover popover（避免多个标签快速划过时残留）
      hoverPopover?.close()
      const tabId = tab.id
      const extra = opts.popoverExtra?.(tab) ?? {}
      hoverPopover = new Popover({
        type: 'tab-thumbnail',
        mode: 'bounded',
        anchor,
        data,
        persistent: true,
        ...extra,
        onDismiss: () => {
          // 仅当 dismiss 的是当前 tab 的 popover 时才清理，避免旧 popover 异步 IPC 返回时覆盖新引用
          if (hoverPopoverTabId === tabId) {
            hoverPopover = null
            hoverPopoverTabId = null
          }
        },
      })
      hoverPopoverTabId = tab.id
      // 异步截取缩略图并更新 popover
      if (!opts.thumbnailCache.has(tab.id)) {
        void window.browserAPI.captureThumbnail(tab.id).then((dataUrl: string | null) => {
          if (hoverPopoverTabId === tab.id) {
            if (dataUrl) {
              opts.thumbnailCache.set(tab.id, dataUrl)
            }
            hoverPopover?.sendData({ ...data, src: dataUrl, loading: false })
          }
        })
      }
    }, HOVER_DELAY)
  }

  function onTabLeave(): void {
    if (hoverDelayTimer) {
      clearTimeout(hoverDelayTimer)
      hoverDelayTimer = null
    }
    hoverLeaveTimer = setTimeout(closeHoverPopover, HOVER_LEAVE_DELAY)
  }

  function cancelHoverLeave(): void {
    if (hoverLeaveTimer) {
      clearTimeout(hoverLeaveTimer)
      hoverLeaveTimer = null
    }
  }

  function closeHoverPopover(): void {
    if (hoverDelayTimer) {
      clearTimeout(hoverDelayTimer)
      hoverDelayTimer = null
    }
    if (hoverLeaveTimer) {
      clearTimeout(hoverLeaveTimer)
      hoverLeaveTimer = null
    }
    hoveringTabId.value = null
    hoverPopover?.close()
    hoverPopover = null
    hoverPopoverTabId = null
  }

  onUnmounted(() => {
    if (hoverDelayTimer) {
      clearTimeout(hoverDelayTimer)
    }
    if (hoverLeaveTimer) {
      clearTimeout(hoverLeaveTimer)
    }
    hoverPopover?.close()
  })

  return { onTabEnter, onTabLeave, cancelHoverLeave, closeHoverPopover }
}
