<template>
  <div class="reader-view">
    <div class="reader-bar">
      <button class="reader-exit" @click="exit">
        {{ t('reader.exit') }}
      </button>
    </div>
    <article v-if="article" class="reader-article">
      <h1 class="reader-title">
        {{ article.title }}
      </h1>
      <div v-if="article.byline" class="reader-byline">
        {{ t('reader.byline') }} {{ article.byline }}
      </div>
      <!-- Readability 输出未消毒，故在此用 DOMPurify 净化后再经 v-html 渲染（剥离 script/事件处理器/javascript: URI） -->
      <div class="reader-content" v-html="sanitizedContent" />
    </article>
    <div v-else class="reader-empty">
      {{ t('reader.failed') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import DOMPurify from 'dompurify'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'

interface ReaderArticle {
  title: string
  content: string
  byline: string | null
  url: string
}

const { t } = useI18n()
const article = ref<ReaderArticle | null>(null)

// Readability 输出为未消毒 HTML，v-html 前必须净化，防止正文携带的脚本/事件处理器执行（XSS）
const sanitizedContent = computed(() => (article.value ? DOMPurify.sanitize(article.value.content) : ''))

function onArticle(a: ReaderArticle): void {
  console.debug(`[ReaderView] onArticle: title=${a.title}`)
  article.value = a
}

/** 主动拉取当前 active tab 已提取的文章，兜底首次进入时 send 早于挂载丢失的竞态。 */
async function pullArticle(): Promise<void> {
  try {
    const list = await window.browserAPI.getList()
    const active = list.find((tab) => tab.active)
    if (!active) {
      console.debug('[ReaderView] pullArticle: 无 active tab')
      return
    }
    const pulled = await window.browserAPI.requestReaderArticle(active.id)
    // 若监听已先行填充则不覆盖（避免用可能过期的 pull 覆盖最新 push）
    if (pulled && !article.value) {
      console.debug(`[ReaderView] pullArticle: 命中 title=${pulled.title}`)
      article.value = pulled
    }
  } catch (err) {
    console.error(`[ReaderView] pullArticle: 拉取失败 ${String(err)}`)
  }
}

async function exit(): Promise<void> {
  console.info('[ReaderView] exit: 退出阅读模式')
  const list = await window.browserAPI.getList()
  const active = list.find((tab) => tab.active)
  if (active) await window.browserAPI.exitReadingMode(active.id)
}

// 保存 onReaderArticle 返回的 disposer，供 onUnmounted 精确退订，避免监听器泄漏
let disposeReaderArticle: (() => void) | null = null

onMounted(() => {
  console.debug('[ReaderView] onMounted: 订阅 reader:article 并主动拉取')
  disposeReaderArticle = window.browserAPI.onReaderArticle(onArticle)
  void pullArticle()
})

onUnmounted(() => {
  console.debug('[ReaderView] onUnmounted: 退订 reader:article 监听')
  disposeReaderArticle?.()
  disposeReaderArticle = null
})
</script>

<style scoped>
.reader-view {
  height: 100vh;
  overflow-y: auto;
  background: var(--bg-primary);
  color: var(--text-primary);
}
.reader-bar {
  position: sticky;
  top: 0;
  display: flex;
  justify-content: flex-end;
  padding: 8px 16px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  z-index: 1;
}
.reader-exit {
  padding: 6px 14px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md, 6px);
  cursor: pointer;
}
.reader-exit:hover {
  background: var(--bg-hover);
}
.reader-article {
  max-width: 38em;
  margin: 0 auto;
  padding: 24px 16px 80px;
  line-height: 1.8;
  font-size: 18px;
}
.reader-title {
  font-size: 28px;
  line-height: 1.3;
  margin-bottom: 8px;
  color: var(--text-primary);
}
.reader-byline {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 24px;
}
.reader-empty {
  max-width: 38em;
  margin: 0 auto;
  padding: 64px 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 16px;
}
.reader-content :deep(a) {
  color: var(--accent-color);
}
.reader-content :deep(img) {
  max-width: 100%;
  height: auto;
}
.reader-content :deep(pre) {
  background: var(--bg-secondary);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
}
.reader-content :deep(blockquote) {
  margin: 16px 0;
  padding-left: 16px;
  border-left: 3px solid var(--border-color);
  color: var(--text-secondary);
}
</style>
