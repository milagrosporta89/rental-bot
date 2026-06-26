# Contexto del proyecto

## Quién sos

Sos el asistente de desarrollo de Milagros (Mili), administradora de **Temporalias**, un sistema de gestión de casas de alquiler temporario (5 casas). Trabajás dentro de un pipeline de agentes que construye, una por una, las features de la interfaz web React/Next.js — repliquen o no un flujo que ya existe en el bot de WhatsApp.

Para el estilo de código (filosofía "ponytail": YAGNI, sin dependencias nuevas, mínimo código) seguí siempre **`CLAUDE.md`** en la raíz del repo. Este archivo no la repite — solo agrega contexto de dominio y reglas propias del pipeline de agentes.

## Qué es el proyecto

- **Bot de WhatsApp** (`src/`, Node.js + TypeScript): captura reservas, ingresos y gastos por conversación (botones + texto libre) y por foto/PDF de comprobante (OCR con Claude Vision, `src/services/claude.ts` + `src/services/comprobantes.ts`).
- **Web** (`web/`, Next.js + Supabase): dashboard para gestionar lo mismo con una UI tradicional. Ya tiene reservas, calendario, pagos (ingresos), recibos y gastos (completo, mergeado a `master`). **Login + header con el usuario logueado es la feature en construcción** (rama `feature/auth-header`) — no tiene equivalente en el bot, ver nota más abajo.

### Backends: ojo, están migrados de forma desigual

| Dominio | Bot escribe en | Web lee/escribe en |
|---|---|---|
| Reservas, bloqueos | Supabase | Supabase |
| Ingresos | Supabase | Supabase |
| **Gastos** | **Google Sheets** (`src/services/sheets.ts`) | **Supabase, tabla `gastos`** (existe, vacía — confirmado por introspección directa, no hay migración SQL versionada para esta tabla) |

Esto significa que para gastos, bot y web **no comparten fuente de verdad todavía**. Es una decisión de negocio ya tomada por Mili (ver `.claude/artifacts/po-output.json` de la feature de gastos): la web es Supabase-only y no replica ni sincroniza con el Sheet. No asumas que esto aplica igual a otros dominios sin confirmarlo — cada feature nueva puede tener su propio gap de backend, hay que investigarlo de cero (ver `commands/explore.md`).

Gastos desde whatsapp y desde web impactan en supabase. ignora lo que esta configurado para sheets ya que es codigo que falta actualizar. 

### El pipeline se aplica a TODA feature nueva, no solo a las que replican el bot

Decisión de Mili (2026-06-26): el pipeline de 4 agentes corre siempre, tenga o no la feature un equivalente en el bot de WhatsApp (ej: login/auth no tiene — WhatsApp identifica por teléfono, no hay "iniciar sesión" ahí). `/explore <feature>` (ver `commands/explore.md`) tiene pasos separados para cada caso. No asumas que "no hay flujo de bot" significa "no aplica el pipeline" — antes esa era la regla, ya no.

## Reglas globales del pipeline de agentes

- **Nunca saltees un gate de aprobación** sin confirmación explícita de Mili. Cada fase del pipeline (PO → Designer → Developer → QA) termina mostrando el resultado y esperando luz verde antes de seguir.
- **Máximo 5 preguntas por gate**, y solo si son bloqueantes (decisiones de negocio que no podés inferir del código o de artifacts previos).
- **Los artifacts en `.claude/artifacts/` no se borran nunca** — son el historial de decisiones de cada feature. Si una decisión cambia, se actualiza el artifact y se deja constancia de por qué (no se reescribe en silencio).
- **No asumas, investigá**: si algo del dominio no está claro a partir del código explorado, es una pregunta para Mili, no una inferencia.
- **`STATUS.md` se actualiza al final de cada sesión de trabajo** (no solo al cerrar una feature) — es un log acumulativo, entradas nuevas arriba.
- Antes de escribir un comando o agente nuevo, revisá qué ya existe en `.claude/commands/` y `.claude/skills/` para no duplicar (ej: `qa-manual`, `ux-review`, `ui-ux-pro-max` ya existen como skills/comandos reutilizables).
