<template>
  <!-- 查找栏 UI 渲染在 PopoverManager 的独立置顶 view（panel/FindPanel.vue），此组件仅作全局控制器 -->
  <span style="display: none" />
</template>

<script setup lang="ts">
import type { PopoverAnchor } from '@browser/ipc-contract'
import { onMounted, onUnmounted, watch } from 'vue'
import { Popover } from '../lib/popover'

const props = defineProps<{
  /** 当前激活标签页 id；null 表示无标签页 */
  activeTabId: string | null
}>()

// 查找栏尺寸（与 FindPanel.vue 内固定宽高一致），用于锚点定位到内容区右上角
const FIND_WIDTH = 320
const FIND_HEIGHT = 40
const FIND_MARGIN = 8

/** 每个 tab 独立的查找状态：显示与否、关键字、匹配总数与当前位置 */
interface FindState {
  visible: boolean
  query: string
  matches: number
  activeMatch: number
}

// tabId → 查找状态，各网页独立搜索互不干扰
const states = new Map<string, FindState>()
// 全局共享的单个 Popover 实例（同一时刻仅当前 tab 的查找栏可见）
let popover: Popover | null = null
// 每次 open 自增，随 data 下发；FindPanel watch 到变化即聚焦并全选输入框（再次 Ctrl+F 场景）
let focusNonce = 0

function getState(tabId: string): FindState {
  let s = states.get(tabId)
  if (!s) {
    s = { visible: false, query: '', matches: 0, activeMatch: -1 }
    states.set(tabId, s)
  }
  return s
}

// 内容区右上角锚点（类 Chrome）：cover-start 让盒子左上角对齐 rect 左上角
function computeAnchor(): PopoverAnchor {
  const viewport = document.getElementById('browser-viewport')
  const vrect = viewport?.getBoundingClientRect()
  const x = vrect ? vrect.right - FIND_WIDTH - FIND_MARGIN : window.innerWidth - FIND_WIDTH - FIND_MARGIN
  const y = vrect ? vrect.top + FIND_MARGIN : FIND_MARGIN
  return {
    type: 'rect',
    rect: { x, y, width: FIND_WIDTH, height: FIND_HEIGHT },
    placement: 'cover-start',
  }
}

function panelData(s: FindState): {
  query: string
  matches: number
  activeMatch: number
  focusNonce: number
} {
  return { query: s.query, matches: s.matches, activeMatch: s.activeMatch, focusNonce }
}

// 创建（首次）持有 Popover 实例，事件按“当前激活 tab”路由
function createPopover(s: FindState): void {
  popover = new Popover({
    type: 'find',
    mode: 'bounded',
    persistent: true,
    anchor: computeAnchor(),
    data: panelData(s),
    onEvent: onPanelEvent,
    onDismiss: () => {
      // persistent 已阻止失焦/背景关闭；关闭按钮/Esc 走 onPanelEvent('close')，
      // 主动 close() 不触发本回调。此处仅作外部意外关闭的兜底，清空实例引用。
      popover = null
    },
  })
}

function onPanelEvent(event: { name: string, data?: unknown }): void {
  const tabId = props.activeTabId
  if (!tabId) {
    return
  }
  console.debug('[FindBar] onPanelEvent: event tabId', event.name, tabId)
  const s = getState(tabId)
  if (event.name === 'update-query' && typeof event.data === 'string') {
    s.query = event.data
    if (s.query) {
      window.browserAPI.startFind({ tabId, searchText: s.query })
    } else {
      window.browserAPI.endFind(tabId)
      s.matches = 0
      s.activeMatch = -1
      popover?.sendData(panelData(s))
    }
  } else if (event.name === 'find-next') {
    window.browserAPI.findNext({ tabId, forward: true })
  } else if (event.name === 'find-prev') {
    window.browserAPI.findNext({ tabId, forward: false })
  } else if (event.name === 'close') {
    close(tabId)
  }
}

// 打开当前 tab 的查找栏：新建或复用 popover，回显该 tab 的关键字并恢复高亮
function open(): void {
  const tabId = props.activeTabId
  if (!tabId) {
    return
  }
  console.debug('[FindBar] open: tabId', tabId)
  const s = getState(tabId)
  s.visible = true
  focusNonce++
  if (!popover) {
    createPopover(s)
  } else {
    popover.reopen(computeAnchor(), panelData(s))
  }
  // 有历史关键字则重新触发查找以恢复高亮
  if (s.query) {
    window.browserAPI.startFind({ tabId, searchText: s.query })
  }
}

function close(tabId: string): void {
  console.debug('[FindBar] close: tabId', tabId)
  const s = getState(tabId)
  s.visible = false
  s.matches = 0
  s.activeMatch = -1
  window.browserAPI.endFind(tabId)
  popover?.close()
  popover = null
}

function onFoundInPage(data: { matches: number, activeMatch: number, tabId: string }): void {
  const s = getState(data.tabId)
  s.matches = data.matches
  s.activeMatch = data.activeMatch
  console.debug('[FindBar] onFoundInPage: tabId matches active', data.tabId, data.matches, data.activeMatch)
  // 仅当结果属于当前激活 tab 时才回显到面板
  if (data.tabId === props.activeTabId && s.visible) {
    popover?.sendData(panelData(s))
  }
}

// Ctrl/Cmd+F 由主进程窗口级快捷键（registerAppShortcut）统一处理，转发 page:openFind 到此打开查找栏
function onOpenFind(tabId: string): void {
  console.debug('[FindBar] onOpenFind: tabId', tabId)
  if (tabId === props.activeTabId) {
    open()
  }
}

// tab 关闭：清理其查找状态与高亮
function onTabRemoved(tabId: string): void {
  console.debug('[FindBar] onTabRemoved: tabId', tabId)
  states.delete(tabId)
  window.browserAPI.endFind(tabId)
}

// 切换 tab：按新 tab 的状态自动恢复（重定位+回显+恢复高亮）或隐藏查找栏
watch(
  () => props.activeTabId,
  (tabId) => {
    if (!tabId) {
      console.debug('[FindBar] watch activeTabId: null, closing popover')
      popover?.close()
      popover = null
      return
    }
    const s = getState(tabId)
    if (s.visible) {
      console.debug('[FindBar] watch activeTabId: restore visible tabId', tabId)
      if (!popover) {
        createPopover(s)
      } else {
        popover.reopen(computeAnchor(), panelData(s))
      }
      if (s.query) {
        window.browserAPI.startFind({ tabId, searchText: s.query })
      }
    } else {
      console.debug('[FindBar] watch activeTabId: hide tabId', tabId)
      popover?.close()
      popover = null
    }
  },
)

onMounted(() => {
  console.debug('[FindBar] onMounted: registering listeners')
  window.browserAPI.onFoundInPage(onFoundInPage)
  window.browserAPI.onOpenFind(onOpenFind)
  window.browserAPI.onTabRemoved(onTabRemoved)
})

onUnmounted(() => {
  popover?.close()
  popover = null
})
</script>
