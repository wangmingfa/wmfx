import antfu from '@antfu/eslint-config'

export default antfu(
  {
    // 启用 antfu 内置的 Vue 支持（含 vue-eslint-parser / eslint-plugin-vue）
    vue: true,
    // TS 由 biome 负责校验，这里让 antfu 不处理 .ts/.tsx/.mts
    ignores: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.mts',
      '**/*.json',
      '**/*.jsonc',
      '**/*.yaml',
      '**/*.yml',
      '**/*.md',
      '**/dist/**',
      '**/node_modules/**',
    ],
  },
  {
    // 仅对 Vue 文件应用规则覆盖
    files: ['**/*.vue'],
    rules: {
      'vue/block-order': ['error', { order: ['template', 'script', 'style'] }],
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/html-indent': ['error', 2],
      'vue/script-indent': ['error', 2, { baseIndent: 0, switchCase: 1 }],
      'vue/max-attributes-per-line': 'error',
      'vue/multi-word-component-names': 'off',
    },
  }
)
