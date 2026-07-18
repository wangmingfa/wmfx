<template>
  <section class="page">
    <header ref="headerEl" class="page-header">
      <div class="page-header-left">
        <slot name="icon">
          <Icon v-if="icon" :icon="icon" class="page-header-icon" width="22" height="22" />
        </slot>
        <h1 v-if="title" class="page-header-title">
          {{ title }}
        </h1>
      </div>

      <div class="page-header-center">
        <div class="page-header-center-inner">
          <slot name="search">
            <NInput
              v-if="search !== undefined"
              v-model:value="search"
              class="page-search"
              :placeholder="searchPlaceholder"
              clearable
            />
          </slot>
        </div>
      </div>

      <div class="page-header-right">
        <slot name="actions" />
      </div>
    </header>

    <main class="page-body" :class="{ 'no-scroll': !bodyScroll }">
      <div class="page-body-inner" :class="{ fill: !bodyScroll }">
        <slot />
      </div>
    </main>

    <!-- 左侧悬浮菜单：绝对定位于内容列左侧，不占据文档流，不会把 page-body-inner 往右挤 -->
    <nav v-if="sideMenu?.length" class="page-side-menu">
      <RouterLink
        v-for="item in sideMenu"
        :key="item.key"
        :to="item.to ?? ''"
        class="page-side-menu-item"
        :class="{ 'is-active': item.to && isActive(item.to) }"
      >
        <Icon v-if="item.icon" :icon="item.icon" width="18" height="18" class="page-side-menu-icon" />
        <span>{{ t(item.labelKey) }}</span>
      </RouterLink>
    </nav>
  </section>
</template>

<script setup lang="ts">
import type { SideMenuItem } from './side-menu'
import { Icon } from '@iconify/vue'
import { NInput } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from '../composables/useI18n'
import { usePageTitle } from '../composables/usePageTitle'

const props = withDefaults(
  defineProps<{
    /** 左侧标题文本 */
    title?: string
    /** 左侧图标（iconify 名称），留空则不显示 */
    icon?: string
    /** 搜索框占位符 */
    searchPlaceholder?: string
    /** 主体是否自带滚动（默认 true）。为 false 时由内部内容自行滚动 */
    bodyScroll?: boolean
    /** 内容列最大宽度（px），头部中间区与主体共用，默认 1200；窗口更宽时内容居中、不无限拉伸 */
    maxContentWidth?: number
    /** 左侧悬浮菜单配置；提供时在内容列左侧悬浮显示，不挤压主体内容 */
    sideMenu?: SideMenuItem[]
  }>(),
  {
    title: '',
    icon: '',
    searchPlaceholder: '',
    bodyScroll: true,
    maxContentWidth: 1200,
    sideMenu: undefined,
  },
)

// 可选搜索框：父组件用 v-model:search 绑定即显示，不绑定则不显示
const search = defineModel<string>('search')

const { t } = useI18n()
const route = useRoute()

/** 判断某菜单项路由是否为当前激活路由（含子路由） */
function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(`${to}/`)
}

// 标题存在时同步到 document.title（标签页标题与头部标题保持一致）
usePageTitle(computed(() => props.title))

// 布局模型（整组整窗居中）：
// - 把「侧边栏 + 间距 + 内容列」当作一个整体，在整个窗口宽度内居中。
// - 内容列宽度 = clamp(0, maxContentWidth, 整组可用宽 - 侧边栏占位)：
//   宽窗时内容列取 maxContentWidth（整组居中，侧边栏悬浮其左）；
//   窄窗放不下时内容列被压小，让位给侧边栏，两者并排不重叠，整组仍居中。
// - 内容列宽度/左边缘、侧边栏左边缘均由 JS 算出，用 CSS 变量注入，因此不随
//   「头部左右元素多宽 / 当前页是否出现滚动条」变化 —— 故切页不横跳。
// 需要 JS 提供的量：恒定滚动条槽宽（对齐头部预留）、头部高度（侧边栏顶部对齐主体顶部）、
// 内容列宽度、内容列左边缘、侧边栏左边缘。
const headerEl = ref<HTMLElement | null>(null)
const scrollbarWidth = ref('0px')
// 头部高度：悬浮菜单据此定位到主体内容顶部
const headerHeight = ref('0px')
// 内容列外框宽度（px）
const contentWidth = ref('0px')
// 内容列左边缘（相对视口左侧，px）；头部中间区据此对齐
const contentLeftEdge = ref('0px')
// 侧边栏左边缘（相对视口左侧，px）；即整组的左边缘
const sideMenuLeftEdge = ref('0px')

