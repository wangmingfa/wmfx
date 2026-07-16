<template>
  <section class="settings-section">
    <h2 v-if="title" class="settings-section-title">
      {{ title }}
    </h2>
    <div class="settings-section-body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
/** 设置项分组：可选标题 + 默认插槽，插槽内放置 SettingsItem 形成带分割线的内容区 */
withDefaults(
  defineProps<{
    /** 分组标题；留空则不显示标题（简单页面可省略） */
    title?: string
  }>(),
  { title: '' },
)
</script>

<style scoped>
.settings-section {
  & + .settings-section {
    margin-top: 28px;
  }
}

.settings-section-title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.settings-section-body {
  display: flex;
  flex-direction: column;
  /* 卡片效果：独立背景 + 圆角 + 细边框，与页面底色区分。
     去掉 body 内边距，上下留白交由每个 SettingsItem 控制，
     使 item 之间的分割线能贴到卡片左右边缘 */
  padding: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}
</style>
