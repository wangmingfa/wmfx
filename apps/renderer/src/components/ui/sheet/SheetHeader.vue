<template>
  <div
    data-slot="sheet-header"
    :class="cn('flex items-center justify-between gap-2 px-4 border-b border-border', props.class)"
  >
    <div class="flex flex-col gap-1.5 min-h-[36px] justify-center flex-1">
      <slot />
    </div>
    <DialogClose class="rounded-xs text-foreground/80 hover:text-foreground disabled:pointer-events-none shrink-0 focus:outline-hidden">
      <X class="size-4" />
      <span class="sr-only">Close</span>
    </DialogClose>
  </div>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { X } from '@lucide/vue'
import { DialogClose } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>
