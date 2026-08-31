# Cómo se sabe que el análisis es confiable

Un análisis equivocado es peor que ningún análisis, porque te hace estudiar lo que no es durante
un mes. Este documento define las cuatro capas que hacen que el resultado sea verificable, y no
una promesa.

La regla de fondo: **nada se cree porque el programa lo dijo. Todo se contrasta contra algo
independiente.**

---

## Capa 1 · Fixtures dorados

Partidas reales, con la respuesta correcta calculada a mano una vez y congelada en el
repositorio.

En `tests/fixtures/` viven PGNs de verdad, bajados de tu cuenta, con un archivo `.expected.json`
al lado que declara qué tiene que salir: cuántas jugadas, el tiempo de cada una, la apertura
resuelta, y en las partidas analizadas, la clasificación de las jugadas clave.

Se necesitan como mínimo estos casos, porque cada uno rompe algo distinto:

| Fixture | Qué protege |
|---|---|
| Partida de 15+10 con `%clk` completo | El cálculo de tiempo por jugada, incluido el incremento |
| Partida sin incremento (10+0) | Que la fórmula no asuma incremento siempre |
| Partida por correspondencia, sin `%clk` | Que el parser no reviente donde no hay reloj |
| Partida tuya con **negras** donde cometes un error grave | El paso 2 del signo. Es el fixture más importante del proyecto |
| Partida tuya con **blancas** donde cometes un error grave | El simétrico del anterior |
| Partida que llega al Ponziani por transposición | La resolución de apertura por EPD |
| Partida ganada por tiempo | Que `termination` guarde tu resultado y no el del rival |

**Los fixtures no se inventan.** Un PGN escrito a mano no reproduce los casos raros que rompen
el parser de verdad. Son partidas tuyas, bajadas y guardadas.

Si un cambio futuro rompe un fixture, la CI se pone roja antes de que llegue a tus datos.

---

## Capa 2 · Validación cruzada contra fuentes independientes

Los tests prueban que el código hace lo que dijimos. Esta capa prueba que **lo que dijimos es
correcto**, contrastando contra dos sistemas que no son nuestros.

### Contra chess.com, automático

chess.com calcula su propia precisión para muchas de tus partidas y la entrega por la API. La
guardamos en `games.my_accuracy` desde el primer día justamente para esto.

```sql
select corr(acpl, my_accuracy) as pearson, count(*) as n
from games
where analysis_state = 'done' and my_accuracy is not null;
```

Se espera una correlación **claramente negativa**, del orden de -0,6 o más fuerte: más
centipeones perdidos, menos precisión. No son la misma unidad y no se pueden restar, pero
tienen que moverse en direcciones opuestas.

Si sale cerca de cero o positiva, hay un error de signo. Este chequeo corre en cada corrida del
analizador y queda registrado en `job_runs.detail`.

### Contra Lichess, manual, una vez

Un ritual de aceptación que se hace una sola vez al terminar la Fase 3, y que vale por cien
tests:

1. Tomas **cinco partidas tuyas** que la app ya analizó, de preferencia derrotas
2. Las importas al análisis de Lichess, que es gratis e ilimitado
3. Comparas jugada por jugada: dónde Lichess marca error grave, dónde lo marca la app

No tienen que coincidir al 100%, porque los presupuestos de búsqueda son distintos. Lo que sí
tiene que pasar: **los errores graves grandes tienen que aparecer en las dos**. Si la app te
marca errores que Lichess no ve, o se le pasan los que Lichess sí detecta, algo está mal y hay
que arreglarlo antes de confiar en un solo número.

Esa comparación se anota en el repositorio, en `docs/validacion-lichess.md`, con las cinco
partidas y el resultado. Queda como evidencia de que el análisis fue verificado contra algo
externo, y no solo contra sí mismo.

---

## Capa 3 · Invariantes que corren todo el tiempo

La migración `0002_observability.sql` define la vista `v_data_quality` con diez chequeos que
tienen que dar cero siempre. Cada uno existe porque hay una forma concreta de romperlo:

