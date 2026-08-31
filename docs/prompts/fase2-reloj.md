# Fase 2 · El reloj

Lee @CLAUDE.md, @PLAN.md, @docs/ENGINEERING.md y la sección "El cálculo del reloj" de
@docs/DATA-SOURCES.md.

Vamos con la Fase 2. Sigue sin haber motor: solo se puebla lo que se deriva del PGN.
docs/ENGINEERING.md es criterio de aceptación. Muéstrame el plan antes de escribir.

1. "pnpm moves:extract" (scripts/extract-moves.ts) que, para cada partida sin filas en moves y
   que no esté en estado 'skipped', parsee el PGN y escriba una fila por ply con: ply, is_mine,
   san, uci, phase, is_book, clock_ms y move_time_ms.

2. Parseo: @mliebelt/pgn-parser para headers, jugadas y comentarios %clk; chess.js para validar
   legalidad y obtener el UCI reproduciendo SAN jugada a jugada. OJO: este patrón NO llama a
   loadPgn, así que el try/catch va alrededor del bucle de chess.move(), que es el que lanza en
   chess.js 1.x. Una partida que falla se marca analysis_state = 'failed' y no detiene la
   corrida.

3. El tiempo por jugada:
      move_time_ms = clock_ms(ply n-2) - clock_ms(ply n) + incremento_ms
   Tres cosas que se equivocan siempre:
   - Diferenciar contra el ply n MENOS 2, la jugada anterior del mismo jugador, no contra n-1.
   - Sumar el incremento. Sin eso las jugadas rápidas dan negativo.
   - En los plies 1 y 2 el reloj previo NO es nulo: es games.base_seconds * 1000. Inclúyelos.
   Clampea el resultado a 0: %clk viene truncado a decisegundos y una jugada instantánea puede
   dar hasta -100 ms de forma legítima.

4. is_book: los plies cuyo número es menor o igual al ply_count de la apertura resuelta en
   games.opening_id. No necesita motor.

5. phase: 0 apertura mientras is_book o hasta el ply 20, lo que ocurra después; 2 final cuando
   cada bando tenga 6 piezas o menos SIN CONTAR peones ni reyes; 1 medio juego en el resto.

6. Página /reloj: tiempo gastado por número de jugada, distribución de tiempos por jugada,
   porcentaje de jugadas bajo 3 segundos por fase, y en qué momento de la partida se le acaba el
   tiempo en las derrotas con termination = 'timeout'.

7. La lógica de reloj y de fase vive en lib/chess/, es pura, y se testea sin base de datos.
   Los tests usan PGNs reales guardados en tests/fixtures/, no strings inventados. Incluye un
   fixture con incremento, uno sin incremento y uno de correspondencia sin %clk.

Tests de aceptación obligatorios antes de darlo por terminado:
- Ninguna fila con move_time_ms negativo después del clampeo.
- Para una partida de muestra con incremento: la suma de move_time_ms de un jugador, más su
  reloj final, menos los incrementos que ganó, reconstruye base_seconds. Si no cuadra, o falta
  el incremento o faltan los plies 1 y 2.
- CI en verde: lint, typecheck, test y build.
- Cobertura sobre 80% en lib/chess/.
- CLAUDE.md actualizado.
