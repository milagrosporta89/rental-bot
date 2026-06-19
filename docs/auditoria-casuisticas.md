# Auditoría de casuísticas — rental-bot

Fecha de análisis: 2026-06-17
Archivos auditados:
- `src/handlers/reservas.ts`
- `src/handlers/gastos.ts`
- `src/handlers/common.ts`
- `src/handlers/correccion.ts`
- `src/services/reservas.ts`
- `src/services/sheets.ts`
- `src/types.ts` / `src/utils.ts`

---

## Mapa de máquinas de estado

### Handler: Reservas (`src/handlers/reservas.ts`)

**Rama A — Nueva reserva**

```
[inicio: onReservaCommand]
  → paso "res_tipo"
      → btn "res_tipo_nueva"
          → paso "res_casa"                (elegir casa por botón)
          → paso "res_nombre_pax"          (texto libre)
          → paso "res_cantidad_pax"        (número)
          → paso "res_fechas"              (rango DD/MM – DD/MM)
          → paso "res_monto_total"         (USD, texto)
          → paso "res_monto_adelanto"      (texto o foto)
              ↓ foto → paso "res_confirmar_monto_foto" → [ok|manual]
          → paso "res_moneda_adelanto"     (sólo si moneda ambigua, botón ARS/USD)
          → pedirTipoPago()                (btn transferencia|efectivo)
          → pedirQuienRecibio()            (btn titular, sólo si destinatario desconocido)
          → paso "res_confirmacion"        (resumen + confirmar|editar|cancelar)
              → btn "res_editar_nueva"     → lista campos editables
                  → res_editar_campo_nombre   → vuelve a "res_nombre_pax"
                  → res_editar_campo_personas → vuelve a "res_cantidad_pax"
                  → res_editar_campo_fechas   → vuelve a "res_fechas"
                  → res_editar_campo_total    → vuelve a "res_monto_total"
                  → res_editar_campo_adelanto → vuelve a "res_monto_adelanto"
              → btn "res_confirmar"        → guardarNuevaReserva() → FIN
              → btn "res_cancelar"         → FIN (estado borrado)
```

**Rama B — Saldo de reserva existente**

```
[inicio: onReservaCommand → btn "res_tipo_saldo"]
  → listarReservasPendientes()
      → paso "res_elegir_semana"   (número de lista o 0 para buscar por nombre)
      → paso "res_buscar_nombre"   (texto, búsqueda parcial)
      → paso "res_elegir_busqueda" (si múltiples resultados)
  → paso "res_monto_saldo"         (texto o foto)
      ↓ foto → paso "res_confirmar_monto_foto" → [ok|manual]
  → paso "res_moneda_saldo"        (sólo si moneda ambigua, botón ARS/USD)
  → pedirTipoPago()
  → pedirQuienRecibio()            (sólo si destinatario desconocido)
  → paso "res_confirmacion_saldo"  (resumen + confirmar|editar monto|cancelar)
      → btn "res_editar_monto_saldo" → vuelve a "res_monto_saldo"
      → btn "res_confirmar_saldo"    → guardarSaldo() → FIN
      → btn "res_cancelar_saldo"     → FIN
```

**Rama C — Corrección de reserva existente**

```
[inicio: onCorregirCommand]
  → paso "res_corregir_buscar"     (texto: ID numérico o nombre)
  → paso "res_corregir_elegir"     (si múltiples resultados, número de lista)
  → paso "res_corregir_campo"      → mostrarMenuCorreccion()
      → btn "res_corregir_nombre"   → paso "res_corregir_nuevo_nombre" (texto)
      → btn "res_corregir_casa"     → paso "res_corregir_nueva_casa"   (botón)
      → btn "res_corregir_fechas"   → paso "res_corregir_nuevas_fechas" (texto)
      → btn "res_corregir_monto"    → paso "res_corregir_nuevo_monto"  (texto)
      → btn "res_corregir_personas" → paso "res_corregir_nueva_cantidad_pax" (texto)
  → actualizarCampoReserva() → FIN  (un solo campo; no hay confirmación previa)
```

**Rama D — Foto sin contexto previo**

```
[inicio: onPhotoSinContexto — no hay estado activo]
  → paso "res_foto_pendiente"  (botón: reserva nueva | saldo | gasto | ingreso)
      → btn "res_tipo_nueva"   → procesarFotoEnContexto(flujo="nueva") → sigue Rama A
      → btn "res_tipo_saldo"   → procesarFotoEnContexto(flujo="saldo") → sigue Rama B
      → btn "res_foto_gasto"   → onPhotoGasto()
      → btn "res_foto_ingreso" → onPhotoIngreso()
```

