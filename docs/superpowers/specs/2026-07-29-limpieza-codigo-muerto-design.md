# Limpieza de código muerto rental-bot — diseño

Fecha: 2026-07-29

## Contexto

`/code-quality` (adaptado para cubrir `src/` y `web/`) generó un reporte de archivos sin uso y código muerto en archivos activos. Este diseño acuerda el alcance real de la pasada de limpieza: qué se elimina, qué se archiva, y qué queda fuera a propósito. No incluye refactors estructurales — se evaluó partir los archivos más grandes del repo y se descartó (ver sección 3).

Filosofía aplicada: ponytail (CLAUDE.md) — YAGNI, borrar > agregar, sin abstracciones no pedidas.

## 1. Eliminar (código muerto confirmado, sin ambigüedad)

**Web:**
- `web/src/components/calendario/ViewToggle.tsx` (archivo completo) — nunca importado, quedó del commit inicial.
- `web/src/components/ui/badge.tsx` (archivo completo) — cero imports.
- `web/src/components/ui/toast.tsx` (archivo completo) — cero imports. Incluye eliminar el CSS huérfano que deja en `web/src/app/globals.css:75-81` (`@keyframes toast-in`, `.animate-toast-in`), que solo existe para este componente.
- `web/src/app/reservas/[id]/page.tsx:47` — variable `color` declarada y nunca leída.
- `web/src/app/reservas/nueva/page.tsx:13` — import `hoy` de `@/lib/dates` sin usar.
- `web/src/lib/dates.ts:36-39` — función `generarIdReserva(n)`, sin ningún llamador; la creación de reservas usa otra vía para el ID.

**Bot:**
- `src/types.ts:8` — tipo `TipoIngreso`, exportado y nunca importado.
- `src/handlers/cash.ts:113-122` — rama `if (buttonId === "efectivo_tipo_ingreso")`, marcada como "legacy" en el propio código; el botón que la disparaba ya no se emite desde ningún `replyButtons`/`replyList` del proyecto.
- `src/services/sheets.ts:308-337` — función `buscarGastoPorId`, exportada y sin ningún import.
- `src/services/whatsapp.ts` — campos `messageId` y `buttonReplyTitle` de la interfaz `WaMessage`, más el código que los calcula al parsear el webhook (líneas ~86 y ~105); `buildCtx()` en `src/index.ts` nunca los lee. Decisión: eliminar (YAGNI — si hacen falta para debug/logging futuro, se vuelven a agregar).

## 2. Archivar

Mover a `_archive/scripts/` (carpeta ya existente, gitignored — mismo patrón usado para scripts de seed/setup anteriores). Quedan disponibles localmente pero salen del tracking de git.

- `scripts/migrar-datos.js` — migración one-time ya ejecutada (apunta a `OLD_SHEET_ID` hardcodeado).
- `scripts/diagnostico-sheets.js` — diagnóstico manual atado al mismo `OLD_SHEET_ID` de la migración vieja.
- `scripts/generar-resumen.js` — utilidad manual para reconstruir la pestaña "Resumen"; no está en ningún script de `package.json`.
- `scripts/setup/setup-sheets.js` — setup idempotente de pestañas/formato; no está en ningún script de `package.json`.

Nota: como `_archive/` está gitignored, este movimiento efectivamente saca estos 4 archivos del historial de git hacia adelante (quedan solo locales). Si en el futuro hace falta recuperarlos desde git, están en el historial de commits anteriores a este.

## 3. Fuera de alcance (decisión explícita, no descuido)

- **Sistema de comisiones pausado hasta agosto**: los 6 componentes de `cuenta-paola/` (`AjusteLibreModal`, `CancelacionesPendientesSection`, `CierreCuentaSection`, `SaldoPaolaCard`, `TablaMovimientos`, `TablaReconciliacionComision`) más los símbolos que solo ellos usan (`TIPO_MOVIMIENTO_LABEL` y `RESOLUCION_CANCELACION_LABEL` en `web/src/lib/types.ts`, `marcarResolucionCancelacion` en `web/src/app/actions/ingresos.ts`, `saldoPendienteDesglosado` en `web/src/lib/cuentaPaola.ts`) se tratan como una sola unidad y no se tocan, aunque `saldoPendienteDesglosado` parezca huérfana incluso dentro del sistema pausado. El commit `2a8adb4` los desconectó a propósito para el mes de transición de julio; vuelven a usarse en agosto (ver memoria del proyecto "Comisiones pausadas hasta agosto").
- **Archivos grandes pero cohesivos**: se evaluó partir `src/handlers/reservas.ts` (1491 líneas, máquina de estados de una sola conversación de WhatsApp), `web/src/app/reservas/nueva/page.tsx` (729 líneas, wizard multi-paso) y `web/src/app/reservas/[id]/pago/page.tsx` (635 líneas, wizard multi-paso). Los tres son largos por cantidad de pasos del flujo, no por mezclar responsabilidades ajenas entre sí, y no se detectó duplicación cruzada entre ellos. Partirlos solo por tamaño sería una reestructuración cosmética con riesgo de romper flujos que hoy funcionan, sin beneficio concreto pedido — se descarta por criterio ponytail (sin abstracciones no pedidas).
- **Scripts EVALUAR restantes**: no aplica — los 3 que estaban en evaluación (`diagnostico-sheets.js`, `generar-resumen.js`, `setup-sheets.js`) se movieron a la sección 2 (Archivar) tras confirmar con el usuario.

## 4. Orden de ejecución y verificación

1. Archivar los 4 scripts (`git mv` a `_archive/scripts/`, o `git rm` + copia local ya que la carpeta está gitignored). Cambio de menor riesgo, no toca código de la app.
2. Eliminar código muerto del bot (`src/`), un archivo/símbolo a la vez. Después de cada uno: `npm run build` (tsc) + `npm test` (jest).
3. Eliminar código muerto de la web (`web/`), un archivo/símbolo a la vez. Después de cada uno: `npx tsc --noEmit` + `npm run build` (next build) + `npm run lint` (eslint).
4. Antes de cada eliminación, grep del símbolo en todo el repo (por si hay uso dinámico/por string no detectado por el análisis estático del reporte).
5. Verificación final: build completo de ambos (`npm run build` en raíz y en `web/`), suite de tests del bot (`npm test`), lint de la web (`npm run lint`).

## Resumen de alcance

| Categoría | Cantidad | Acción |
|---|---|---|
| Archivos web a eliminar completos | 3 | ViewToggle, badge, toast |
| Código muerto puntual (líneas/símbolos) | 7 | 3 en bot, 4 en web (ver sección 1) |
| Scripts a archivar | 4 | mover a `_archive/scripts/` |
| Componentes/símbolos fuera de alcance | 10 | sistema de comisiones pausado |
| Archivos grandes evaluados y descartados para refactor | 3 | reservas.ts, nueva/page.tsx, pago/page.tsx |
