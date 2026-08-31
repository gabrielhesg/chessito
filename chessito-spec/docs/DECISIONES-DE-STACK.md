# Decisiones de stack, y cómo salir de ellas

Registro de por qué se eligió cada pieza, qué se evaluó, y cuál es el camino de salida si algún
día deja de servir. Escrito para que la decisión se pueda revisar con criterios y no con
impresiones.

---

## Primero: Supabase **es** SQL

Supabase no es una alternativa a una base de datos SQL. **Es PostgreSQL**, la base de datos SQL
de código abierto más usada del mundo, hospedada por ellos y con algunos servicios alrededor
(autenticación, almacenamiento de archivos, un editor SQL web).

La pregunta correcta no es "SQL o Supabase". Es **quién hospeda el Postgres**.

---

## El límite de 500 MB no es la restricción de este proyecto

Este es el punto que resuelve la duda, y es aritmética:

| Volumen | Tamaño estimado |
|---|---|
| 5.000 partidas (tabla `games`, con el PGN crudo comprimido) | ~8 MB |
| 350.000 jugadas (tabla `moves`, una fila por jugada) | ~35 MB |
| Índices de ambas | ~13 MB |
| Aperturas, ejercicios, corridas | ~2 MB |
| **Total con 5.000 partidas** | **menos de 100 MB** |

Con 500 MB caben del orden de **25.000 partidas**. Aunque juegues 400 partidas al mes durante
cinco años, no llegas. Y si llegaras, el PGN crudo se puede archivar a almacenamiento de
archivos y liberar la mitad.

La preocupación por el espacio es razonable en general, pero en este proyecto apunta al lugar
equivocado. Las restricciones que **sí** importan del plan gratuito de Supabase son otras dos:
la pausa por inactividad y el tope de dos proyectos.

---

## Comparación de las opciones reales

| | Supabase | Neon | Turso / Cloudflare D1 |
|---|---|---|---|
| Motor | PostgreSQL | PostgreSQL | SQLite |
| Espacio gratis | 500 MB total | 0,5 GB por proyecto, hasta 100 proyectos | Varios GB |
| Inactividad | **Se pausa a la semana**, hay que reactivar a mano | Escala a cero y despierta en ~1 segundo | No aplica |
| Ramas de base de datos | Solo en plan pagado | 10 por proyecto, gratis | No |
| Autenticación incluida | Sí | Sí | No |
| Almacenamiento de archivos | Sí | No | No |
| Sirve para este esquema | Sí | Sí, sin cambios | **No sin reescribirlo** |

**Por qué SQLite queda descartado.** Turso y Cloudflare D1 dan más espacio gratis, pero el
espacio no es el problema. Este proyecto es casi puramente analítico: las doce vistas usan tipos
enumerados, `percentile_cont` para medianas, agregaciones con `filter`, y `jsonb`. Nada de eso
existe en SQLite. Habría que reescribir las doce vistas y las dos funciones para ganar espacio
que no necesitas. Es pagar un costo real por un beneficio nulo.

**Neon es una alternativa legítima.** Sobre el papel gana en tres cosas que sí importan: no se
pausa por inactividad, permite ramas de base de datos (que es exactamente lo que se quiere para
dev y producción, mejor resuelto que con dos proyectos separados), y no tiene tope de dos
proyectos. A cambio es solo base de datos: no trae almacenamiento de archivos, así que el
respaldo NDJSON tendría que vivir en otra parte, como artefactos de GitHub Actions.

---

## Decisión: Supabase, por ahora

**Motivos:**

1. La autenticación integrada resuelve el acceso con correo sin escribir nada. Reemplazarla son
   horas de fin de semana en algo que no es ajedrez.
2. El almacenamiento de archivos es donde va el respaldo de las evaluaciones, que son los únicos
   datos irrecuperables del sistema.
3. El editor SQL web permite mirar y corregir datos sin herramientas extra, que para alguien que
   no programa a diario vale bastante.
