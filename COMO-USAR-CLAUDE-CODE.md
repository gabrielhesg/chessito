# Cómo operar Claude Code en este proyecto

Escrito para alguien que no lo usa a diario. Son seis reglas, y con eso basta.

---

## Regla 1 · Una fase por sesión, nunca todo junto

Cada fase abre una sesión nueva. No se meten dos fases en la misma conversación.

**Por qué.** Claude Code trabaja con una ventana de contexto limitada. Cuando una sesión se
alarga demasiado, empieza a olvidar decisiones tomadas al principio y a contradecirse. Una fase
completa ya es una sesión larga.

Cómo cierras una sesión bien, antes de irte:

```
Haz commit de esto, abre el pull request, y actualiza CLAUDE.md con lo que la próxima
sesión necesita saber de lo que construiste.
```

Ese `CLAUDE.md` actualizado es lo que le da contexto a la sesión siguiente. Es la memoria del
proyecto entre sesiones.

---

## Regla 2 · Siempre plan mode primero

Antes de que escriba código, tiene que mostrarte qué va a hacer.

En claude.ai/code aprietas **Shift+Tab** hasta que aparezca `plan mode on`, o simplemente
incluyes en tu mensaje "entra en plan mode primero". Los prompts de las fases ya lo piden.

**Qué revisas en ese plan**, aunque no seas programador:

- ¿Está haciendo solo lo de esta fase, o se está adelantando a la siguiente?
- ¿Menciona los tests y la CI, o los dejó para el final?
- ¿Dice que va a modificar `0001_init.sql`? Eso está prohibido, las migraciones no se editan
  hacia atrás
- ¿Detectó alguna ambigüedad en el spec? Si dice que algo no le calza, escúchalo. Probablemente
  tenga razón y sea más barato arreglarlo ahí

Si algo no te cuadra, se lo dices en palabras normales. No hace falta lenguaje técnico.

---

## Regla 3 · Subagentes: déjalo decidir a él

Claude Code puede lanzar subagentes por su cuenta para explorar código o investigar en paralelo.
**No tienes que pedírselo ni configurarlo.** Lo hace cuando le conviene.

Pedirle explícitamente "usa subagentes" en un proyecto de este tamaño no mejora el resultado y
sí gasta más. La excepción, que sí vale la pena y es la única que necesitas conocer:

```
Antes de dar esta fase por terminada, usa un subagente para revisar críticamente lo que
escribiste contra @docs/ENGINEERING.md y @docs/CONFIANZA.md, y dime qué encontró.
```

Un revisor con ojos frescos encuentra cosas que el que escribió el código no ve. Es la misma
técnica que usé para revisar este spec, y encontró un error de signo que habría invertido todo
tu análisis con negras.

---

## Regla 4 · Permisos en automático, salvo cuando toque producción

Te va a pedir permiso para correr comandos y escribir archivos. Para este proyecto, el modo
**auto** es lo razonable: aprueba lo seguro solo y te consulta lo riesgoso. Si te está
preguntando por absolutamente todo, escribe `/permissions` y revisa la configuración.

La excepción, que es innegociable: **cualquier comando que toque la base de datos de producción
lo apruebas tú, leyéndolo.** En particular `pnpm db:push --env prod`. Un `drop` mal puesto sobre
producción se lleva tus evaluaciones del motor, que son lo único irrecuperable del sistema.

---

## Regla 5 · La CI es el árbitro, no tu impresión

Al final de cada fase, la pregunta no es "se ve bien". Es:

1. ¿Está verde el CI en GitHub? (pestaña **Actions** del repositorio)
2. ¿Están los diez chequeos de `/salud` en verde?
3. ¿Se cumplen los criterios de aceptación que están escritos en el prompt de la fase?

Si algo está rojo:

```
El CI está fallando en <lo que dice el error>. Arréglalo antes de seguir.
```

Una fase con el CI en rojo no está terminada, y así está escrito en los estándares.

---

## Regla 6 · Cuando se desvía, apúntalo al spec

Va a pasar. Es normal, y la corrección es siempre la misma:

```
Revisa @CLAUDE.md, @PLAN.md y @docs/ENGINEERING.md. Te estás desviando del spec en <lo
que sea>.
```

Otros mensajes que te van a servir tal cual:

| Situación | Qué escribes |
|---|---|
| Se está adelantando a la fase siguiente | `Eso es de la Fase siguiente. Quédate en el alcance de esta.` |
| Escribió código sin tests | `Falta cobertura de tests según @docs/ENGINEERING.md. Agrégalos antes de seguir.` |
| Quiere editar una migración vieja | `No edites migraciones ya aplicadas. Crea una nueva.` |
| Usó `any` en TypeScript | `Cero any, dice el spec. Tipa eso correctamente.` |
| Se perdió y quieres reiniciar | `Detente. Resume en cinco líneas qué llevas hecho y qué falta de esta fase.` |
| No entiendes qué hizo | `Explícame en palabras simples qué acabas de construir y para qué sirve.` |

---

## El orden completo, de principio a fin

| # | Sesión | Qué escribes | Qué tienes al final |
|---|---|---|---|
| 1 | Fase 1 | `Ejecuta la Fase 1 descrita en @docs/prompts/fase1-app.md` | La app en el aire con tus partidas |
| 2 | Fase 2 | `Ejecuta la Fase 2 descrita en @docs/prompts/fase2-reloj.md` | La tabla de jugadas poblada |
| 3 | Fase 3 | `Ejecuta la Fase 3 descrita en @docs/prompts/fase3-motor.md` | Stockfish clasificando tus errores |
| 4 | Validación | El ritual de Lichess de `@docs/CONFIANZA.md` | Evidencia de que el análisis es correcto |
| 5 | Fase 4 | `Ejecuta la Fase 4 descrita en @docs/prompts/fase4-entrenador.md` | El entrenador |

Entre una y otra, vienes acá al chat con la URL y conversamos qué salió.

---

## Cuánto va a costar en tiempo

Cada fase es una sesión larga, de una a tres horas de trabajo de la máquina, no tuyas. Tú
intervienes al principio para aprobar el plan, un par de veces en el medio cuando te pida una
clave, y al final para revisar.

Puedes cerrar la pestaña mientras trabaja. La sesión sigue corriendo en la nube y la retomas
desde donde sea, incluido el celular.
