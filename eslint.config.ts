import antfu from '@antfu/eslint-config'

export default antfu(
  {
    vue: true,
    stylistic: false,
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
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/multi-word-component-names': 'off',
      'vue/html-self-closing': [
        'error',
        {
          html: { void: 'always', normal: 'always', component: 'always' },
        },
      ],
    },
  }
)