4. La generación automática de tipos de TypeScript desde el esquema está resuelta con un comando.
5. La pausa por inactividad **ya está resuelta** por los trabajos programados, que tocan la base
   todos los días.

## El camino de salida está abierto a propósito

Esto es lo importante y fue una decisión de diseño, no un accidente:

**El esquema está escrito en PostgreSQL estándar.** No usa una sola extensión ni función
propietaria de Supabase. Las dos migraciones corren tal cual en cualquier Postgres, y de hecho
fueron verificadas contra un PostgreSQL 16 común y corriente, no contra Supabase.

Lo único atado a Supabase es la autenticación y el almacenamiento, que están aislados en
`lib/supabase/`. Mudarse a Neon algún día sería:

1. Apuntar la cadena de conexión a Neon
2. Correr las mismas dos migraciones, sin tocar una línea
3. Reemplazar la autenticación
4. Mover el respaldo NDJSON a artefactos de GitHub Actions

Días de trabajo, no meses. Y la señal para hacerlo sería concreta: acercarse a los 400 MB, o
necesitar más de dos ambientes.

---

## Vercel, y el cron que sí era una limitación

**Vercel se queda** para hospedar la aplicación web. Es donde mejor corre Next.js, los
despliegues de vista previa por cada pull request son gratis y son la tercera etapa de nuestro
esquema de ambientes, y el despliegue automático desde GitHub no requiere configuración.

Pero tenía una limitación real: **el plan gratuito permite un solo trabajo programado al día.**
Para alguien que abre la app justo después de jugar, esperar hasta mañana para ver la sesión de
recién es inaceptable.

### Cómo se resuelve

Los trabajos programados se mueven a **GitHub Actions**, que permite hasta uno cada 5 minutos, y
donde ya vive el analizador de Stockfish. Un solo lugar para todo lo programado.

| Trabajo | Dónde | Cada cuánto |
|---|---|---|
| Ingesta de partidas | GitHub Actions | Cada 3 horas |
| Ingesta de partidas, respaldo | Cron de Vercel | Una vez al día |
| Botón "Actualizar ahora" | La app | Cuando lo aprietas |
| Análisis con Stockfish | GitHub Actions | Una vez al día, más disparo manual |

**Por qué la ingesta queda duplicada en dos lugares.** GitHub desactiva los workflows programados
cuando un repositorio pasa **60 días sin actividad**, avisando por correo. Si terminas la app y
la dejas andando sin tocar el código, eso puede pasar. El cron diario de Vercel nunca se
desactiva por inactividad, así que queda como piso garantizado, y de paso es el que evita que
Supabase se pause.

Correr las dos no duplica datos: la ingesta es idempotente por identificador de partida. Correrla
dos veces seguidas no cambia nada.

Además, los trabajos programados de GitHub **se atrasan entre 5 y 30 minutos en horas de alta
carga**. Para este uso da lo mismo, pero conviene saberlo antes de sorprenderse.

---

## Alternativas de hospedaje que se evaluaron y se descartaron

- **Cloudflare Pages y Workers**: mejores límites de trabajos programados, pero correr Next.js
  ahí tiene fricción y no compensa cuando el cron ya se resolvió con GitHub Actions.
- **Netlify**: equivalente a Vercel en plan gratuito, con peor soporte de Next.js.
- **Render**: su Postgres gratuito **expira a los 30 días**. Descartado de plano.
- **Railway**: ya no tiene plan gratuito, solo crédito de prueba.

---

## Cuándo revisar esta decisión

Revisar el stack cuando ocurra cualquiera de estas, y no antes:

- La base de datos pasa los **400 MB**
- Se necesitan **más de dos ambientes**
- El plan gratuito de GitHub Actions queda corto (poco probable: el análisis completo son unos
  180 minutos de los 2.000 mensuales)
- Aparece un segundo usuario, que cambiaría el modelo de datos completo

Mientras nada de eso pase, cambiar de stack es trabajo que no produce ajedrez.