**TTL / persistencia:** Estado se persiste en `data/estados.json`. TTL = 4 horas. Al expirar: `sesionExpirada()` muestra menú y el flujo se abandona.

**Puntos de escape:** `intentarEscape()` detecta palabras "cancelar / salir / menú / volver / inicio / start" y cancela el estado activo, y también detecta "saldo / reserva / gasto / ingreso" si hay estado activo.

---

### Handler: Gastos (`src/handlers/gastos.ts`)

**Flujo A — Comprobante (foto)**

```
[inicio: onPhoto]
  → procesarComprobante()
      ✗ descarga_fallida → FIN (pide reenvío)
      ✗ ilegible         → FIN (pide reenvío)
      ✗ duplicado        → FIN (alerta)
      ✓ ok
  → paso "confirmar_datos"    (resumen + confirmar | corregir)
      → btn "gasto_corregir"  → paso "corrigiendo"
          texto "fecha DD/MM/YYYY"       → actualiza fecha
          texto "destinatario Nombre"    → actualiza destinatario
          texto "confirmar"              → vuelve a "confirmar_datos" (corregido=true)
      → btn "gasto_confirmar"
          si titular detectado en ordenante:
            → paso "seleccionar_categoria"
            → btn "gasto_cat_*"
                si cat="otro" → paso "categoria_personalizada" (texto libre)
            → paso "pedir_descripcion"   (texto o btn "gasto_omitir_descripcion")
            → guardarGasto() → FIN
          si titular NO detectado:
            → paso "seleccionar_categoria"
            → paso "seleccionar_quien"   (btn titular o "gasto_quien_otro")
                "gasto_quien_otro" → paso "gasto_quien_manual" (texto libre)
            → paso "pedir_descripcion"
            → guardarGasto() → FIN
```

**Flujo B — Manual**

```
[inicio: onManualGasto]
  → paso "seleccionar_categoria"
  → btn "gasto_cat_*"
      si cat="otro" → paso "categoria_personalizada" (texto)
  → paso "gasto_monto"      (texto numérico)
  → paso "gasto_moneda"     (btn ARS|USD)
  → paso "pedir_descripcion"
  → paso "seleccionar_quien"
  → paso "gasto_fecha"      (DD/MM/YYYY o "hoy")
  → paso "confirmar_manual" (resumen + guardar | cancelar)
  → guardarGasto() → FIN
```

**Flujo C — Corrección de gasto ya cargado** (`src/handlers/correccion.ts`)

```
[inicio: onCorregirGastoCommand]
  → obtenerUltimosGastos(10) → lista en pantalla
  → paso "corr_lista"  (número de ítem)
  → paso "corr_campo"  (lista de campos editables por botón: categoría|detalle|fecha|monto)
      → puede editar varios campos acumulativamente antes de guardar
  → paso "corr_valor"  (texto: nuevo valor, validado por campo)
      → vuelve a "corr_campo" (muestra cambios acumulados)
  → btn "corr_guardar_cambios" → paso "corr_confirmar"
  → btn "corr_confirmar_si"
      → si esOwner: aplicarCorrecciones() inmediato + registrarAudit()
      → si no esOwner: solicitud pendiente al owner via sendButtons()
          → owner aprueba/rechaza por botón → registrarAudit()
  → FIN
```

**Persistencia gastos:** `new Map<string, EstadoGasto>()` — en memoria, sin TTL, sin persistencia a disco. Perdida al reiniciar el proceso.

**Persistencia correcciones:** `new Map<string, EstadoCorreccion>()` + `new Map<string, PendingApproval>()` — en memoria.

---

## Módulo A — Reservas

