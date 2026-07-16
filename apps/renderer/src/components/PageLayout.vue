<template>
  <section class="page">
    <header ref="headerEl" class="page-header">
      <div ref="leftEl" class="page-header-left">
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

      <div ref="rightEl" class="page-header-right">
        <slot name="actions" />
      </div>
    </header>

    <main ref="bodyEl" class="page-body" :class="{ 'no-scroll': !bodyScroll }">
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

// 头部左右内容与主体滚动条都会挤占空间，导致头部中间区与下方主体内容列无法对齐。
// 这里实时测量左/右内容宽度与滚动条宽度，算出“中间可用区域”的宽度；
// 内容列宽度取该可用宽度与 maxContentWidth 的较小值，并在可用区域内居中，
// 让头部中间区与主体内容列共用同一宽度与居中偏移，从而始终对齐。
const leftEl = ref<HTMLElement | null>(null)
const rightEl = ref<HTMLElement | null>(null)
const bodyEl = ref<HTMLElement | null>(null)
const headerEl = ref<HTMLElement | null>(null)
const leftWidth = ref('0px')
const rightWidth = ref('0px')
const scrollbarWidth = ref('0px')
// 内容列最终宽度（受 maxContentWidth 限制）
const contentWidth = ref('0px')
// 内容列在可用区域中居中所需的左右偏移（窗口比 maxContentWidth 宽时出现）
const contentOffset = ref('0px')
// 头部高度：悬浮菜单据此定位到主体内容顶部
const headerHeight = ref('0px')

function measure(): void {
  const left = leftEl.value?.offsetWidth ?? 0
  const right = rightEl.value?.offsetWidth ?? 0
  const scrollbar = bodyEl.value ? bodyEl.value.offsetWidth - bodyEl.value.clientWidth : 0
  // 可用区域 = 窗口内容宽（扣除滚动条）减去左右内容宽度与两侧内边距（各 24px）
  const available = Math.max(0, window.innerWidth - scrollbar - left - right - 48)
  const content = Math.min(available, props.maxContentWidth)
  leftWidth.value = `${left}px`
  rightWidth.value = `${right}px`
  scrollbarWidth.value = `${scrollbar}px`
  contentWidth.value = `${content}px`
  contentOffset.value = `${Math.max(0, (available - content) / 2)}px`
  headerHeight.value = `${headerEl.value?.offsetHeight ?? 0}px`
}

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  measure()
  resizeObserver = new ResizeObserver(measure)
  for (const el of [leftEl.value, rightEl.value, bodyEl.value, headerEl.value]) {
    if (el) resizeObserver.observe(el)
  }
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', measure)
})
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

/* 中间区域脱离头部文档流，左右边界由左右内容宽度与滚动条宽度动态算出（见脚本 measure），
   精确框定左右内容之间的“可用区域”；内部内容列再在该区域内居中并受 maxContentWidth 限制 */
.page-header-center {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  left: calc(24px + v-bind(leftWidth));
  right: calc(24px + v-bind(rightWidth) + v-bind(scrollbarWidth));
  min-width: 0;
}

.page-header-center-inner {
  width: v-bind(contentWidth);
  max-width: 100%;
  margin: 0 auto;
  padding: 0 24px;
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

/* 主体内容列与头部中间区共用同一宽度（contentWidth）与居中偏移（contentOffset），
    左右边界一致，保证上下对齐；宽度随窗口与头部左右内容动态变化，且不超过 maxContentWidth */
.page-body-inner {
  margin-left: calc(24px + v-bind(leftWidth) + v-bind(contentOffset));
  margin-right: calc(24px + v-bind(rightWidth) + v-bind(contentOffset));
  padding: 24px;

  &.fill {
    height: 100%;
    box-sizing: border-box;
  }
}

/* 左侧悬浮菜单：绝对定位于主体内容列左侧，不进入文档流，因此不会把 page-body-inner 往右挤。
    右侧贴着内容列左边（留 16px 间距），随窗口与内容列共用同一左侧偏移（leftWidth + contentOffset），
    窗口变窄时左侧下限钳制到 16px 避免溢出视口；顶部对齐内容列（头部下沿 + 24px）。
    高度取"自身内容所需"与"内容列可用高度"的较大者：内容少时随内容自然高度（不强行撑满），
    内容多或窗口很高时最多占满到页面底部（max-height），超出则在菜单内部纵向滚动。
    由于是 .page 的直接子元素（非滚动容器），内容滚动时菜单保持固定不跟随。 */
.page-side-menu {
  position: absolute;
  top: calc(v-bind(headerHeight) + 24px);
  left: max(16px, calc(24px + v-bind(leftWidth) + v-bind(contentOffset) - 220px - 16px));
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
