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
    ],
  },
  {
    files: ['**/*.vue'],
    rules: {
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
