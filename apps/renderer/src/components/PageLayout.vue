<template>
  <section class="page">
    <header class="page-header">
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
  </section>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { NInput } from 'naive-ui'
import { onBeforeUnmount, onMounted, ref } from 'vue'

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
  }>(),
  {
    title: '',
    icon: '',
    searchPlaceholder: '',
    bodyScroll: true,
    maxContentWidth: 1200,
  },
)

// 可选搜索框：父组件用 v-model:search 绑定即显示，不绑定则不显示
const search = defineModel<string>('search')

// 头部左右内容与主体滚动条都会挤占空间，导致头部中间区与下方主体内容列无法对齐。
// 这里实时测量左/右内容宽度与滚动条宽度，算出“中间可用区域”的宽度；
// 内容列宽度取该可用宽度与 maxContentWidth 的较小值，并在可用区域内居中，
// 让头部中间区与主体内容列共用同一宽度与居中偏移，从而始终对齐。
const leftEl = ref<HTMLElement | null>(null)
const rightEl = ref<HTMLElement | null>(null)
const bodyEl = ref<HTMLElement | null>(null)
const leftWidth = ref('0px')
const rightWidth = ref('0px')
const scrollbarWidth = ref('0px')
// 内容列最终宽度（受 maxContentWidth 限制）
const contentWidth = ref('0px')
// 内容列在可用区域中居中所需的左右偏移（窗口比 maxContentWidth 宽时出现）
const contentOffset = ref('0px')

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
}

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  measure()
  resizeObserver = new ResizeObserver(measure)
  for (const el of [leftEl.value, rightEl.value, bodyEl.value]) {
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
</style>
