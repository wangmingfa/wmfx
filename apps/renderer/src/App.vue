<template>
  <ChromeUI />
</template>

<script setup lang="ts">
import ChromeUI from './components/ChromeUI.vue'
</script>

<style>
* {
  margin: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: #ffffff;
  color: #333333;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  user-select: none;
  -webkit-user-select: none;
}
</style>
