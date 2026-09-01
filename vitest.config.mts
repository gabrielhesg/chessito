import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Los dos archivos de integracion comparten la MISMA base (`TEST_DB_URL`) y uno de ellos
    // hace `drop schema public cascade` para partir de cero. En paralelo eso es una carrera:
    // en CI se cayo con "referenced schema was concurrently dropped" mientras un archivo
    // aplicaba las migraciones y el otro borraba el esquema. Los archivos corren en serie.
    // La suite completa demora ~5 s, asi que no se pierde nada medible.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // docs/ENGINEERING.md: 80% en la logica de dominio. En app/ no se exige.
      include: ['lib/chess/**/*.ts'],
      // Cuenta tambien los archivos que ningun test importa: si no, el umbral se mediria
      // sobre menos archivos de los que parece.
      all: true,
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
