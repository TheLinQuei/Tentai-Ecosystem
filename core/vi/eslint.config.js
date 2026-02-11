import js from '@eslint/js';
import tsPlugin from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
  {
    ignores: ['node_modules/', 'dist/', 'coverage/', '.next/']
  },
  js.configs.recommended,
  ...tsPlugin.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsPlugin.parser,
      parserOptions: {
        project: './tsconfig.json'
      }
    },
    plugins: {
      prettier: prettierPlugin,
      '@typescript-eslint': tsPlugin.plugin
    },
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-types': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' }
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }]
    }
  },
  prettier
];
