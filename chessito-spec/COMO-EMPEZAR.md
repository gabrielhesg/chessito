# Cómo empezar

Todo desde el navegador. No instalas nada, no usas terminal, todo es gratis, y funciona igual
desde tu PC, el otro PC o el celular.

---

## Antes: qué se construye y dónde vive

| Pieza | Dónde vive | Costo |
|---|---|---|
| El código | GitHub | gratis |
| Escribir el código | Claude Code en la web | incluido en tu plan Claude |
| La app publicada | Vercel | gratis |
| La base de datos | Supabase | gratis |
| Stockfish analizando tus partidas | GitHub Actions | gratis |

Stockfish no se instala en tu computador. Se instala solo, cada vez, dentro de la máquina
temporal que GitHub presta para correr el análisis. Aprietas un botón y él trabaja.

---

## Paso 1. Abre las dos cuentas que faltan

Las dos son gratis y se crean entrando con tu cuenta de GitHub, así que son dos minutos cada
una.

**Supabase** (las bases de datos). Vas a crear **dos** proyectos, que son los que permite el
plan gratuito: uno para probar y uno de verdad.

1. Entra a **supabase.com** y aprieta **Start your project**
2. Entra con GitHub
3. **New project**, nombre `chessito-prod`
4. Te va a pedir una contraseña para la base de datos. **Genérala, cópiala y guárdala** en algún
   lado. La vas a necesitar
5. Región: la más cercana a Chile
6. Repite los pasos 3 a 5 con el nombre `chessito-dev`, con su propia contraseña
7. Espera unos minutos a que queden listos

Por qué dos: `chessito-dev` es donde se prueba cada cambio antes de que toque tus datos buenos.
Es la diferencia entre poder equivocarse sin consecuencias y no poder. El detalle está en
`docs/ENVIRONMENTS.md`.

**Vercel** (donde va a vivir la app)

1. Entra a **vercel.com** y aprieta **Sign Up**
2. Entra con GitHub
3. No importes nada todavía. Claude Code te va a guiar cuando toque

---

## Paso 2. Actualiza los archivos del repositorio

El paquete cambió. En tu repositorio `chessito` en GitHub:

1. Aprieta **Add file** y después **Upload files**
2. Arrastra todo el contenido nuevo del zip, incluidas las carpetas `docs` y `supabase`
3. **Commit changes**

GitHub reemplaza los archivos que ya existían y agrega los nuevos.

---

## Paso 3. Lanza la Fase 1

1. Entra a **claude.ai/code**
2. Elige el repositorio `chessito`
3. Escribe **exactamente esto**:

```
Ejecuta la Fase 1 descrita en @docs/prompts/fase1-app.md
```

Eso es todo lo que escribes. El `@` hace que lea el archivo completo, que trae el alcance, los
estándares de ingeniería y los criterios de aceptación.

**Lo primero que va a hacer es mostrarte un plan y esperar tu aprobación.** Léelo, y si algo no
te calza, díselo antes de que empiece. En `COMO-USAR-CLAUDE-CODE.md` está qué revisar de ese
plan aunque no seas programador, y los mensajes exactos que sirven cuando se desvía.

Durante el trabajo te va a pedir datos que solo tú tienes: la URL y las claves de tu proyecto de
Supabase, tu email para el acceso, y la conexión con Vercel. Todo eso está en el dashboard de
Supabase, en Settings, y él te va a decir exactamente cuál necesita.

---

## Qué vas a tener al terminar la Fase 1

**Dos URLs de Vercel**, una de producción y una de pruebas, con la app funcionando, protegida
con tu email y mostrando tu histórico completo de chess.com:

- Portada, con tus partidas de rápida del mes contra la meta
- Aperturas, con tu rendimiento por apertura y color
- Ritmo, con tu rendimiento por hora, por número de partida en la sesión, y después de una
  derrota
- Registro, con el listado filtrable de tus partidas
- **Salud**, que es la que te deja confiar en el resto: cuándo se cargaron las partidas por
  última vez, si falta alguna respecto de lo que chess.com dice que tienes, y diez chequeos de
  calidad de datos en verde o rojo

Más un **botón para actualizar al momento**, porque abres la app justo después de jugar y el
cron automático corre una vez al día.

Y debajo de todo eso: tests sobre partidas tuyas de verdad, integración continua que se pone
roja si algo se rompe, migraciones versionadas y despliegue automático.

---

## Las fases siguientes

Una fase por sesión de Claude Code. No las mezcles: cada una tiene su propio alcance y sus
propios criterios de aceptación.

| Cuándo | Qué escribes | Qué obtienes |
|---|---|---|
| Ahora | `Ejecuta la Fase 1 descrita en @docs/prompts/fase1-app.md` | La app en el aire |
| Después | `Ejecuta la Fase 2 descrita en @docs/prompts/fase2-reloj.md` | Análisis de tu uso del reloj |
| Después | `Ejecuta la Fase 3 descrita en @docs/prompts/fase3-motor.md` | Stockfish detectando tus blunders |
| Al final | `Ejecuta la Fase 4 descrita en @docs/prompts/fase4-entrenador.md` | El entrenador con tus posiciones |
| Cambios sueltos | `@docs/prompts/mantencion.md` y después tu pedido | |

---

## Cómo funciona Stockfish, cuando llegues a la Fase 3

Claude Code va a crear un archivo `.github/workflows/analyze.yml`. Desde ese momento:

**Solo:** queda programado y se ejecuta una vez al día sin que hagas nada.

**A mano, incluso desde el celular:**

1. Entra a tu repositorio en GitHub
2. Pestaña **Actions**
3. Elige el workflow **analyze** en la lista de la izquierda
4. Botón **Run workflow**

GitHub levanta una máquina temporal, instala Stockfish, analiza un lote de partidas, escribe los
resultados en tu base de datos y se apaga.

Analizar todo tu histórico son unas 3 horas repartidas en varias corridas, es decir unos 180
minutos una sola vez. El plan gratis te da 2.000 minutos al mes, así que el backfill usa como un
10% de un mes y después se mantiene con unos pocos minutos.

---

## Si algo se rompe

- **Claude Code se desvía del spec**: escríbele `Revisa @CLAUDE.md, @PLAN.md y
  @docs/ENGINEERING.md, te estás desviando del spec.`
- **El CI queda en rojo**: escríbele `El CI está fallando, arréglalo antes de seguir.` Los
  estándares dicen que una fase con CI en rojo no está terminada.
- **Te pide una clave y no sabes cuál**: las de Supabase están en el dashboard del proyecto, en
  **Settings**, sección **API** (URL, anon key, service role key) y sección **Database**
  (connection string).
- **Cualquier otra cosa**: cópiame el error en el chat del proyecto Chessito y lo vemos.