// 布局常量：侧边栏宽、侧边栏与内容列的间距、整组两侧最小视口边距
const SIDE_MENU_WIDTH = 220
const SIDE_MENU_GAP = 16
const VIEWPORT_MARGIN = 16
// 有侧边栏时它占据的水平槽位（宽 + 与内容列间距）
const sideMenuSlot = computed(() => (props.sideMenu?.length ? SIDE_MENU_WIDTH + SIDE_MENU_GAP : 0))

/**
 * 稳定测量滚动条槽位宽度。
 * .page-body 使用 scrollbar-gutter: stable，滚动条槽位恒定保留（无论内容是否溢出）。
 * 但直接用主体元素的 offsetWidth - clientWidth 会在“内容溢出/不溢出”之间跳变
 * （不同页面、不同帧测得 0 或 ~15px），进而导致切页抖动。
 * 这里用一个同样 scrollbar-gutter: stable 的离屏探针测槽宽——该值只取决于系统滚动条尺寸，
 * 与当前内容是否溢出无关，故恒定，切页时不再变化。
 */
function measureScrollbarGutter(): number {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:absolute;top:-9999px;width:100px;height:100px;overflow-y:auto;scrollbar-gutter:stable;visibility:hidden;'
  document.body.appendChild(probe)
  const width = probe.offsetWidth - probe.clientWidth
  document.body.removeChild(probe)
  return width
}

// 滚动条槽宽为系统级恒定值，仅需测一次；随窗口 DPI 变化时由 resize 重测
let cachedScrollbarWidth = 0

function measure(): void {
  const scrollbar = cachedScrollbarWidth
  scrollbarWidth.value = `${scrollbar}px`
  headerHeight.value = `${headerEl.value?.offsetHeight ?? 0}px`
  // 可用视口内容宽（扣除滚动条槽）
  const viewport = Math.max(0, window.innerWidth - scrollbar)
  const slot = sideMenuSlot.value
  // 整组（侧边栏 + 间距 + 内容列）可用宽 = 视口 - 两侧最小边距
  const groupMax = Math.max(0, viewport - VIEWPORT_MARGIN * 2)
  // 内容列宽 = clamp(0, maxContentWidth, 整组可用宽 - 侧边栏占位)
  //   宽窗：取 maxContentWidth；窄窗：被压小让位侧边栏
  const column = Math.max(0, Math.min(props.maxContentWidth, groupMax - slot))
  // 整组实际宽 = 侧边栏占位 + 内容列宽；整组左边缘使整组在视口内居中
  const groupWidth = slot + column
  const groupLeft = Math.max(VIEWPORT_MARGIN, (viewport - groupWidth) / 2)
  contentWidth.value = `${column}px`
  sideMenuLeftEdge.value = `${groupLeft}px`
  contentLeftEdge.value = `${groupLeft + slot}px`
  console.debug(
    '[PageLayout] measure: viewport slot column groupLeft scrollbar',
    viewport,
    slot,
    column,
    groupLeft,
    scrollbar,
  )
}

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  cachedScrollbarWidth = measureScrollbarGutter()
  measure()
  // 仅需在头部高度变化时重算侧边栏顶部（如标题换行）；内容列居中由纯 CSS 处理，无需观察主体。
  resizeObserver = new ResizeObserver(measure)
  if (headerEl.value) resizeObserver.observe(headerEl.value)
  window.addEventListener('resize', onWindowResize)
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', onWindowResize)
})

// 窗口尺寸变化时重测槽宽（DPI/缩放可能改变系统滚动条尺寸）并重算布局
function onWindowResize(): void {
  cachedScrollbarWidth = measureScrollbarGutter()
  measure()
}
</script>

