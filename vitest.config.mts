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
      include: [
        'lib/chess/**/*.ts',
        'lib/charts/**/*.ts',
        'lib/engine/**/*.ts',
        'lib/analysis/**/*.ts',
        'lib/puzzles/**/*.ts',
        'lib/spaced-repetition/**/*.ts',
      ],
      // store.ts y run.ts (analysis y puzzles) hablan con Postgres de verdad: se validan con
      // los *.integration.test.ts (que necesitan TEST_DB_URL), no con cobertura de unitarios.
      // Mismo criterio que lib/ingest/{store,run,pg-store,supabase-store}.ts, que por eso ni
      // siquiera estan en el include de arriba. `actions.ts` habla con Supabase via PostgREST
      // (mismo criterio que lib/data.ts, que tampoco esta en el include).
      exclude: [
        'lib/analysis/store.ts',
        'lib/analysis/run.ts',
        'lib/puzzles/store.ts',
        'lib/puzzles/run.ts',
        'lib/spaced-repetition/actions.ts',
        // Mismo criterio: es un hook de React que orquesta un Web Worker con Stockfish dentro.
        // Lo que hay que verificar de el (que la cancelacion no mezcle posiciones, que el .wasm
        // caido no rompa la pagina) solo se ve manejando la app en un navegador de verdad, no
        // con unitarios en memoria. El protocolo, la sesion y el transporte, que SI son
        // testeables, estan aparte justamente para poder cubrirlos: protocol.ts, session.ts y
        // worker-transport.ts estan al 100%.
        'lib/engine/useBrowserEngine.ts',
      ],
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
