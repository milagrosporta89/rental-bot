# Correr el pipeline de 4 agentes para una feature

Leé primero `.claude/CONTEXT.md` y `.claude/PIPELINE.md` — este comando ejecuta el proceso descripto ahí, no lo repite.

`ARGUMENTS` (al final de este prompt) indica la feature a construir — ej: `gastos`. Si no viene ningún valor, preguntale a Mili antes de seguir.

Antes de arrancar:
- Confirmá que ya corriste `/explore <feature>` y que Mili aprobó las respuestas a las preguntas bloqueantes. Si no, parate y pedile que corra `/explore <feature>` primero — el pipeline no investiga el dominio desde cero.
- Revisá `STATUS.md`: si ya hay una corrida en progreso para esta misma feature, continuá desde la fase donde quedó (no reinicies desde el Agente 1 si ya hay un `.claude/artifacts/<feature>/po-output.json` aprobado, por ejemplo).

Ejecutá las fases de `PIPELINE.md` en orden (Setup → Agente 1 PO → Agente 2 Designer → Agente 3 Developer → Agente 4 QA), respetando los gates de aprobación. Cada artifact va en `.claude/artifacts/<feature>/`, nunca en la raíz de `artifacts/` sin carpeta — ver nota en `PIPELINE.md`.

Al final de cada fase (incluido el setup), actualizá `STATUS.md` con una entrada nueva (arriba del todo) indicando: feature, rama, fase completada, qué está pendiente, y cualquier decisión o pregunta abierta.

Después de cada commit de un agente (PO/Designer/Developer/QA), corré `node scripts/pipeline-viewer.mjs` para regenerar `.claude/artifacts/viewer.html` — es la forma cómoda de revisar el output antes de pedirle aprobación a Mili (no reemplaza mostrarlo en el chat, es un complemento). El script infiere la feature de la rama actual (`feature/<feature>-ui`); si hace falta verla explícitamente, `node scripts/pipeline-viewer.mjs <feature>`. El archivo no se commitea (está en `.gitignore` vía `*.html`), se regenera on-demand.
