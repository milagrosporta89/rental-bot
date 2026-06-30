# Correr el pipeline de 4 agentes para una feature

Leé primero `.claude/CONTEXT.md` y `.claude/PIPELINE.md` (sección "Cómo se ejecuta cada fase" incluida) — este comando ejecuta el proceso descripto ahí, no lo repite.

`ARGUMENTS` (al final de este prompt) indica la feature a construir — ej: `gastos`. Si no viene ningún valor, preguntale a Mili antes de seguir.

Antes de arrancar:
- Confirmá que ya corriste `/explore <feature>`, que Mili aprobó las respuestas a las preguntas bloqueantes, y que el resultado quedó guardado en `.claude/artifacts/<feature>/explore.md` (obligatorio — ver `commands/explore.md`). Si el archivo no existe, generalo ahora con lo que se haya hablado antes de seguir; ningún subagente de fase va a poder verlo si solo quedó en esta conversación.
- Revisá `STATUS.md`: si ya hay una corrida en progreso para esta misma feature, continuá desde la fase donde quedó (no reinicies desde el Agente 1 si ya hay un `.claude/artifacts/<feature>/po-output.json` aprobado, por ejemplo).

## Setup (lo hacés vos directamente, no es un subagente — es trabajo de git, no de criterio)

1. Creá la rama `feature/<feature>-ui` y posicionate en ella (si ya existe, posicionate y avisá que ya existía).
2. Creá la carpeta `.claude/artifacts/<feature>/` si no existe.
3. Confirmá en qué rama quedaste antes de seguir.
4. Actualizá `STATUS.md` con la entrada de setup.

## Cada fase (PO, Designer, Developer, QA): un subagente por fase

Para cada fase, en este orden:

1. **Lanzá un subagente** (Agent tool, `subagent_type: general-purpose`, en foreground — necesitás su resultado antes de mostrarle nada a Mili). El prompt tiene que ser autocontenido, porque el subagente no vio esta conversación:
   - Feature, rama (`feature/<feature>-ui`, ya creada y posicionada) y cuál de las 4 fases es.
   - "Leé `.claude/CONTEXT.md` y la sección 'AGENTE <N>: <Rol>' de `.claude/PIPELINE.md` — ejecutá ese rol tal como está descripto ahí, incluido el formato del artifact y el mensaje de commit."
   - Qué artifacts previos leer (`explore.md` siempre; `po-output.json` desde Designer en adelante; `+designer-output.json` desde Developer en adelante) y el path exacto del artifact que tiene que escribir.
   - Para Developer y QA: recordá explícitamente las reglas de datos reales de `PIPELINE.md` (limpiar cualquier fila de prueba que genere antes de terminar, preguntar antes de asumir que una fila inesperada es basura de test).
   - Instrucción de cierre: "Terminá tu respuesta final con un resumen de máximo ~15 líneas — qué decidiste, qué quedó en el artifact, preguntas bloqueantes si las hay. No pegues el JSON completo del artifact ni logs/capturas de la verificación: ya están en el archivo commiteado y en `viewer.html`."
2. Cuando el subagente termina, corré `node scripts/pipeline-viewer.mjs <feature>` (si el subagente no lo dejó hecho) y mostrale a Mili el resumen que devolvió — es el mensaje final del agente, no necesitás reconstruirlo ni resumirlo de nuevo.
3. Actualizá `STATUS.md`: una entrada nueva con feature, rama, fase completada y un resumen de 2-3 líneas. El detalle fino vive en el artifact, no lo dupliques acá.
4. Esperá la aprobación explícita de Mili antes de lanzar el subagente de la fase siguiente. Nunca saltees este gate.

## Si una fase falla (típicamente QA)

Si el subagente de Agente 4 (QA) devuelve `FAIL`: lanzá un subagente nuevo para Agente 3 (Developer) con la lista de fixes que pidió QA en el prompt, y después un subagente nuevo de QA para revisar de nuevo (fresco, no el mismo hilo — así no hereda el sesgo de su propio intento anterior). Repetí hasta `PASS` o hasta 3 intentos; si no se resuelve, escalá a Mili en el chat en vez de seguir iterando solo.

## Cierre de la feature

Cuando las 4 fases están en `PASS`/aprobadas y Mili da la sesión por terminada: escribí la entrada `(cierre)` en `STATUS.md` (resumen, qué quedó pendiente fuera del repo, decisión de merge) y archivá las entradas detalladas previas de esa feature en `.claude/artifacts/<feature>/status.md`, dejando solo el resumen de cierre en `STATUS.md` — convención completa en `CONTEXT.md`.
