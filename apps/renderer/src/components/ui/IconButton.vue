<template>
  <button
    class="icon-btn"
    :class="{ 'is-active': active, 'has-affix': hasAffix }"
    :disabled="disabled"
    :title="title"
    :style="btnStyle"
    @click="onClick"
  >
    <Icon v-if="prefix" :icon="prefix.name" :width="prefix.sz" :height="prefix.sz" />
    <Icon :icon="mainIcon.name" :width="mainIcon.sz" :height="mainIcon.sz" />
    <Icon v-if="suffix" :icon="suffix.name" :width="suffix.sz" :height="suffix.sz" />
  </button>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed } from 'vue'

interface IconConfig {
  name: string
  size: number
}

type IconArg = string | IconConfig

const props = withDefaults(
  defineProps<{
    /** 前置图标 */
    prefixIcon?: IconArg
    icon: IconArg
    /** 后置图标 */
    suffixIcon?: IconArg
    /** 按钮尺寸，number 表示宽高一致，[宽, 高] 表示分别指定；不传则自动计算 */
    btnSize?: number | [number, number]
    /** 图标之间的间距（px） */
    gap?: number
    /** 按钮内边距，number 表示 px，string 直接作为 CSS 值；不传则按 affix 自动（无 affix 为 0，有 affix 为 0 6px） */
    padding?: number | string
    /** hover / active 背景色：string 表示深浅同色，{ light, dark } 分别指定浅色/深色主题；不传则用 --bg-hover */
    hoverColor?: string | { light: string; dark: string }
    active?: boolean
    disabled?: boolean
    title?: string
  }>(),
  {
    gap: 6,
    active: false,
    disabled: false,
    title: '',
  },
)

const emit = defineEmits<{ (e: 'click', ev: MouseEvent): void }>()

const DEFAULT_SIZE = 18

function parseIcon(arg: IconArg): { name: string; sz: number } {
  if (typeof arg === 'string') return { name: arg, sz: DEFAULT_SIZE }
  return { name: arg.name, sz: arg.size }
}

const hasAffix = computed(() => !!(props.prefixIcon || props.suffixIcon))
const prefix = computed(() => (props.prefixIcon ? parseIcon(props.prefixIcon) : null))
const suffix = computed(() => (props.suffixIcon ? parseIcon(props.suffixIcon) : null))
const mainIcon = computed(() => parseIcon(props.icon))

function toEven(n: number): number {
  const v = Math.floor(n)
  return v % 2 === 0 ? v : v - 1
}

const btnStyle = computed(() => {
  const style: Record<string, string> = {}
  if (hasAffix.value) {
    // 有 affix 图标时宽度自动撑开，不设置 width
    let h: number
    if (props.btnSize !== undefined) {
      h = Array.isArray(props.btnSize) ? props.btnSize[1] : props.btnSize
    } else {
      const allIcons = [mainIcon.value, prefix.value, suffix.value].filter(Boolean) as { sz: number }[]
      const maxIcon = Math.max(...allIcons.map((i) => i.sz))
      h = toEven(maxIcon * 1.5)
    }
    style.height = `${h}px`
  } else if (props.btnSize !== undefined) {
    const [w, h] = Array.isArray(props.btnSize) ? props.btnSize : [props.btnSize, props.btnSize]
    style.width = `${w}px`
    style.height = `${h}px`
  } else {
    const size = toEven(DEFAULT_SIZE * 1.5)
    style.width = `${size}px`
    style.height = `${size}px`
  }
  if (props.padding !== undefined) {
    style.padding = typeof props.padding === 'number' ? `${props.padding}px` : props.padding
  } else if (hasAffix.value && props.btnSize === undefined) {
    style.padding = '0 6px'
  }
  if (props.hoverColor !== undefined) {
    if (typeof props.hoverColor === 'string') {
      style['--ib-hover-light'] = props.hoverColor
      style['--ib-hover-dark'] = props.hoverColor
    } else {
      style['--ib-hover-light'] = props.hoverColor.light
      style['--ib-hover-dark'] = props.hoverColor.dark
    }
  }
  style.gap = `${props.gap}px`
  return style
})

function onClick(ev: MouseEvent): void {
  if (props.disabled) return
  emit('click', ev)
}
</script>

<style lang="less" scoped>
.icon-btn {
  --ib-hover-light: var(--bg-hover);
  --ib-hover-dark: var(--bg-hover);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.12s ease;

  &.has-affix {
    border-radius: 8px;
  }

  &:disabled {
    color: var(--text-muted);
    cursor: not-allowed;
  }

  &:hover:not(:disabled),
  &.is-active {
    background: var(--ib-hover-dark);
  }
}

:root[data-theme='light'] .icon-btn:hover:not(:disabled),
:root[data-theme='light'] .icon-btn.is-active {
  background: var(--ib-hover-light);
}
</style>
