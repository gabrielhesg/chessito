# 00 · Inventario

**Commit revisado:** `1855bd7cea65c91b362b99576e6cc0b52ab01e7d` (2026-09-15 21:00 -03)
**Fecha de la revisión:** 2026-09-16
**Rama de trabajo:** `review/plan-integral`, en el worktree `/home/user/chessito-review`
**Base consultada:** Supabase `chessito-prod` (`tnyphngqoajoqeeqvkkq`), **solo SELECT**

> Este archivo es la única fuente de datos para los tres informes de la Fase A1. Los subagentes
> NO tienen acceso a la base: todo lo que necesiten medir tiene que estar pegado acá.

---

## 1. Qué es esta app y qué se le pide

App personal de ajedrez para un solo usuario (Gabriel, 1243-1268 en rápida en chess.com, meta
2000). Ingiere sus partidas de chess.com y responde cuatro preguntas: contra qué aperturas
pierde, tilt y fatiga, dónde cuelga piezas, y si los errores vienen de jugar rápido. Construida
hasta la Fase 12.

**Plan de entrenamiento declarado del alumno** (contexto externo, no está en el repo):
cero bala hasta 1500; formato base 15+10; toda derrota se analiza **primero sin motor**; ciclo
de 8 semanas (seguridad y amenazas, finales de rey y peón, encontrar un plan, estructuras de
peones, finales de torre, táctica con nombre, repertorio, auditoría de errores).
**Debilidades declaradas:** cuelga piezas, y no sabe qué hacer en el medio juego.
**Repertorio:** Ponziani con blancas, 1…e5 contra 1.e4, esquema d5/Cf6/e6 contra 1.d4.
**Uso:** casi siempre desde el celular.

**Riesgo principal del proyecto** (declarado en `PLAN.md` y `README.md`): que construir o usar
la app reemplace a jugar ajedrez.

---

## 2. Mapa de la app

10 rutas, todas Server Components salvo lo indicado. No existen `loading.tsx`, `error.tsx` ni
`not-found.tsx` en `app/`. Todas con `export const dynamic = 'force-dynamic'`.
Gate de un solo usuario en `middleware.ts:14` (sesión Supabase + `OWNER_EMAIL`), que excluye
`/api/ingest` y `/stockfish` (`middleware.ts:93`).

| Ruta | Qué muestra | Acciones | Estado |
|---|---|---|---|
| `/` (`app/page.tsx:56`) | "Tu plan de hoy" (2 tareas), "Estás mejorando", "Esto no mejora", "No lo olvides jugando", rápida del mes vs meta 30 + calendario, rating de la clase dominante + sparkline, "lo próximo que vence", tarjeta a `/salud` | Server action `actualizarAhora` (ingesta, `:123`); links a `/entrenador` ×2 y `/salud` | **Hecho, con 3 bloques vacíos**: "Estás mejorando" (`:252`) y "No lo olvides jugando" (`:305`) son `PendienteDeDatos` fijos |
| `/aperturas` (`:40`) | Por color: `BarrasH` de las 8 peores con n≥20 + tabla completa (Apertura, ECO, Tipo, Rendimiento Wilson, Divergencia) | Orden por URL (`?sort=wilson\|n\|name&dir=`), `<details>`, link a `/salud` | Hecho |
| `/ritmo` (`:19`) | Por hora del día (24 barras), fatiga por índice de partida en la sesión (cap 6), tilt tras ganar/empatar/perder | Solo `<details>` | Hecho |
| `/reloj` (`:33`) | 3 `Stat`, tiempo por ply hasta 60, distribución de tiempos, por fase, momento del timeout | Solo `<details>` | Hecho |
| `/errores` (`:33`) | Errores por tiempo de jugada y por fase, tablas de detalle, diagnóstico de embudo si las tablas salen vacías | Ninguna | Hecho, **con `CLASE='rapid'` fijo (`:31`)** |
| `/registro` (`:40`) | Tabla de las 100 partidas más recientes con filtros | Filtros por clase/color/resultado (links), orden por fecha o rating, `Analizar` → `/partida/{id}`, `↗` a chess.com | Hecho |
| `/salud` (`:24`) | 4 `Stat`, 10 chequeos de calidad, reconciliación mes a mes contra chess.com, últimas 15 corridas, partidas por mes | Server action `analizarAhora` → dispara `analyze.yml` en GitHub Actions (`:47`) | Hecho |
| `/entrenador` (`:56`) | Ejercicio vencido + "Resueltos hoy" + panel "los errores que más has repetido" | **Cliente** `TrainerBoard`: arrastrar, pista, solución, reintentos sin límite, explorar la posición con motor, siguiente; server action `recordAttempt` | Hecho |
| `/partida/[id]` (`:61`) | Tablero de análisis con variaciones, relojes, barra de ventaja, `EvalChart`, motor del navegador, momentos clave, "Entrenar esta posición" | **Cliente** `GameReview`: navegar, arrastrar (crea variación), motor, `?ply=` | Hecho |
| `/entrar` (`:11`) | OTP por correo | 2 server actions | Hecho |

