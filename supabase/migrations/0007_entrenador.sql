-- Fase 6C: el entrenador deja de ser "una jugada, un intento, sin explicacion".
--
-- Tres quejas concretas, y lo que cada una necesita de la base:
--
--  1. "los ejercicios son solo un movimiento"  -> `solution_line`, la linea principal completa
--     del motor. El motor YA la calculaba y `lib/engine/uci.ts` se quedaba solo con la primera
--     jugada; ahora se guarda entera y el ejercicio se juega hasta el final de la linea.
--
--  2. "si me equivoco no puedo intentarlo de nuevo" -> `played_uci` y `attempt_no` en
--     `puzzle_attempts`. Hasta ahora un intento guardaba un booleano y nada mas: no habia forma
--     de saber QUE jugada mala se elige una y otra vez, ni de distinguir "acerto al primer
--     intento" de "acerto al tercero", que es lo unico que hace honesta la repeticion espaciada.
--
--  3. "no me explica por que me equivoque" -> `refutation_line`: la linea principal de la
--     posicion DESPUES del blunder, que es exactamente como te castigaba el rival. De ahi sale
--     la explicacion, reproduciendo la linea sobre el tablero y contando el material.
--
-- Todas las columnas son nullable a proposito: los ejercicios ya construidos quedan con NULL y
-- los rellena `pnpm puzzles:enrich` corriendo el motor solo sobre ellos. La UI degrada mientras
-- tanto en vez de romperse.

alter table puzzles
  -- Para orientar el tablero. `build-puzzles` ya leia el color en la consulta de candidatos y
  -- nunca lo escribia, asi que el tablero se mostraba siempre desde las blancas aunque Gabriel
  -- hubiera jugado con negras.
  add column if not exists my_color            game_color,
  add column if not exists solution_line       text[],
  add column if not exists refutation_line     text[],
  -- Evaluacion en centipeones, EN PERSPECTIVA DEL QUE MUEVE en la posicion del ejercicio.
  -- No se normaliza a blancas como `moves.eval_cp` porque acá las dos evaluaciones se comparan
  -- entre si dentro de la misma posicion y con el mismo lado al mover (misma razon por la que
  -- `is_unique` no necesita los dos pasos de signo).
  add column if not exists eval_best_cp        int,
  add column if not exists eval_played_cp      int,
  -- La segunda mejor jugada y su evaluacion: el motor ya las calculaba con MultiPV=2 y se
  -- usaban solo para derivar el booleano `is_unique`, despues se tiraban. Sirven para decir
  -- "tambien servia X" cuando el ejercicio admite mas de una jugada buena.
  add column if not exists second_best_uci     varchar(5),
  add column if not exists second_best_cp      int;

alter table puzzle_attempts
  add column if not exists played_uci varchar(5),
  add column if not exists attempt_no smallint not null default 1,
  add column if not exists hint_used  boolean  not null default false;

comment on column puzzles.refutation_line is
  'Linea principal desde la posicion DESPUES del blunder: como el rival castigaba la jugada. Es el insumo de la explicacion.';
comment on column puzzles.solution_line is
  'Linea principal desde la posicion del ejercicio. El ejercicio se juega hasta el final de esta linea, no una sola jugada.';
comment on column puzzle_attempts.played_uci is
  'La jugada que se intento. Sin esto no se puede saber que error se repite.';

-- `puzzles_due_idx` era parcial `where is_unique`, asi que los ejercicios con mas de una jugada
-- buena se construian (pagando tiempo de motor) y despues NUNCA se servian: eran invisibles.
-- Ahora se sirven igual, etiquetados "hay mas de una jugada buena", y el filtro de calidad lo
-- decide la consulta, no el indice.
drop index if exists puzzles_due_idx;
create index if not exists puzzles_due_idx on puzzles (due_at);
