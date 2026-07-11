<template>
  <main>
    <h1>AI Browser</h1>
    <button
      data-testid="ping-btn"
      @click="sendPing"
    >
      Ping main
    </button>
    <p data-testid="pong">
      {{ pong }}
    </p>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const pong = ref<string>('')
async function sendPing() {
  pong.value = await window.browserAPI.ping('hello from renderer')
}
</script>
