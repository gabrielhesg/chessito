# Fase 3 · Stockfish

Lee @CLAUDE.md, @PLAN.md, @docs/ENGINEERING.md, @docs/CONFIANZA.md y @docs/ANALYSIS-SPEC.md
COMPLETO antes de escribir código. La sección
"Los DOS pasos de signo" describe un error que produce resultados invertidos en silencio y que
ningún test de integración detecta.

Vamos con la Fase 3. docs/ENGINEERING.md es criterio de aceptación. Entra en plan mode y
muéstrame el plan antes de escribir.

0. El cliente UCI vive en lib/engine/, aislado y testeable con un motor simulado. La
   clasificación y las métricas derivadas viven en lib/analysis/, puras y testeables sin base
   de datos ni motor. scripts/analyze.ts solo orquesta.

1. "pnpm analyze" (scripts/analyze.ts): levanta el binario nativo de STOCKFISH_PATH como
   proceso hijo y habla UCI por stdin/stdout. Sin librerías WASM, sin servicios externos.
   Escribe DIRECTO a Postgres con SUPABASE_DB_URL. No crees ninguna ruta HTTP de análisis.
   Lee toda su configuración de process.env, sin importar de dónde venga.

1b. .github/workflows/analyze.yml, que es donde este script va a correr de verdad:
   - Triggers: schedule diario y workflow_dispatch con un input "batch" (número de partidas)
     para poder hacer el backfill por tandas desde el celular.
   - sudo apt-get install -y stockfish, que deja el binario en /usr/games/stockfish.
   - ENGINE_THREADS calculado como nproc menos uno.
   - Secrets SUPABASE_DB_URL y CHESSCOM_USERNAME desde el repositorio.
   - timeout-minutes: 330, porque el tope de un job es de 6 horas.
   - Que imprima al final cuántas partidas quedan en pending, para saber si hay que volver a
     dispararlo.

2. Configuración: Hash 256, presupuesto "go nodes ${ENGINE_NODES}" leído del entorno, y Threads
   según el criterio de reproducibilidad del spec. Construye engine_id al arrancar leyendo el
   "id name" que devuelve el motor al comando uci, concatenado con los nodos y los hilos. NO lo
   hardcodees: apt y brew traen versiones distintas.

3. Una evaluación por posición, no dos. La pérdida de una jugada es el delta entre evaluaciones
   consecutivas.

4. LOS DOS PASOS DE SIGNO, ambos obligatorios:
   a) Al escribir moves.eval_cp, normaliza a perspectiva de BLANCAS negando en los plies donde
      mueven negras.
   b) Al calcular la pérdida, vuelve a girar según quién movió:
         perdida = movio_blancas ? (wp_antes - wp_despues) : (wp_despues - wp_antes)
      Sin el paso (b) todos los errores con negras dan pérdida negativa, caen en
      classification 0, y desaparecen del análisis.
   Escribe DOS tests unitarios: uno donde negras cuelgan la dama en posición ganada y
   win_pct_loss debe salir grande y positivo, y su simétrico para blancas.

5. Mate: mate_in positivo a cp 10000, negativo a -10000. Mate en 3 que se vuelve mate en 5 es
   pérdida cero, no un desplome.

6. Clasifica con los umbrales de caída de win%: 10 imprecisión, 20 error, 30 error grave. Usa
   la función SQL win_pct que ya existe. La escribe el analizador, no hay trigger.

7. is_decided: marca true cuando el win% ANTES de la jugada, desde la perspectiva del que mueve,
   era mayor a 95 o menor a 5. is_book ya viene poblado desde la Fase 2.

8. divergence_ply, EN LA PERSPECTIVA DE GABRIEL, no en la de blancas: gira eval_cp a su
   perspectiva y busca el primer ply que cae bajo -100 y no vuelve a superar -50. NULL si nunca
   pasa.

9. Columnas que debes escribir y que se me olvidan siempre:
   - en moves: eval_cp, mate_in, best_uci, cp_loss, win_pct_loss, classification, is_decided
   - en games: analysis_state, analyzed_at, engine_id, divergence_ply, acpl, blunders, mistakes,
     inaccuracies. Los cuatro contadores se calculan SOLO sobre jugadas propias, no de libro y
     no decididas, para que cuadren con las vistas.

10. Máquina de estados pending -> claimed -> done/failed, reclamando lotes de 5 a 10 con
    update ... returning, con recuperación de las reclamadas hace más de 30 minutos, y UNA
    TRANSACCIÓN POR PARTIDA. Backfill de rápida y blitz primero, de la más reciente hacia atrás.

11. Página /errores: tasa de blunders por partida y por fase leyendo v_errors_by_phase, y el
    cruce entre tiempo por jugada y errores leyendo v_errors_by_move_time. Esta página cierra
    las preguntas 3 y 4 del proyecto.

12. Todas las páginas que usen datos del motor muestran su cobertura leyendo
    v_analysis_coverage, con el formato "basado en X de Y partidas analizadas".

13. Agrega al cron diario un snapshot NDJSON de las evaluaciones de moves y de puzzle_attempts a
    Supabase Storage. Son los únicos datos del sistema que no se pueden reconstruir desde
    chess.com.

Verificación de aceptación, y muéstramela antes de cerrar la fase:

   select corr(acpl, my_accuracy) as pearson, count(*) as n
   from games where analysis_state = 'done' and my_accuracy is not null;

Se espera una correlación claramente NEGATIVA, del orden de -0,6 o más fuerte. Si sale cerca de
cero o positiva, hay un error en alguno de los dos pasos de signo. No compares ACPL con accuracy
restándolos: son unidades distintas.

14. Cada corrida del analizador abre y cierra una fila en job_runs, con engine_id, procesadas,
    fallidas, duración, ambiente y cuántas quedan pendientes. Y guarda en job_runs.detail el
    resultado del chequeo de correlación contra my_accuracy.

15. El workflow verifica la rama antes de escribir en la base de producción: solo main puede
    tocar prod. Los secretos de producción viven en un GitHub Environment llamado 'production'
    con aprobación manual.

16. Antes de cerrar la fase, usa un subagente para revisar tu implementación de los dos pasos
    de signo contra @docs/ANALYSIS-SPEC.md, y muéstrame qué encontró.

17. Crea docs/validacion-lichess.md con una plantilla para que yo anote el ritual de validación
    manual de @docs/CONFIANZA.md capa 2: cinco partidas mías comparadas contra el análisis de
    Lichess. Dime cuáles cinco partidas conviene usar.
