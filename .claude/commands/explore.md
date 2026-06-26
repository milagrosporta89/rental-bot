# Explorar un flujo del bot antes de replicarlo en la web

Leé primero `.claude/CONTEXT.md` para el contexto general del proyecto.

`ARGUMENTS` (al final de este prompt) indica qué flujo explorar — ej: `gastos`, `ingresos`, `comision`. Si no viene ningún valor en `ARGUMENTS`, preguntale a Mili cuál flujo quiere explorar antes de seguir.

No escribas código todavía. Esta tarea es solo de investigación y reporte.

## Pasos

1. Buscá el handler del flujo en `src/handlers/` (bot de WhatsApp).
2. Buscá dónde persiste los datos: ¿Google Sheets (`src/services/sheets.ts`)? ¿Supabase? **No asumas que es lo mismo que en otra feature ya migrada** — cada flujo puede estar en un backend distinto. Si hay una tabla de Supabase candidata, conectate y confirmá su schema real (columnas, requeridas, tipos) en vez de inferirlo solo del código del bot — pueden haber divergido. Si hace falta, hacé un script puntual de solo lectura para introspectar la tabla y borralo después de usarlo.
3. Buscá los tipos TypeScript relacionados en `src/types.ts`.
4. Fijate si la web (`web/src`) ya tiene algún patrón de UI equivalente o reusable para este flujo (ej: subida de comprobante con OCR, wizard de pasos, validaciones) — vas a necesitarlo para no reinventar nada en las fases de Designer/Developer.
5. Leé cualquier README o documentación existente (`*.md` en la raíz y en `web/`).

## Reporte final

Producí el resumen en este formato (en el chat; no hace falta guardarlo como artifact, pero si la exploración fue larga o el dominio es complejo, guardalo en `.claude/artifacts/<feature>-explore.md` para no perderlo entre sesiones):

```
## Lo que entendí del dominio
[campos de la tabla/sheet, tipos, validaciones que encontraste]

## Flujo actual del bot
[los pasos que sigue el usuario en WhatsApp]

## Gaps o ambigüedades
[cosas que el bot hace pero no están claras para la UI, o discrepancias entre lo que el bot hace y dónde persiste realmente la data]

## Preguntas para Mili
[máximo 10, solo si son bloqueantes]
```

Cuando Mili responda las preguntas bloqueantes, quedás listo para correr `/run-pipeline <feature>`.