| Chequeo | Qué detecta |
|---|---|
| `tiempos_de_jugada_negativos` | Se olvidó el incremento en la fórmula del reloj |
| `partidas_analizadas_sin_jugadas` | Una partida quedó marcada como lista sin haberse analizado |
| `conteo_de_jugadas_no_calza` | El parser perdió jugadas por el camino |
| `clasificacion_sin_metrica` | Se clasificó una jugada sin la métrica que la justifica |
| `perdidas_negativas` | **El signo está invertido** |
| `errores_solo_de_un_color` | **El paso 2 del signo está mal**: un color no tiene ningún error grave |
| `partidas_reclamadas_huerfanas` | El analizador murió a medio camino y dejó partidas trabadas |
| `mezcla_de_motores` | Hay dos versiones de Stockfish en la misma tabla, evaluaciones incomparables |
| `aperturas_sin_resolver` | El cargador de aperturas por EPD tiene un bug |
| `evaluaciones_fuera_de_rango` | Error de parseo de la salida del motor |

Estos chequeos ya están escritos y **verificados**: se plantaron datos malos a propósito y ocho
de los diez se dispararon como corresponde (los otros dos requieren volumen de datos que no se
podía simular en la prueba).

Se ven en la página `/salud` de la app, y la CI falla si alguno da `false`.

---

## Capa 4 · Reconciliación de la ingesta

Esta es la respuesta directa a "cómo sé que se están cargando bien las partidas".

Cada corrida de ingesta hace lo siguiente, y no solo insertar:

1. Le pregunta a chess.com **cuántas partidas** tiene en cada mes que está sincronizando
2. Cuenta **cuántas tiene la base de datos** para ese mismo mes, con la vista `v_games_by_month`
3. **Compara los dos números** y guarda la diferencia en `job_runs.detail`
4. Si no calzan, la corrida se marca como fallida y la página de salud lo muestra en rojo

Una ingesta que dice "listo" pero perdió 12 partidas es exactamente el tipo de falla silenciosa
que arruina un análisis, y esto la hace imposible de ignorar.

---

## Cómo se cargan las partidas nuevas

Tres caminos, y los tres escriben directo a Supabase:

| Cómo | Cuándo | Para qué |
|---|---|---|
| **Cron de Vercel** | Una vez al día, automático | Que la app esté al día sin que hagas nada |
| **Botón "Actualizar ahora"** en la app | Cuando tú lo aprietas | Acabas de jugar y quieres ver la sesión de recién |
| **`pnpm ingest`** desde una sesión de Claude Code | A mano | Recargas grandes o depuración |

El botón importa: tú usas la app **justo después de jugar**, y el plan gratuito de Vercel solo
permite un cron diario. Sin el botón tendrías que esperar hasta el día siguiente para ver tu
propia sesión, que es exactamente lo contrario de lo que necesitas.

Los tres caminos llaman a la misma función. No hay dos implementaciones que puedan divergir.

## Cómo sabes que se cargaron bien, sin abrir la consola

La página `/salud` muestra:

- Cuándo fue la última ingesta exitosa, y **un aviso rojo si pasaron más de 48 horas**
- Cuántas partidas hay por mes, para comparar de un vistazo
- Los diez chequeos de calidad, en verde o rojo
- Las últimas corridas de cada proceso con sus conteos y su duración
- Cuántas partidas quedan pendientes de analizar

Además, GitHub avisa por correo cuando un workflow falla. No hay que acordarse de revisar.

---

## Lo que este sistema NO garantiza

Vale la pena ser explícito, porque la confianza se construye también sabiendo dónde están los
límites:

- **Stockfish a 800.000 nodos no es la verdad absoluta.** Es una evaluación muy buena para
  detectar errores de un jugador de 1200 a 1600, y a veces va a discrepar de un análisis más
  profundo en posiciones muy cerradas o en finales complejos.
- **La clasificación de errores es una convención**, la de Lichess. Otra herramienta con otros
  umbrales va a contar distinto. Lo importante es que sea consistente contigo mismo en el
  tiempo, y por eso se versiona el motor en `engine_id`.
- **Las conclusiones estadísticas dependen del tamaño de muestra.** Por eso ninguna vista se
  muestra sin su `n` y nada se recomienda bajo 20 partidas.
