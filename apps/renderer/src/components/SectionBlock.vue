<template>
  <div class="section-block">
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * 非 SectionItem 内容放进 Section 时的包装组件。
 *
 * 背景：Section 的 body 是 padding:0，SectionItem 自带 padding:16px 20px，
 * 这样列表分割线能贴到卡片左右边缘。但非 SectionItem 内容（比如一段纯文本说明、
 * 一组按钮、一个状态网格）放在 Section 里就没有 padding，贴边难看。
 *
 * SectionBlock 就是"轻量版 SectionItem"——不加左右 label 结构，只继承 SectionItem
 * 的 padding 规则和分割线规则，让任意内容都能和 SectionItem 视觉上对齐。
 */
</script>

<style scoped lang="less">
.section-block {
  width: 100%;
  padding: 16px 20px;

  /* 第一个 block 上方不画线（SectionItem 也是 first-child 无 line） */
  &:first-child {
    border-top: none;
  }
}
</style>