**Componentes cliente:** `Sidebar`, `GameReview`, `TrainerBoard`, `EnginePanel`, `MoveList`,
`MiniBoard`, `MiniBoardPopover`, `charts/EvalChart`, `ui/button`. Todo el resto es servidor.

**Escrituras interactivas:** `recordAttempt` (`lib/spaced-repetition/actions.ts:37`),
`actualizarAhora` (`app/page.tsx:123`), `analizarAhora` (`app/salud/page.tsx:47`), y las dos de
`/entrar`.

**Degradaciones deliberadas y buenas:** `gamesByDay().catch(()=>null)` (`app/page.tsx:84`),
`adorno()` en el entrenador (`app/entrenador/page.tsx:39`), `insignias()` en el layout
(`app/layout.tsx:31`), diagnóstico de embudo en `/errores` (`app/errores/page.tsx:54`).

---

## 3. Inventario de datos (consultas reales)

### 3.1 Volumen

```sql
select 'games' t, count(*) n from games union all select 'moves', count(*) from moves ...
```

| Tabla | Filas |
|---|---|
| `games` | **10.106** |
| `moves` | **579.194** |
| `openings` | 3.810 |
| `puzzles` | 400 |
| `puzzle_attempts` | 265 |
| `job_runs` | 37 |

```sql
select time_class, count(*) n, min(end_time)::date, max(end_time)::date,
       count(*) filter (where analysis_state='done') from games group by 1;
```

| `time_class` | n | desde | hasta | analizadas |
|---|---|---|---|---|
| blitz | 5.660 | 2024-11-27 | 2026-08-29 | 1.674 |
| rapid | 2.588 | 2024-10-18 | 2026-09-11 | **108** |
| bullet | 1.850 | 2024-12-04 | 2026-09-15 | 0 |
| daily | 8 | 2025-02-03 | 2026-09-11 | 0 |

### 3.2 Actividad por mes y rating (el hecho central)

```sql
select to_char(end_time at time zone 'America/Santiago','YYYY-MM') mes,
 count(*) filter (where time_class='rapid') rapid, ... max(my_rating) filter (where time_class='rapid')
from games group by 1 order by 1 desc limit 12;
```

| Mes | rápida | blitz | **bala** | rating rápida (máx del mes) | score rápida |
|---|---|---|---|---|---|
| 2026-09 (parcial) | 15 | 0 | **436** | 1268 | 0,600 |
| 2026-08 | 1 | 27 | **606** | 1243 | 1,000 |
| 2026-07 | 4 | 506 | **521** | 1234 | 0,750 |
| 2026-06 | 65 | 496 | 40 | 1315 | 0,431 |
| 2026-05 | 38 | 406 | 112 | 1350 | 0,408 |
| 2026-04 | 1 | 448 | 0 | 1336 | 1,000 |
| 2026-03 | 15 | 475 | 19 | 1354 | 0,467 |
| **2026-02** | **408** | 13 | 60 | **1464** | 0,507 |
| 2026-01 | 309 | 9 | 2 | 1421 | 0,505 |
| 2025-12 | 199 | 192 | 28 | 1270 | 0,520 |
| 2025-11 | 233 | 292 | 5 | 1339 | 0,536 |
| 2025-10 | 3 | 330 | 0 | 1038 | 0,667 |

Últimos 90 días: **1.600 de bala, 752 de blitz, 48 de rápida.**
El máximo histórico de rápida (1464) es de febrero de 2026, el mes con más partidas de rápida
jugadas (408). Hoy está en 1268.

**Nada de esto aparece en la app.** La portada muestra "rápida este mes: 15 / meta 30" y un
calendario que se enciende todos los días, porque cuenta todas las clases (`v_games_by_day`
expone `n_games` y `n_rapid`, `app/page.tsx:136` usa `n_games`).

### 3.3 `analysis_state`: 4.777 partidas jugables marcadas `skipped`

```sql
select time_class, analysis_state, count(*) from games group by 1,2;
```

| `time_class` | pending | done | **skipped** |
|---|---|---|---|
| rapid | 1.074 | 108 | **1.406** |
| blitz | 634 | 1.674 | **3.352** |
| bullet | 1.531 | 0 | **319** |
| daily | 0 | 0 | 8 |

