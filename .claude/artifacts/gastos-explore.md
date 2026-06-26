# Exploración: flujo de gastos (bot → web)

Fecha: 2026-06-26. Resultado de `/explore gastos`, aprobado por Mili.

## Lo que entendí del dominio

Tabla `gastos` en Supabase (confirmada por introspección directa, schema real vía PostgREST — no hay migración SQL versionada para esta tabla):

`id, fecha, monto, moneda, categoria, pagado_por, nombre_destinatario, banco_origen, nro_operacion, detalle, registrado_por, comprobante_url, timestamp, cotizacion, monto_ars, monto_usd`

Requeridas a nivel DB: `id, fecha, monto, moneda, categoria, pagado_por, registrado_por, timestamp, cotizacion`.

`CategoriaGasto` (`src/types.ts`): 12 valores — `limpieza, jardinero, lavanderia, expensas, luz, gas, mantenimiento, internet, marketing, impuestos, comision, otro`. El bot solo ofrece 10 como botones (sin `jardinero` ni `comision`).

`Titular` (pagado_por): `Francisco, Milagros, Inés, Fernando, Paola` + "Otro" con texto libre.

Validaciones (`src/utils.ts`): monto numérico > 0; fecha `DD/MM/YYYY` (o `DD/MM` con año autocompletado), no puede ser futura.

## Flujo actual del bot

**A) Manual** (`onManualGasto`): Categoría → (si "otro": nombre libre) → Monto → Moneda → Descripción (opcional) → Quién pagó → Fecha → pantalla de confirmación → guardar.

**B) Por foto/PDF de comprobante** (`onPhoto`): sube archivo → Claude Vision extrae datos → chequea duplicado por `nro_operacion` (corta el flujo si ya existe) → resumen con Confirmar/Corregir (corrección por texto libre) → categoría → quién pagó (o directo si detecta titular por nombre del ordenante) → descripción → **guarda directo, sin pantalla de confirmación final** (a diferencia del manual).

`nombre_destinatario`, `banco_origen`, `nro_operacion` **solo se completan vía OCR**, el flujo manual nunca los pide.

## Gaps o ambigüedades (resueltos por Mili, ver respuestas abajo)

1. ¿Bot escribe a Sheets pero existe tabla `gastos` vacía en Supabase — cuál es la fuente de verdad para la web?
2. ¿La web reemplaza la carga de comprobante por foto, o solo el formulario manual?
3. ¿Se incluyen `jardinero`/`comision` como categorías seleccionables en la web?
4. El flujo de comprobante del bot no tiene confirmación final — ¿la web la agrega igual?
5. `registrado_por` es automático en el bot (nombre de WhatsApp) — ¿qué es en la web sin login?

## Respuestas de Mili

1. Supabase es la fuente de verdad. La tabla `gastos` ya existe (vacía). Ignorar todo lo de Sheets, "ha sido todo migrado".
2. La web debe tener carga por foto, respetando un flujo parecido al ya existente para comprobantes de ingresos (`web/src/app/reservas/[id]/pago/page.tsx`, dropzone con estados idle/uploading/done/error + autocompletado de campos) para reducir la curva de aprendizaje.
3. Se agregan `jardinero` y `comision`.
4. Siempre debe haber pantalla de confirmación, en ambos caminos.
5. Debería ser el login (no existe todavía) — queda hardcodeado como placeholder/TODO hasta que se implemente esa sección.