| # | Casuística | Estado | Dónde está (archivo:función/estado) | Observación |
|---|-----------|--------|--------------------------------------|-------------|
| A1a | Alta de reserva — datos mínimos (casa, nombre, pax, fechas, total, adelanto) | **Cubierto** | `reservas.ts:onText` pasos `res_casa` → `res_nombre_pax` → `res_cantidad_pax` → `res_fechas` → `res_monto_total` → `res_monto_adelanto` | Todos los campos obligatorios se capturan secuencialmente; ninguno se puede omitir. |
| A1b | Alta — validación formato fechas | **Cubierto** | `reservas.ts:parsearFechas` | Valida rango DD/MM[/YYYY]; salida ≤ entrada retorna noches=-1 con mensaje claro. |
| A1c | Alta — solapamiento con otra reserva de la misma propiedad | **No cubierto** | — | No hay ninguna consulta de reservas existentes durante el alta para detectar superposición de fechas. |
| A1d | Alta — propiedad inexistente | **No aplica** | `reservas.ts:onCallback` botón `res_casa_*` | El selector de casa es un botón fijo con las casas de `CASAS[]`; el usuario no puede escribir una casa libre. |
| A2 | Modificación durante el alta (corregir campo puntual sin reiniciar flujo) | **Cubierto** | `reservas.ts:onCallback` botones `res_editar_campo_*` | Desde la pantalla de confirmación (paso `res_confirmacion`) el usuario puede volver a cualquier campo individual. Al volver avanza normalmente, no reinicia desde cero. |
| A3a | Modificación de reserva confirmada — nombre, casa, fechas, monto, personas | **Cubierto** | `reservas.ts:onCorregirCommand` → `actualizarCampoReserva()` | Flujo `/corregir` permite editar: nombrePax, casa, fechaEntrada/Salida, montoTotalUSD, cantidadPax. |
| A3b | Modificación de reserva confirmada — datos del pasajero (contacto, etc.) | **No cubierto** | — | Solo se guarda nombre; no hay campo de email/teléfono en la estructura `Reserva`. |
| A4 | Modificación con seña ya registrada — recálculo de saldo al cambiar monto total | **Parcial** | `reservas.ts:onCallback` `res_corregir_nuevo_monto` → `actualizarCampoReserva(fila, "montoTotalUSD", valor)` | Al cambiar `montoTotalUSD` vía corrección se actualiza solo esa celda en la hoja `Reservas`; la celda `saldoUSD` (col M) no se recalcula automáticamente. La diferencia entre `montoTotalUSD` y adelanto queda inconsistente hasta que se registre un saldo. |
| A5 | Extensión de estadía (reserva confirmada con seña pagada) | **No cubierto** | — | No existe ningún flujo. Ver observación abajo. |
| A6 | Auditoría de modificaciones — rastro de qué cambió, cuándo y valor anterior | **Parcial** | `sheets.ts:registrarAudit` / `correccion.ts:aplicarCorrecciones` | `registrarAudit()` registra en hoja `historial` con timestamp, campo, valorAnterior, valorNuevo, modificadoPor, aprobadoPor. **Cubierto para gastos**. Para reservas: `actualizarCampoReserva()` no llama `registrarAudit()` — no queda rastro de cambios en reservas. |
| A7a | Pago parcial (seña + saldo en partes) — más de un pago parcial | **Parcial** | `reservas.ts:guardarSaldo` → `registrarSaldoReserva()` | Cada llamada a "Saldo de reserva" registra un ingreso y actualiza `saldoUSD` y `estadoPago`. Es posible hacer múltiples pagos parciales llamando varias veces al flujo de saldo. Sin embargo, cada llamada sobreescribe el `saldoUSD` de la fila (no acumula en la hoja Reservas; la fuente de verdad se desplaza a Ingresos). |
| A7b | Suma de pagos supera el monto total | **Parcial** | `reservas.ts:pedirConfirmacionSaldo` | Hay un aviso al usuario (`⚠️ Este pago supera el saldo pendiente en USD X`), pero no bloquea la operación. Se permite confirmar y el `saldoUSD` queda en 0 (no negativo, gracias a `Math.max(0, ...)`). No queda registro explícito del excedente. |
| A8 | Anulación de reserva | **No cubierto** | — | No existe ningún flujo de anulación ni borrado de reservas. Sin estado "ANULADO" en `EstadoPagoReserva`. |
| A9 | Concurrencia/solapamiento de fechas al crear reserva nueva | **No cubierto** | — | Idéntico a A1c. No hay validación de solapamiento en ningún paso del alta. |

**Nota A5 — Recomendación para extensión de estadía:**
La opción más consistente con el sistema actual sería **modificar la reserva existente** (actualizar `fechaSalida`, `cantidadNoches` y `montoTotalUSD`), dejando el rastro de pagos ya existentes intactos en la hoja Ingresos. Crear una reserva nueva duplicaría al pasajero y fragmentaría la trazabilidad. Si el adicional se cobra como pago extra, se puede registrar vía "Saldo de reserva" con el nuevo importe diferencial, sin crear una nueva reserva. Esta recomendación aplica si el monto aumenta; si las fechas cambian sin aumento de monto, alcanza con actualizar fechas.

---

## Módulo B — Gastos

