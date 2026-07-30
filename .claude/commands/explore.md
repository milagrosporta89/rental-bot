# Explorar el dominio de una feature antes de construirla

Leé primero `.claude/CONTEXT.md` para el contexto general del proyecto.

`ARGUMENTS` (al final de este prompt) indica qué feature explorar — ej: `gastos`, `auth-header`, `comision`. Si no viene ningún valor en `ARGUMENTS`, preguntale a Mili cuál feature quiere explorar antes de seguir.

No escribas código todavía. Esta tarea es solo de investigación y reporte.

## Primero: ¿esta feature tiene equivalente en el bot de WhatsApp?

Buscá en `src/handlers/` si hay un flujo de bot relacionado. Hay dos caminos:

- **Sí lo tiene** (ej: gastos, ingresos, comisión): seguí los pasos de "Con equivalente en el bot" abajo.
- **No lo tiene** (ej: login, header, algo puramente de la web sin contraparte por WhatsApp): decilo explícitamente en el reporte y seguí los pasos de "Sin equivalente en el bot". No inventes un flujo de bot que no existe.

## Pasos — con equivalente en el bot

1. Buscá el handler del flujo en `src/handlers/`.
2. Buscá dónde persiste los datos en la web: ¿Supabase? (la persistencia del bot, si existe un flujo equivalente, vive en el repo del bot — `rental-bot-whatsapp` — no en este repo, no la busques acá). **No asumas que es lo mismo que en otra feature ya migrada** — cada flujo puede estar en un backend distinto. Si hay una tabla de Supabase candidata, conectate y confirmá su schema real (columnas, requeridas, tipos) en vez de inferirlo solo del código del bot — pueden haber divergido. Si hace falta, hacé un script puntual de solo lectura para introspectar la tabla y borralo después de usarlo.
3. Buscá los tipos TypeScript relacionados en `src/lib/types.ts`.
4. Fijate si el proyecto (`src`) ya tiene algún patrón de UI equivalente o reusable para este flujo (ej: subida de comprobante con OCR, wizard de pasos, validaciones) — vas a necesitarlo para no reinventar nada en las fases de Designer/Developer.
5. Leé cualquier README o documentación existente (`*.md` en la raíz).

## Pasos — sin equivalente en el bot

1. Revisá qué dependencias ya están instaladas en `package.json` que puedan cubrir la necesidad (ej: `@supabase/ssr` para auth) — preferí siempre lo que ya está instalado sobre agregar algo nuevo.
2. Revisá patrones ya existentes en `src` que la nueva feature deba seguir o integrar (ej: cómo está armado el layout, el header, los clientes de Supabase).
3. Identificá qué configuración o estado externo hace falta (variables de entorno, servicios de terceros, datos que tienen que existir de antemano — ej: cuentas de usuario) y si ya existe o falta crearlo.
4. Leé cualquier README o documentación existente (`*.md` en la raíz).

## Reporte final

Producí el resumen en este formato (en el chat; no hace falta guardarlo como artifact, pero si la exploración fue larga o el dominio es complejo, guardalo en `.claude/artifacts/<feature>-explore.md` para no perderlo entre sesiones):

```
## Lo que entendí del dominio
[campos de la tabla/sheet, tipos, validaciones, dependencias o patrones ya disponibles que encontraste]

## Flujo actual del bot
[los pasos que sigue el usuario en WhatsApp — o "Sin equivalente en el bot" si no aplica]

## Gaps o ambigüedades
[cosas que no están claras para la UI, discrepancias entre el bot y dónde persiste realmente la data, o configuración/estado externo que falta resolver]

## Preguntas para Mili
[máximo 10, solo si son bloqueantes]
```

**Guardá siempre este reporte en `.claude/artifacts/<feature>/explore.md`**, incluidas las respuestas de Mili a las preguntas bloqueantes una vez que las conteste — no es opcional. `/run-pipeline` ejecuta cada fase como un subagente aislado (ver `PIPELINE.md`) que no tiene acceso a esta conversación, solo a lo que esté en disco; si este archivo no existe, el Agente 1 (PO) no tiene de dónde partir.

Cuando Mili responda las preguntas bloqueantes, quedás listo para correr `/run-pipeline <feature>`.
