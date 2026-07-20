<template>
  <section class="section">
    <h2
      v-if="title"
      class="section-title"
    >
      {{ title }}
    </h2>
    <div class="section-body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 通用分组容器：可选标题 + 默认插槽，插槽内放置 SectionItem 形成带分割线的内容区。
 * 既用于设置页的分组，也用于「下载/历史」等按日期分组列表（每天一个 Section，每条一个 SectionItem）。
 */
withDefaults(
  defineProps<{
    /** 分组标题；留空则不显示标题 */
    title?: string
  }>(),
  { title: '' },
)
</script>

<style scoped>
.section {
  & + .section {
    margin-top: 28px;
  }
}

.section-title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.section-body {
  display: flex;
  flex-direction: column;
  /* 卡片效果：独立背景 + 圆角 + 细边框，与页面底色区分。
     去掉 body 内边距，上下留白交由每个 SectionItem 控制，使分割线能贴到卡片左右边缘 */
  padding: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}
</style>