```sql
select time_class, count(*) n, count(*) filter (where mv.n is null) sin_moves, avg(ply_count)
from games g left join (select game_id, count(*) n from moves group by 1) mv on mv.game_id=g.id
where g.analysis_state='skipped' group by 1;
```

| `time_class` | skipped | sin filas en `moves` | ply promedio |
|---|---|---|---|
| blitz | 3.352 | 1 | 57,1 |
| **rapid** | **1.406** | **0** | 54,2 |
| bullet | 319 | 0 | 52,6 |
| daily | 8 | 8 | 65,5 |

Muestra concreta:

```sql
select id, time_class, time_control, ply_count, (select count(*) from moves m where m.game_id=g.id) nmoves,
       (select count(*) from moves m where m.game_id=g.id and m.clock_ms is not null) con_reloj
from games g where analysis_state='skipped' and time_class='rapid' order by end_time desc limit 5;
```

| id | clase | control | ply_count | filas en `moves` | con `%clk` |
|---|---|---|---|---|---|
| 8886 | rapid | 600 | 37 | 37 | 37 |
| 8751 | rapid | 600 | 57 | 57 | 57 |
| 8750 | rapid | 600 | 48 | 48 | 48 |
| 8749 | rapid | 600 | 32 | 32 | 32 |
| 8748 | rapid | 600 | 107 | 107 | 107 |

**Hecho:** son partidas normales de 10 minutos, con todas sus jugadas extraídas y todos sus
relojes, marcadas `skipped`, o sea excluidas para siempre del motor.
El único código que marca `skipped` es `lib/chess/game.ts:105` (variantes, correspondencia y
`daily`) y `markMovesEmpty` (`lib/ingest/extract-moves.ts:56`, solo si el PGN no tiene jugadas).
Ninguno de los dos aplica a estas filas. `git log` muestra que `lib/chess/game.ts` nunca cambió
(un solo commit). **Hipótesis (no verificada):** una corrida manual de SQL en el editor de
Supabase; `CLAUDE.md` documenta que el esquema se creó a mano pegando SQL.

**Consecuencia medida:** ningún chequeo lo detecta. Los 10 de `v_data_quality` están en verde:

| chequeo | ok | offenders |
|---|---|---|
| aperturas_sin_resolver | ✅ | 1 |
| clasificacion_sin_metrica | ✅ | 0 |
| conteo_de_jugadas_no_calza | ✅ | 0 |
| errores_solo_de_un_color | ✅ | 0 |
| evaluaciones_fuera_de_rango | ✅ | 0 |
| mezcla_de_motores | ✅ | 1 |
| partidas_analizadas_sin_jugadas | ✅ | 0 |
| partidas_reclamadas_huerfanas | ✅ | 0 |
| perdidas_negativas | ✅ | 0 |
| tiempos_de_jugada_negativos | ✅ | 0 |

Y `v_analysis_coverage` no las nombra: las `skipped` no son ni analizadas ni pendientes ni
fallidas, así que desaparecen del denominador sin dejar rastro.

```sql
select * from v_analysis_coverage;
```

| clase | n_games | n_analyzed | n_pending | n_failed |
|---|---|---|---|---|
| blitz | 5.660 | 1.674 | 634 | 0 |
| bullet | 1.850 | 0 | 1.531 | 0 |
| daily | 8 | 0 | 0 | 0 |
| **rapid** | **2.588** | **108** | **1.074** | 0 |

### 3.4 El orden de análisis mata la rápida

`lib/analysis/store.ts:71`:

```sql
order by (time_class in ('rapid', 'blitz')) desc, end_time desc
```

Rápida y blitz empatan en la primera clave, así que decide `end_time desc`. Como el histórico
reciente es casi todo blitz y bala, el motor consume blitz. Resultado: **1.674 de blitz
analizadas contra 108 de rápida**, y `/errores` filtra `CLASE='rapid'` fijo
(`app/errores/page.tsx:31`), así que la página que responde "dónde cuelgo piezas" habla con
108 partidas mientras hay 1.674 analizadas al lado que no puede usar.

### 3.5 Nulos en columnas clave

```sql
select count(*), pct de nulos ... from games;
```

| columna | % nulo | nota |
|---|---|---|
| `my_accuracy` | 72,1 % | chess.com solo la entrega si alguien pidió Game Review |
| `opening_id` | 0,0 % | resolución por EPD casi perfecta |
| `session_id` | 0,0 % | |
| `divergence_ply` | 91,8 % | solo existe en partidas analizadas |
| `acpl` | 82,1 % | ídem |

```sql
select ... from moves;
```

