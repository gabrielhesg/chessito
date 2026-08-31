import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: ['.next/**', 'coverage/**', 'node_modules/**', 'next-env.d.ts', 'lib/database.types.ts'],
  },
  ...nextCoreWebVitals,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // docs/ENGINEERING.md: cero `any`, cero catch vacios, cero console.log de depuracion.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Los scripts batch imprimen su resumen por stdout: eso no es depuracion.
    files: ['scripts/**/*.ts', 'lib/log.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Los archivos de configuracion viven fuera del tsconfig del proyecto.
    files: ['*.mjs', '*.mts', '*.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
);
