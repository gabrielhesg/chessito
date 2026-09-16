# Revisión · Fase 3 · Las dos debilidades, medidas

Lee @CLAUDE.md, @docs/ENGINEERING.md, @docs/review/PLAN-REVISION.md (sección 5) y
@docs/review/03-bi.md (sección 5).

Esta fase existe para responder dos preguntas que hoy la app no puede tocar: **"¿dejé de colgar
piezas?"** y **"¿estoy aprendiendo a convertir?"**. Son las dos debilidades que el alumno declaró
de su propia boca, y ninguna tiene una sola medición en toda la app.

**Requiere la Fase 1 (R3, R5) y F2-05 terminadas.** Sin cobertura no hay serie: con 108 partidas
de rápida analizadas repartidas en 23 meses no se puede dibujar nada honesto. Si llegas acá y la
cobertura no está, **para y termina F2-05 primero**. No dibujes una serie sobre 108 partidas.

---

## F3-01 · La North Star: piezas colgadas por partida de rápida

```
piezas_colgadas(g) = count(moves)
                     filter (is_mine and not is_book and not is_decided
                             and classification = 3 and cp_loss >= 250)

North Star = piezas_colgadas ÷ partidas, sobre las ultimas 20 partidas de rapida analizadas
```

Menor es mejor. El corte por `cp_loss ≥ 250` es lo que la separa del error posicional: un blunder
de clase 3 que cuesta menos de dos peones y medio es otra cosa.

1. Un solo número en la portada, al lado del rating de rápida, con su serie mensual.
2. Va **siempre** acompañada de S3 (cobertura de análisis de rápida). Una North Star sin su
   cobertura al lado es una cifra que hay que creer a ciegas, y este proyecto existe en contra de
   eso.
3. Vista SQL nueva: la agregación entre filas no va en TypeScript.

**Por qué esta y no PVR.** La revisión de BI propuso PVR (mediana de `win_pct_loss` regalado por
partida) y tiene razón en que se mueve más rápido: detectar una caída de 0,7 a 0,5 piezas colgadas
por partida necesita del orden de 470 partidas analizadas. Pero PVR es una **suma** sobre jugadas
propias, así que premia perder rápido, y no es accionable: mezcla en un escalar colgar una dama en
la jugada 12 con veinte jugadas mediocres. La North Star la lee el alumno.

**Criterio de aceptación:** la portada muestra el número con su `n` y su cobertura; con menos de
20 partidas de rápida analizadas en la ventana, se muestra atenuado y sin recomendación, como
manda la regla del proyecto.

## F3-02 · PVR por jugada y cobertura, al lado

```
PVR = mediana sobre las ultimas 20 partidas de rapida analizadas de:
      ( suma de win_pct_loss de mis jugadas no-libro no-decididas )
      ÷ ( numero de esas jugadas )
```

**Normalizada por jugada**, que es lo que corrige el sesgo de longitud del PVR original. Se
reporta debajo de la North Star, chico, porque sirve para detectar el cambio antes de que la North
Star se mueva. Nunca en su lugar.

Y S3: `rapid done ÷ rapid analizables`. Hoy 4,2 %.

**Criterio de aceptación:** los tres números aparecen juntos; PVR está normalizado y se puede
demostrar con un test que una partida larga y una corta con la misma calidad dan el mismo valor.

## F3-03 · Conversión de ventaja

De las partidas de rápida analizadas donde su evaluación **girada a su perspectiva** superó
+200 cp en algún momento fuera del libro, qué proporción terminó en victoria. Ventana: las últimas
30 con ventaja.

1. Ojo con el signo: `moves.eval_cp` está en perspectiva de blancas. Hay que girarlo con
   `toWhitePerspective` según `games.my_color`, igual que hace el analizador. Ver la trampa 2 de
   `CLAUDE.md`.
2. La lista de esas partidas, enlazada a `/partida/[id]`, es el mejor material de revisión que
   tiene: ahí el error no fue táctico, y es donde se aprende plan.
3. Con el ply donde se perdió la ventaja, que engancha con el entrenador.

Esto es la traducción operativa de "no sé qué hacer en el medio juego": no se mide con una tasa de
blunder, se mide con qué pasa **cuando la posición está bien**.

**Criterio de aceptación:** el número existe con su `n`; la lista enlaza a las partidas; un test
de signo con una partida con negras donde la ventaja es suya.

## F3-04 · Blunders del rival que no castigó

La app evalúa las jugadas de los dos bandos y solo usa las de Gabriel, y solo para castigarlas.
El espejo es barato porque `moves.eval_cp` ya está poblado para el rival: la evaluación sube a su
favor y su jugada siguiente la devuelve.

Es la debilidad vista desde el otro lado, y es lo que el benchmark llama *Opportunism* en Lichess.
Para un jugador de 1250, "tuviste 14 regalos y aprovechaste 3" es más útil y más motivador que
cualquier tasa de error.

**Criterio de aceptación:** conteo mensual con su `n` y enlace a las posiciones.

## F3-05 · "Estás mejorando", con datos

El bloque de la portada lleva desde la Fase 7 con un `PendienteDeDatos` fijo
(`app/page.tsx:252`), y son 23 meses de datos disponibles.

Serie mensual, solo de rápida, de la North Star y de los graves por partida, con su `n` y su
banda. Y el gráfico que la revisión cruzada identificó como "la conversación con el alumno": el
volumen de bala contra el rating de rápida en el mismo eje temporal. Su máximo (1464) es del mes
de 408 partidas de rápida; hoy es 1268 con 436 de bala al mes. **Correlación, no causa**, y el
texto lo dice.

**Criterio de aceptación:** el bloque deja de estar vacío; ningún mes con n<20 se presenta sin
atenuar.

---

## Antes de dar la fase por terminada

- CI en verde.
- Ninguna de las cinco métricas se muestra sin su `n` y su cobertura.
- Capturas a 390 px de la portada.
- `CLAUDE.md`, `PLAN.md` y `docs/review/BITACORA.md` actualizados.
