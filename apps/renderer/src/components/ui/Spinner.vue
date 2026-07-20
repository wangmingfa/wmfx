<template>
  <div
    class="spinner-container"
    :style="containerStyle"
  >
    <svg
      class="spinner"
      :style="svgStyle"
      viewBox="0 0 20 20"
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        :style="circleStyle"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: number
    speed?: number
    color?: string
  }>(),
  {
    size: 16,
    speed: 1.4,
    color: 'var(--text-secondary)',
  },
)

const containerStyle = computed(() => {
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
  }
})

const svgStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  animationDuration: `${props.speed}s`,
}))

const circleStyle = computed(() => ({
  stroke: props.color,
  animationDuration: `${props.speed}s`,
}))
</script>

<style scoped>
.spinner-container {
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  display: inline-block;
  animation: rotate linear infinite;
  will-change: transform;
}

.spinner circle {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-dasharray: 1, 50;
  animation: dash ease-in-out infinite;
}

@keyframes rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes dash {
  0% {
    stroke-dasharray: 1, 50;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 25, 50;
    stroke-dashoffset: -12;
  }
  100% {
    stroke-dasharray: 1, 50;
    stroke-dashoffset: -50;
  }
}
</style>
