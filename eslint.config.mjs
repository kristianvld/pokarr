import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '.playwright-cli/**',
      'data/**',
      'dist/**',
      'docs/.vitepress/dist/**',
      'docs/versions/**/.vitepress/dist/**',
      'node_modules/**',
      'output/**'
    ]
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.es2024
      }
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }]
    }
  },
  {
    files: ['src/client/**/*.{ts,tsx}', 'src/assets.d.ts', 'docs/.vitepress/theme/**/*.ts', 'docs/.vitepress/theme/**/*.d.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2024
      }
    }
  },
  {
    files: ['server.ts', 'src/server/**/*.ts', 'scripts/**/*.ts', 'docs/.vitepress/config.mts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2024,
        Bun: 'readonly'
      }
    }
  },
  {
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    languageOptions: {
      globals: {
        ...globals.es2024,
        Bun: 'readonly'
      }
    }
  }
)