| columna | % nulo |
|---|---|
| `clock_ms` | **0,00 %** |
| `move_time_ms` | **0,00 %** |
| `eval_cp` | 83,23 % |
| `classification` | 83,23 % |

`moves`: 289.727 son de Gabriel, 54.594 son de libro, 14.703 están decididas.

### 3.6 La clasificación de fase está rota

`lib/chess/phase.ts:14` define `ENDGAME_MAX_PIECES = 6` contando piezas **sin peones ni reyes**.
Al inicio cada bando tiene **7** (D + 2T + 2A + 2C). O sea: **basta cambiar una pieza por bando
para que la app declare "final"**.

Medido:

```sql
select * from v_errors_by_phase where time_class in ('rapid','blitz');
```

| clase | fase | n_moves | graves | errores | imprecisiones | cp perdidos (prom) |
|---|---|---|---|---|---|---|
| blitz | 0 apertura | 11.878 | 207 | 236 | 828 | 52,6 |
| blitz | **1 medio juego** | **1.604** | 82 | 86 | 197 | 118,7 |
| blitz | **2 final** | **24.385** | 1.360 | 866 | 1.936 | 161,6 |
| rapid | 0 apertura | 876 | 18 | 20 | 67 | 55,4 |
| rapid | **1 medio juego** | **112** | 10 | 6 | 17 | 228,7 |
| rapid | **2 final** | **2.041** | 102 | 60 | 169 | 127,4 |

```sql
select phase, n, avg_move_time_ms, pct_under_3s_lower from v_move_time_by_phase;
```

| fase | n jugadas | tiempo medio |
|---|---|---|
| 0 apertura | 98.681 | 4.267 ms |
| **1 medio juego** | **10.699** | 9.046 ms |
| **2 final** | **180.347** | 6.683 ms |

Y en `v_timeout_moment`: **853 de 854** derrotas por tiempo caen en "final", 1 en medio juego.

**Hecho:** lo que la app llama "final" es el medio juego. Un jugador cuya debilidad declarada es
"no sé qué hacer en el medio juego" abre `/errores`, ve 102 de 130 errores graves en "final", y
concluye que tiene un problema de finales.

### 3.7 Los errores NO están en las jugadas rápidas

```sql
select * from v_errors_by_move_time where time_class in ('rapid','blitz');
```

| clase | bucket | n_moves | errores | **tasa** | cp perdidos |
|---|---|---|---|---|---|
| rapid | `<3s` | 1.043 | 35 | **3,4 %** | 64,2 |
| rapid | `3-10s` | 1.199 | 101 | 8,4 % | 136,6 |
| rapid | `10-30s` | 662 | 57 | 8,6 % | 123,7 |
| rapid | `>30s` | 125 | 23 | **18,4 %** | 171,8 |
| blitz | `<3s` | 16.363 | 734 | **4,5 %** | 88,0 |
| blitz | `3-10s` | 15.015 | 1.253 | 8,3 % | 124,4 |
| blitz | `10-30s` | 6.044 | 759 | 12,6 % | 217,9 |
| blitz | `>30s` | 445 | 91 | **20,4 %** | 295,5 |

