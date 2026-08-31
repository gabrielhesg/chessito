# Fase 4 · El entrenador

Lee @CLAUDE.md, @PLAN.md, @docs/ENGINEERING.md y la sección final de @docs/ANALYSIS-SPEC.md.

Vamos con la Fase 4, el entrenador con mis propias posiciones perdidas.
docs/ENGINEERING.md es criterio de aceptación.

1. "pnpm puzzles:build" (scripts/build-puzzles.ts) que genere filas en puzzles a partir de mis
   errores graves (classification = 3, is_mine, no is_book, no is_decided): el FEN de la
   posición ANTES de mi error, la jugada que jugué, la mejor jugada, y las pérdidas.

2. FILTRO DE CALIDAD OBLIGATORIO: antes de aceptar una posición, corre una pasada con
   MultiPV = 2 SOLO sobre esas posiciones candidatas. Si la segunda mejor jugada está a menos de
   10 puntos de win% de la primera, marca is_unique = false y no la sirvas. Sin este filtro el
   entrenador me va a marcar como error una jugada ganadora distinta y lo voy a abandonar en una
   semana.

3. Página /entrenador con react-chessboard, validación de jugadas con chess.js, y las posiciones
   servidas en orden de due_at, filtrando is_unique.

4. Repetición espaciada SM-2 simplificado sobre interval_days, ease y lapses. Registra cada
   intento en puzzle_attempts.

5. Etiqueta un theme por ejercicio cuando se pueda inferir del patrón: pieza colgada, permite
   horquilla, mate del pasillo, clavada.

No agregues gamificación, rachas ni notificaciones. Solo el ejercicio y el resultado.