| # | Casuística | Estado | Dónde está (archivo:función/estado) | Observación |
|---|-----------|--------|--------------------------------------|-------------|
| B1 | Alta de gasto — flujo completo y campos | **Cubierto** | `gastos.ts:onManualGasto` / `gastos.ts:onPhoto` | **Comprobante:** categoría → (pagador si no se detecta) → descripción → guarda. **Manual:** categoría → monto → moneda → descripción → pagador → fecha → confirmación → guarda. Campos: id, fecha, monto, moneda, categoría, pagadoPor, nombreDestinatario, bancoOrigen, nroOperacion, detalle, registradoPor, comprobanteUrl, timestamp, cotizacion. |
| B2 | Categoría inexistente / libre | **Cubierto** | `gastos.ts:onCallback` botón `gasto_cat_otro` → paso `categoria_personalizada` | Si el usuario elige "Otro" puede escribir cualquier texto como categoría personalizada. No hay rechazo de texto libre. |
| B3 | Fecha futura (flujo manual) | **Cubierto** | `utils.ts:validarFecha` — `permitirFutura=false` por defecto | `validarFecha()` rechaza fechas futuras con mensaje "No podés ingresar una fecha futura." Aplica al flujo manual y a correcciones. |
| B4 | Fecha de año anterior (sin límite hacia atrás) | **Parcial** | `utils.ts:validarFecha` | No hay límite hacia atrás. Se acepta cualquier fecha pasada válida. Sin validación de "demasiado vieja". La lógica de auto-año (`sinAnio && fecha > new Date()` retrocede un año) puede aceptar accidentalmente fechas del año anterior si se omite el año. |
| B5 | Corrección antes de confirmar — comprobante | **Cubierto** | `common.ts:manejarCorreccion` + `gastos.ts:onCallback` botón `gasto_corregir` | Permite corregir `fecha` y `destinatario` con sintaxis "fecha DD/MM/YYYY" / "destinatario Nombre". Para el flujo manual hay confirmación previa con "Confirmar / Cancelar" pero sin corrección campo a campo. |
| B5b | Corrección antes de confirmar — manual | **Parcial** | `gastos.ts:mostrarConfirmacionManual` | Solo hay botones "Confirmar / Cancelar". No hay opción de editar un campo puntual sin cancelar y reiniciar. Contrasta con reservas que tiene `res_editar_campo_*`. |
| B6 | Listado de últimos gastos cargados | **Cubierto** | `correccion.ts:onCorregirGastoCommand` → `obtenerUltimosGastos(10)` | El comando `/corregir gasto` muestra los últimos 10 gastos. No hay un comando independiente de solo consulta (siempre entra en flujo de edición). |
| B7 | Descarga / exportación de gastos del último mes | **No cubierto** | — | No hay flujo de exportación o listado filtrado por mes accesible desde el bot. El reporte general (`obtenerDatosReporte`) incluye gastos del mes actual pero no es exportable desde el bot como archivo. |
| B8 | Modificación de un gasto ya cargado | **Cubierto** | `correccion.ts` — flujo completo `onCorregirGastoCommand` + `onTextCorreccion` + `onCallbackCorreccion` | Permite editar: categoría, detalle, fecha, monto. No permite cambiar pagadoPor ni moneda. Flujo con aprobación del owner si el solicitante no es el owner. |
| B9 | Baja / eliminación de un gasto | **No cubierto** | — | No existe ningún flujo de eliminación. Ver recomendación abajo. |
| B10 | Margen para columna "eliminado" en hoja Gastos | **Parcial** | `sheets.ts:registrarGasto` escribe cols A:P (16 columnas) | La hoja Gastos actualmente escribe hasta la columna P (índice 15 en 0-based). El mapa `COL_GASTO` usa B/C/E/J. Agregar una columna Q de estado/eliminado no rompe ninguna lectura existente si se añade al final. Las lecturas son por rango A:J (obtenerUltimosGastos) o A:I (buscarGastoDuplicado) o A2:O (obtenerDatosReporte), ninguna llega a Q. Se puede agregar con seguridad. |

**Nota B9 — Recomendación para baja de gastos:**
Dado que la fuente de verdad es Google Sheets y no hay triggers ni foreign keys, se recomienda **soft-delete**: agregar una columna `estado` (col Q) con valor `"activo"` por defecto y `"eliminado"` al borrar. Todas las lecturas existentes ignoran esa columna (rango A:P o menor), por lo que no se rompe nada. Borrado físico no es recomendable: perdería la trazabilidad contable y no hay forma de deshacer errores; el historial en la hoja `historial` tampoco recogería la eliminación.

**Nota B8 — Escenarios comunes de modificación de gastos:**
1. Categoría mal ingresada (ej: "otro" cuando era "limpieza").
2. Monto equivocado (error tipográfico).
3. Fecha incorrecta (gastos del mes pasado cargados con fecha de hoy).
4. Pagador incorrecto (confusión entre titulares).
5. Detalle vacío o con error.
Los ítems 4 (pagadoPor) y la moneda no son editables en el flujo actual de corrección.