**Hecho:** la tasa de error es 5 veces mayor en las jugadas que más piensa que en las
instantáneas, de forma monótona y en ambas clases. La pregunta 4 del proyecto ("¿los errores se
concentran en las jugadas rápidas?") ya tiene respuesta y es **no**.
`/errores` dibuja exactamente estos datos y no dice la conclusión en ningún lado
(`app/errores/page.tsx:132-157`, el título es la pregunta, no la respuesta).

*Advertencia metodológica para quien lo use:* pensar mucho correlaciona con posiciones difíciles.
No es prueba de causalidad; sí desmiente la hipótesis del proyecto.

### 3.8 Tilt y fatiga: no hay efecto

```sql
select * from v_after_result where time_class='rapid';
select * from v_by_session_index where time_class='rapid' and n>=20;
```

| Corte | n | score | Wilson inferior |
|---|---|---|---|
| tras ganar | 959 | 0,535 | 0,503 |
| tras perder | 987 | 0,511 | 0,479 |
| tras empatar | 53 | 0,528 | 0,397 |
| partida 1 de la sesión | 589 | 0,535 | 0,494 |
| partida 2 | 467 | 0,512 | 0,467 |
| partida 3 | 367 | 0,512 | 0,461 |
| partida 4 | 276 | 0,504 | 0,445 |
| partida 5 | 199 | 0,578 | 0,508 |
| partida 6 o más | 690 | 0,528 | 0,490 |

Los intervalos se solapan por completo. **`/ritmo` es una página entera —una de las cuatro
preguntas fundacionales— cuya respuesta medida es "no hay efecto", y la página no lo dice.**

Por hora sí hay algo de señal (n≥20, rápida):

| hora | n | score | Wilson |
|---|---|---|---|
| 11 | 168 | 0,610 | 0,535 |
| 20 | 113 | 0,615 | 0,523 |
| 19 | 157 | 0,561 | 0,482 |
| 14 | 246 | 0,506 | 0,444 |
| 17 | 223 | 0,484 | 0,420 |
| 16 | 209 | 0,488 | 0,421 |
| **13** | 213 | **0,453** | **0,388** |

### 3.9 Aperturas (rápida, n≥20) — el repertorio funciona

```sql
select opening_name, eco, my_color, n, score_pct, score_pct_lower, n_analyzed
from v_opening_performance where n>=20 and time_class='rapid' order by n desc;
```

| Apertura | ECO | color | n | score | Wilson | analizadas |
|---|---|---|---|---|---|---|
| **Ponziani Opening** | C44 | blancas | 165 | 0,579 | 0,502 | 11 |
| **Ponziani: Jaenisch Counterattack** | C44 | blancas | 131 | 0,630 | 0,544 | 13 |
| Philidor Defense | C41 | blancas | 72 | 0,458 | 0,348 | 4 |
| King's Pawn: Wayward Queen Attack | C20 | negras | 67 | 0,530 | 0,412 | 2 |
| **Scotch Game: Lolli Variation** | C44 | negras | 53 | **0,406** | 0,284 | 1 |
| Italian: Two Knights Defense | C55 | negras | 48 | 0,563 | 0,423 | 0 |
| Italian: Giuoco Pianissimo | C50 | negras | 46 | 0,576 | 0,433 | 2 |
| Scandinavian: Mieses-Kotroc | B01 | blancas | 43 | 0,709 | 0,561 | 1 |
| Bishop's Opening | C23 | negras | 42 | 0,583 | 0,433 | 1 |
| Sicilian: Old Sicilian | B30 | blancas | 41 | 0,451 | 0,310 | 5 |
| French: Normal Variation | C00 | blancas | 40 | 0,475 | 0,329 | 2 |
| **Englund Gambit** | A40 | negras | 33 | **0,394** | 0,247 | 0 |
| **Four Knights: Italian Variation** | C47 | blancas | 23 | **0,348** | 0,188 | 0 |
| **Modern Defense** | B06 | blancas | 22 | **0,364** | 0,197 | 2 |
| **Ruy Lopez: Berlin Defense** | C65 | negras | 27 | **0,333** | 0,186 | 2 |

Observaciones de hecho:
- El Ponziani (296 partidas sumando las dos líneas) rinde 0,58-0,63. El repertorio con blancas
  funciona.
- Las peores son respuestas del rival a su 1.e4 (Philidor 0,458; Old Sicilian 0,451; French
  0,475; Modern 0,364; Four Knights Italian 0,348) y líneas con negras (Lolli 0,406, Berlin
  0,333, Englund 0,394).
- `n_analyzed` es 0 o casi 0 en casi todas: la columna de motor de `/aperturas` está vacía.
- **No hay concepto de "repertorio" en el esquema ni en la app.** El Ponziani aparece partido en
  al menos dos filas ("Ponziani Opening" y "Ponziani: Jaenisch Counterattack"), y no hay forma de
  preguntar "¿cómo me va con mi repertorio declarado?" ni "¿qué me juegan contra el Ponziani?".

### 3.10 El entrenador

```sql
select theme, count(*) n, count(*) filter (where g.time_class='rapid') de_rapida,
 count(*) filter (where due_at<=now()) vencidos, count(*) filter (where interval_days>0) tocados
from puzzles p join games g on g.id=p.game_id group by 1;
```

| theme | n | de rápida | vencidos | alguna vez resuelto |
|---|---|---|---|---|
| (sin theme) | 203 | 5 | 202 | 3 |
| `pieza_colgada` | 121 | 6 | 121 | 0 |
| `permite_horquilla` | 76 | 5 | 74 | 2 |
| **total** | **400** | **16** | **397** | **5** |

`puzzle_attempts`: 265 intentos, 6 correctos.
`mate_pasillo`: 0 ejercicios (el detector existe, `lib/chess/theme.ts`, y nunca disparó).

Consecuencias medidas:
- **397 de 400 ejercicios están vencidos.** La portada renderiza eso como
  `~${Math.round(vencidos)} min` (`app/page.tsx:214`) → **"Tu plan de hoy: 397 ejercicios
  vencidos, ~397 min"**. Seis horas y media, presentado como el plan del día.
- **Solo 16 de 400 ejercicios vienen de partidas de rápida**, y
  `v_conceptos_fallados_rapida` filtra `g.time_class='rapid'` (`0010:28`). El panel "los errores
  que más has repetido" del entrenador está vacío por construcción.
- 203 de 400 no tienen `theme`, así que la agrupación por patrón de la portada cubre la mitad.

### 3.11 Corridas

```sql
select kind, status, count(*), max(started_at)::date from job_runs group by 1,2;
```

| kind | status | n | última |
|---|---|---|---|
| ingest | success | 15 | 2026-09-16 |
| extract_moves | success | 9 | 2026-09-15 |
| analyze | success | 6 | 2026-09-15 |
| puzzles | success | 5 | 2026-09-15 |
| puzzles | **failed** | 2 | 2026-09-15 |

La ingesta está viva y al día. El motor corrió 6 veces en total.

---

## 4. Datos disponibles en las fuentes y NO capturados

Contrato Zod en `lib/chess/chesscom.ts:14-36`; el mapeo real en `lib/chess/game.ts:113-137`.

| Dato | Dónde está | Por qué importaría |
|---|---|---|
| `rated` | `chesscom.ts:32`, validado y descartado | Hoy las partidas amistosas se mezclan con las de rating en todos los cortes |
| `fen` final | `chesscom.ts:33`, descartado (decisión explícita en `0001_init.sql:13-15`) | Reconstruible desde el PGN; no es una brecha real |
| Precisión del rival | `accuracies` del otro lado, descartada (`game.ts:110`) | Permitiría "gané porque jugué bien, o porque él jugó mal" |
| `white['@id']` / uuid del rival | `chesscom.ts:18-19`, descartados | Identificar rivales repetidos |
| Cabeceras del PGN salvo `ECO` | `lib/chess/pgn.ts:33`, parseadas y descartadas | `WhiteElo`/`BlackElo`, `Link`, `TimeControl` |
| **Autoanálisis previo al motor** | No existe en ninguna fuente: hay que capturarlo | Es el ritual central del plan de entrenamiento y hoy la app no lo soporta en absoluto |
| **Tiempo de estudio / cumplimiento de la rutina / tema de la semana** | No existe | El ciclo de 8 semanas no tiene ningún reflejo en la app |
| **Explorador de aperturas de Lichess** (API pública) | No se usa | Daría "qué se juega normalmente acá" y el rendimiento del rival medio; hoy `openings` solo tiene nombre y EPD |
| **Base de puzzles de Lichess** | No se usa | Complemento al entrenador cuando no hay ejercicios propios del tema de la semana |

---

## 5. Stack visual

- **Tipografía:** Geist sans + Geist mono desde el paquete npm (`geist@1.7.2`), variables
  `--font-geist-sans` / `--font-geist-mono`.
- **Color:** paleta verde carbón + acento coral en `app/globals.css`, con tokens
  (`--color-panel`, `--color-acento`, `--color-bien`, `--color-critico`, `--color-borde`,
  `--color-tenue`, `--color-apagado`). Trío de serie `#3987e5` / `#d95926` / `#199e70`,
  validado contra daltonismo en la Fase 6.
- **Modo oscuro:** es el único modo. No hay modo claro.
- **Kit:** `components/ui/` — `Pagina`, `Panel`, `Vacio`, `EmptyState`, `Skeleton`, `Tabla`,
  `Td`, `Fila` (con `atenuada` para n<20), `SortableTh`, `Badge`, `Clasificacion` (siempre con
  glifo `?!`/`?`/`??` + texto, el color es refuerzo), `Semaforo`, `Stat`, `Rendimiento`,
  `Progreso`, `FilaMetrica`, `Ayuda` (tooltip con `<details>`, funciona con tap).
- **Gráficos:** `BarrasH`, `BarrasV`, `Sparkline`, `MonthCalendar`, `EvalChart`. Geometría pura
  y testeada en `lib/charts/`.
- **Responsive:** barra lateral con menú de celular (`components/Sidebar.tsx`); `min-w-0` en
  `Panel` para evitar desborde horizontal; tablero fijo en 512 px (múltiplo de 8) en escritorio.
- **Estados:** `EmptyState` con detalle y acción existe y se usa; no hay `loading.tsx` en
  ninguna ruta, y todas son `force-dynamic`, así que la navegación espera al servidor sin
  esqueleto.

---

## 6. Recorrido real

Capturas en `docs/review/capturas/`, una por pantalla y por ancho: `*-390.png` y `*-1280.png`.

**Limitación declarada:** el deploy de Vercel está tras OTP por correo y no es alcanzable desde
esta sesión, y `lib/data.ts` lee todo con `SUPABASE_SERVICE_ROLE_KEY`, que no está disponible
acá. Las capturas se tomaron levantando `next dev` en el worktree contra un **arnés de datos**:
las filas reales de cada vista, extraídas por SELECT de `chessito-prod`, servidas por un stub
temporal de `supabaseAdmin()` que emula el subconjunto de PostgREST que usa `lib/data.ts`. Son
datos reales y layout real; lo que no se ejercita es PostgREST ni el middleware de sesión.
El arnés se revirtió después de capturar.

**Dos artefactos del arnés que hay que descontar al leer las capturas:**
- La franja amarilla `DEV` de arriba es `envLabel()`, porque el arnés corre con `APP_ENV=dev`.
  En producción no aparece.
- El snapshot trae **3** ejercicios, no los 400 reales, así que donde la captura dice
  "3 ejercicios vencidos · ~3 min" y "3 pendientes", el número real es **397 · ~397 min**
  (`select count(*) from puzzles where due_at <= now()` → 397).

### 6.1 Medición de layout

Ninguna pantalla desborda a lo ancho, en ninguno de los dos anchos:

| Ruta | 390 px | 1280 px |
|---|---|---|
| `/` | `scrollWidth 390 = innerWidth 390`, alto 2151 | 1280 = 1280, alto 1103 |
| `/aperturas` | 390 = 390, alto 1076 | 1280 = 1280, alto 961 |
| `/ritmo` | 390 = 390, alto 1573 | 1280 = 1280, alto 1458 |
| `/reloj` | 390 = 390, alto 1680 | 1280 = 1280, alto 1170 |
| `/errores` | 390 = 390, alto 1494 | 1280 = 1280, alto 1128 |
| `/registro` | 390 = 390, alto 2239 | 1280 = 1280, alto 2125 |
| `/salud` | 390 = 390, **alto 4004** | 1280 = 1280, alto 2587 |
| `/entrenador` | 390 = 390, alto 1155 | 1280 = 1280, alto 929 |
| `/partida/[id]` | 390 = 390, alto 2263 | 1280 = 1280, alto 1247 |

El `min-w-0` de `Panel` sigue haciendo su trabajo. `/salud` mide 4.004 px de alto en celular:
más de diez pantallas de scroll.

### 6.2 Lo que solo se ve mirando la app

**a) La portada dice que el mes va bien, y el mes es de bala** (`capturas/portada-390.png`).
El calendario del mes está verde los 15 días jugados, porque `MonthCalendar` recibe `n_games`
(todas las clases), no `n_rapid` (`app/page.tsx:136`). De esos 15 días, **10 tuvieron cero
partidas de rápida**. Debajo del "15 / meta 30" dice, en gris chico, "455 partidas en total este
mes": las 436 de bala están ahí, sin nombre.

