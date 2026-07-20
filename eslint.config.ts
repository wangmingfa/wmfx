import antfu from '@antfu/eslint-config'

export default antfu(
  {
    vue: true,
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
      // 打包产物 / 第三方资源目录，非手写源码，不参与 lint
      'resources/**',
    ],
  },
  {
    files: ['**/*.vue'],
    rules: {
      'no-console': 'off',
      'vue/block-order': ['error', { order: ['template', 'script', 'style'] }],
      'vue/component-api-style': ['error', ['script-setup']],
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/define-emits-declaration': ['error', 'type-based'],
      'vue/max-attributes-per-line': ['error', { singleline: { max: 1 }, multiline: { max: 1 } }],
      'vue/multi-word-component-names': 'off',
      'vue/no-useless-concat': 'warn',
      'vue/html-self-closing': [
        'error',
        {
          html: { void: 'always', normal: 'always', component: 'always' },
        },
      ],
    },
  }
)