<style lang="less" scoped>
.page {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
  color: var(--text-primary);
}

/* 头部占满整个浏览器宽度：左/右绝对定位贴边，中间区居中、与主体内容左右对齐。
   右侧额外预留滚动条宽度，抵消主体滚动条对内容列的挤压，使上下对齐 */
.page-header {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 12px 24px;
  padding-right: calc(24px + v-bind(scrollbarWidth));
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  /* 左/右为绝对定位不贡献高度，无搜索框时仍保证头部高度 */
  min-height: 48px;
}

.page-header-left {
  position: absolute;
  left: 24px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-header-icon {
  flex-shrink: 0;
}

.page-header-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  white-space: nowrap;
}

/* 中间区域脱离头部文档流，横跨整个头部宽度（扣除滚动条槽）；内部内容列用 JS 算出的
   宽度 + 左边缘定位，与下方主体内容列采用同一“整组居中”模型，从而上下对齐、切页不横跳 */
.page-header-center {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  left: 0;
  right: v-bind(scrollbarWidth);
  min-width: 0;
}

.page-header-center-inner {
  width: v-bind(contentWidth);
  margin-left: v-bind(contentLeftEdge);
  padding: 0 24px;
  box-sizing: border-box;
}

.page-search {
  width: 100%;
}

.page-header-right {
  position: absolute;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 滚动区域：满宽，使滚动条贴着浏览器右边；scrollbar-gutter: stable 始终为滚动条预留同等宽度
   （无论是否出现），避免内容列在出现滚动条时跳动，并保证与头部预留的滚动条宽度一致 */
.page-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;

  &.no-scroll {
    overflow: visible;
  }
}

/* 主体内容列：宽度与左边缘由 JS 按“整组居中”模型算出（width + margin-left）。
   宽窗时宽度 = maxContentWidth，整组（侧边栏 + 内容列）居中；窄窗时宽度被压小让位侧边栏。
   仅依赖算出的量，与头部左右元素、当前页是否出现滚动条无关 —— 故切换子页时不横跳。 */
.page-body-inner {
  width: v-bind(contentWidth);
  margin-left: v-bind(contentLeftEdge);
  padding: 24px;
  box-sizing: border-box;

  &.fill {
    height: 100%;
    box-sizing: border-box;
  }
}

/* 左侧悬浮菜单：绝对定位于居中整组的左边缘（sideMenuLeftEdge），与内容列并排、不重叠。
    left 直接取整组左边缘（内容列宽度已在窄窗时被压小让位）；宽度恒定 220px。
    顶部对齐内容列（头部下沿 + 24px）。
    高度取"自身内容所需"与"内容列可用高度"的较大者：内容少时随内容自然高度（不强行撑满），
    内容多或窗口很高时最多占满到页面底部（max-height），超出则在菜单内部纵向滚动。
    由于是 .page 的直接子元素（非滚动容器），内容滚动时菜单保持固定不跟随。 */
.page-side-menu {
  position: absolute;
  top: calc(v-bind(headerHeight) + 24px);
  left: v-bind(sideMenuLeftEdge);
  width: 220px;
  max-height: calc(100% - v-bind(headerHeight) - 48px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* 与内容区视觉区分：独立背景 + 右侧分隔线 + 圆角卡片感 */
  padding: 12px 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  /* 项过多时内部纵向滚动（min-height:0 让 flex 子项可收缩并触发滚动） */
  overflow-y: auto;
  min-height: 0;
  z-index: 5;
}

/* 内部滚动条收窄，避免与卡片宽度争抢 */
.page-side-menu::-webkit-scrollbar {
  width: 6px;
}

.page-side-menu::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.page-side-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
}

.page-side-menu-icon {
  flex-shrink: 0;
  opacity: 0.8;
}

.page-side-menu-item:hover {
  background: var(--bg-tertiary);
}

.page-side-menu-item.is-active {
  background: var(--accent-color);
  color: #fff;
}

.page-side-menu-item.is-active .page-side-menu-icon {
  opacity: 1;
}
</style>