**b) El número grande de rating de la portada es el de BLITZ, no el de rápida.**
La captura muestra "RATING BLITZ · 1.126 · -8". `claseDominante` se elige por volumen
(`app/page.tsx:105-108`) sobre las filas que devuelve `monthlyActivity()`, que trae
`limit(24)` **filas, no 24 meses** (`lib/data.ts:36-45`): son ~8 meses, justo la ventana en que
dejó la rápida. La pantalla que existe para empujar a jugar rápida muestra el rating de otra
cosa.

**c) `/errores` declara mal su cobertura** (`capturas/errores-390.png`).
Dice "Basado en **1.782 de 10.106** partidas analizadas", pero la página filtra `CLASE='rapid'`.
`analizadas` y `totales` suman **todas** las clases (`app/errores/page.tsx:46-47`,
`cobertura.reduce`). El número honesto es **108 de 2.588**. La página sobredeclara su base por
un factor de 16.

**d) `/errores` hace la pregunta y no da la respuesta.**
El panel se titula "¿Los errores se concentran en las jugadas rápidas?" y el gráfico es una
escalera ascendente de izquierda a derecha: la respuesta es un no rotundo (§3.7). En ningún
lado de la página se dice.

**e) El entrenador informa 0 % de acierto en todo** (`capturas/entrenador-390.png`).
El panel "Los errores que más has repetido" muestra: "Empeorar la posición 170 veces · 0 %",
"Dejar una pieza colgada 44 veces · 0 %", "Permitir una horquilla 16 veces · 0 %". Tres líneas,
las tres en cero. Y 170 de 230 intentos caen en `empeora_la_posicion`, que es el cajón de
"ninguno de los otros", o sea el 74 % del panel no nombra ningún patrón. Los 170 intentos vienen
de **3 ejercicios** (`v_conceptos_fallados_rapida.ejercicios = 3`).

