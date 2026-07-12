<template>
  <TooltipProvider :delay-duration="props.delayDuration">
    <TooltipRoot :disable-hoverable-content="props.disableHoverableContent">
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          class="tooltip-content"
          side="top"
          :side-offset="2"
        >
          <slot name="content" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'radix-vue'

const props = withDefaults(defineProps<{
  delayDuration?: number
  disableHoverableContent?: boolean
  class?: HTMLAttributes['class']
}>(), {
  delayDuration: 200,
  disableHoverableContent: true,
})
</script>

<style>
.tooltip-content {
  z-index: 9999;
  overflow: hidden;
  border-radius: 6px;
  border: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-primary, #fff);
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-primary, #333);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-width: 250px;
  line-height: 1.4;
}
</style>
