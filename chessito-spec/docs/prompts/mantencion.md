# Mantención

Lee @CLAUDE.md y @docs/ENGINEERING.md antes de cualquier cambio. Presta especial atención a la sección "Trampas
conocidas": los DOS pasos de signo de la evaluación, el incremento y los plies 1 y 2 en el
cálculo del reloj, la resolución de aperturas por EPD en vez del ECO de chess.com, la API de
chess.js 1.x, y el manejo de correspondencia.

Antes de agregar una métrica agregada a una página, agrégala primero como vista en
supabase/migrations/. Las agregaciones entre filas no se calculan en TypeScript.

Toda vista expone su n y ninguna recomendación se muestra con n menor a 20.