**f) `/partida/[id]` tiene 8 errores de consola, y dos son bugs de verdad**
(`capturas/partida-390.png`, el badge rojo "8 Issues" del overlay de Next).
- **Error de hidratación:** `<Ayuda>` renderiza un `<details>/<summary>`
  (`components/ui/ayuda.tsx:9-11`) y está usado **dentro de un `<p>`** en dos lugares:
  `app/partida/[id]/page.tsx:41-44` (el componente `Mini`) y `app/partida/[id]/page.tsx:282-290`.
  `<details>` no puede ser descendiente de `<p>`: el navegador reestructura el DOM y React
  reporta el desajuste. Los demás usos de `Ayuda` (en `<th>` y en encabezados) están bien.
- **`Each child in a list should have a unique "key" prop`**, señalado en el árbol de
  `GameReview`.

**g) El resumen de la partida y su gráfico no cuentan lo mismo.**
En la misma pantalla: la tarjeta dice "GRAVES **1**" (lee `games.blunders`, que son solo las de
Gabriel) y el pie del gráfico dice "**2** errores graves marcados", porque
`EvalChart` filtra `classification === 3` sin mirar `is_mine`
(`components/charts/EvalChart.tsx:70-72`). En esta partida el segundo grave es del rival
(ply 16, `Qe7`). Dos números distintos para lo mismo, a 300 px de distancia.

