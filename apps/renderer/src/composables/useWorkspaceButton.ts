/**
 * 工作区按钮的共享逻辑：维护当前工作区状态 + 打开工作区选择 Popover。
 * TabBar 与 VerticalTabBar 的视觉完全一致的按钮共用此 composable，
 * 仅通过 opts.placement / opts.gap 适配各自的弹出方向。
 */
import type { PopoverPlacement } from '@browser/ipc-contract'
import { onUnmounted, ref } from 'vue'
import { Popover } from '@/lib/popover'

export interface WorkspaceInfo {
  id: string
  name: string
  color: string
}

export interface UseWorkspaceButtonOptions {
  /** 弹层相对按钮的弹出方向 */
  placement: PopoverPlacement
  /** 弹层与按钮间距（px） */
  gap: number
}

export function useWorkspaceButton(opts: UseWorkspaceButtonOptions) {
  const currentWorkspace = ref<WorkspaceInfo | null>(null)
  let workspacePopover: Popover | null = null

  async function openWorkspacePanel(e: MouseEvent): Promise<void> {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    workspacePopover?.close()
    const workspaces = await window.browserAPI.listWorkspaces()
    const active = await window.browserAPI.getActiveWorkspace()
    workspacePopover = new Popover({
      type: 'workspace',
      anchor: {
        type: 'rect',
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        placement: opts.placement,
      },
      data: { workspaces, activeId: active?.id ?? '' },
      gap: opts.gap,
      onEvent: (event) => {
        if (event.name === 'switched') {
          workspacePopover?.close()
        }
      },
      onDismiss: () => {
        workspacePopover = null
      },
    })
  }

  async function initWorkspace(): Promise<void> {
    const ws = await window.browserAPI.getActiveWorkspace()
    if (ws) {
      currentWorkspace.value = ws
    }
    window.browserAPI.onWorkspaceSwitched((ws) => {
      currentWorkspace.value = ws
    })
  }

  onUnmounted(() => {
    workspacePopover?.close()
  })

  return { currentWorkspace, openWorkspacePanel, initWorkspace }
}