**h) "Peones perdidos 8,6" al lado de "Precisión 85,8 %".**
No es un bug: es la **suma** de `cp_loss` de sus jugadas (`app/partida/[id]/page.tsx:119-121`),
bien explicada en su tooltip. Pero como titular, 8,6 peones perdidos en una partida con 85,8 %
de precisión y un solo error grave se lee como una contradicción.

**i) El formato base declarado no es el que juega.**
La partida de ejemplo es "rapid 10 min". En todo el histórico hay **19** partidas con
`time_control = '900+10'` (15+10, su formato base declarado) contra **2.569** con `'600'`
(10+0). Su "rápida" es 10+0, y ni la app ni ninguna vista distinguen una cosa de la otra.

---

## 7. Qué funciona bien y no se debe romper

1. **La ingesta y su reconciliación.** 10.106 partidas, idempotente, UUID a UUID, al día
   (última corrida 2026-09-16). `/salud` la expone entera.
2. **El pipeline de dos transportes** (`IngestStore` con `supabase-store` y `pg-store`) y la
   disciplina de una sola lógica.
3. **La extracción de relojes.** 0 % de nulos en `clock_ms` y `move_time_ms` sobre 579.194
   filas, y cero tiempos negativos. La trampa 1 de `CLAUDE.md` está resuelta de verdad.
4. **Los dos pasos de signo** y su test con motor falso (`tests/analyze.integration.test.ts`).
5. **`/partida/[id]`**: tablero de análisis con variaciones, motor en el navegador, barra de
   ventaja, momentos clave. Es la mejor pantalla de la app y la más cercana a lo que el alumno
   necesita.
6. **El entrenador con reintentos y explicación determinista** (`lib/puzzles/explain.ts`), y
   SM-2 calificando por acierto al primer intento sin pista.
7. **La disciplina de `n` y Wilson**, el umbral de 20, y las filas atenuadas.
8. **`Clasificacion` siempre con glifo y texto**, nunca solo color.
9. **Los bloques vacíos que dicen qué falta** en vez de inventar números.
10. **`/salud`** como pantalla de confianza, con el botón que dispara el workflow sin salir de la
    app.

---

## 8. Cruce con `PLAN.md`

`PLAN.md` describe 4 fases y una opcional (`/lab`). **Está desactualizado:** describe la Fase 1
como "lo que hoy no existe" y las fases 2-4 como especificación, cuando el repo va en la Fase 12
(`CLAUDE.md` documenta hasta "Estado al terminar la Fase 12"). La Fase 3.5 (`/lab`) se resolvió
de otra forma, con el motor del navegador integrado en `/partida` y `/entrenador`.

No hay en `PLAN.md` nada planificado sobre: el repertorio como concepto, el autoanálisis sin
motor, el ciclo de 8 semanas, ni la comparación entre clases de tiempo. Todas las propuestas de
esta revisión sobre esos temas son **nuevas**.

Criterios de aceptación de `PLAN.md` que hoy **no se cumplen**:
- Fase 3: "Las últimas 100 partidas de rápida analizadas" — hay 108 analizadas en total, pero
  hay 1.074 pendientes y 1.406 bloqueadas en `skipped`.
- Fase 4: "Puedes resolver 10 ejercicios seguidos sin que ninguno sea injusto" — sin verificar;
  265 intentos con 6 aciertos sugiere lo contrario, pero no es prueba (ver informe de pedagogía).
