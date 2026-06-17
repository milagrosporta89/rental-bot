# Pendientes — pequeños ajustes del bot

## 1. Palabra clave para cancelar/reiniciar un flujo
Cuando la usuaria está en medio de un flujo (ej: registrando un ingreso) y quiere empezar de nuevo, no hay forma de salir.

**Lo que falta:**
- Detectar una palabra clave ("cancelar", "salir", etc.) en `routeMessage` (index.ts) antes de intentar flujos activos
- Limpiar el estado del handler activo (cada handler tiene su propio `Map<string, EstadoConversacion>`)
- Mostrar el menú principal

**Archivos a tocar:** `src/index.ts` + exportar `cancelar(userId)` en cada handler con estado (`income.ts`, `cash.ts`, `balance.ts`, `reembolso.ts`, `reservas.ts`)

---

## 2. Opciones incorrectas en "¿Querés registrar algo más?"
Después de completar un registro, el bot muestra `MENU_BOTONES` con "Nuevo ingreso" — pero no debería aparecer ahí.

**Las opciones correctas deben ser:**
- 📋 Gestionar reservas
- 💸 Nuevo gasto
- 📊 Saldos en cuentas
- 📝 Otros (abre el menú completo)

**Archivos a tocar:**
- `src/types.ts` → actualizar `MENU_BOTONES`
- `src/index.ts` → agregar handler para `menu_otros` (que llama a `sendMenu`)

---

## 3. El número de reserva se pierde visualmente en la lista de saldos pendientes
La lista muestra `*1.*`, `*2.*`, etc. en negrita pero igual no resalta lo suficiente.

**Lo que falta:**
- Reemplazar el número por emoji de número (1️⃣, 2️⃣, 3️⃣…) y poner el nombre/casa en negrita

**Ejemplo actual:**
```
*1.* Casa 4 · Marcos Careglio
   12/06/2026 → 17/06/2026 · saldo USD 696
```

**Ejemplo deseado:**
```
1️⃣ *Casa 4 · Marcos Careglio*
   12/06/2026 → 17/06/2026 · saldo USD 696
```

**Archivo a tocar:** `src/handlers/reservas.ts` → función `formatearListaNumerada` (línea ~109)

---

## 4. "whatsapp_directo" aparece en la columna detalle de ingresos de reservas
Es redundante porque la interacción siempre es por WhatsApp.

**Ejemplos actuales:**
- `Adelanto reserva #TMP-2026-XXXX · whatsapp_directo`
- `Saldo reserva #TMP-2026-XXXX · whatsapp_directo`

**Lo que falta:**
- Eliminar ` · whatsapp_directo` del string de detalle en ambos casos

**Archivos a tocar:**
- `src/handlers/reservas.ts` línea ~374 → `detalle: \`Adelanto reserva #${id}\``
- `src/handlers/reservas.ts` línea ~434 → `detalle: \`Saldo reserva #${d.nroReserva}\``
- `src/__tests__/reservas.test.ts` línea ~173 → actualizar el test que verifica ese string

---

## 5. Crear cuenta Gmail dedicada para Temporalías y migrar Google Drive
Hoy el Google Drive (planillas + comprobantes) está en una cuenta personal. Conviene tener una cuenta propia del negocio.

**Pasos:**
1. Crear cuenta Gmail (ej. `temporalias.admin@gmail.com` o similar)
2. Mover las Google Sheets de ingresos, gastos, saldos, reservas y comisiones a esa cuenta
3. Mover la carpeta de comprobantes en Drive a esa cuenta
4. Actualizar las variables de entorno / credenciales del bot (service account o OAuth) para que apunten al nuevo Drive
5. Verificar que el bot siga escribiendo correctamente en todas las sheets

---

## 6. Ingresos por Airbnb — automatización y cálculo de comisión Paola

### 6a. Automatización del comprobante
Airbnb envía un resumen de pago por mail. Si llega a la cuenta de co-anfitriona, se podría configurar una automatización de Gmail para que reenvíe ese comprobante al bot e inicie el flujo de registro automáticamente.

**Pendiente confirmar primero:** ¿el mail de liquidación de Airbnb llega a la cuenta co-anfitriona o solo al anfitrión principal?

### 6b. Base de cálculo de la comisión del 5% de Paola en reservas Airbnb
Hay ambigüedad sobre si el 5% se aplica:
- **Opción A:** sobre el monto que efectivamente ingresa a la cuenta (monto total menos ~15% de tarifa de servicio de co-anfitrión)
- **Opción B:** sobre el monto total bruto de la reserva

Esto complica el cálculo actual. **Definir con Paola antes de implementar.**

---

## 7. Lista de preguntas a confirmar con Paola

- [ ] **¿Las reservas son siempre en dólares?** Hoy el bot pide el monto de la reserva directamente en USD sin opción de elegir moneda. Confirmar si puede haber reservas en pesos, o si USD es siempre la regla.
- [ ] **Base de cálculo del 5% de comisión en reservas Airbnb** (ver ítem 6b)
- [ ] **Suelen haber reembolsos?** una reserva que se cancelada por fuerza mayor. 

---

## 8. Columnas posiblemente innecesarias en la tabla de Gastos
Revisado el código — resultado por columna:

| Columna | ¿Se usa? | Detalle |
|---|---|---|
| `nroOperacion` | ✅ Sí, no tocar | `buscarGastoDuplicado` la usa para evitar doble registro |
| `bancoOrigen` | Parcialmente | Gastos manuales → siempre `"Efectivo"`. Gastos con comprobante → nombre del banco real |
| `nombreDestinatario` | Casi no | Gastos manuales → siempre `""`. Gastos con comprobante → puede traer dato del OCR |

**Candidatas a ocultar (no eliminar) en la sheet:**
- `nombreDestinatario` — casi siempre vacío o irrelevante para un gasto
- `bancoOrigen` — solo útil si se quiere saber de qué banco salió el pago

**Archivos a tocar si se decide eliminar del modelo:**
- `src/types.ts` → interfaz `Gasto`
- `src/services/sheets.ts` → función `registrarGasto` (~líneas 62-67)
- `src/handlers/cash.ts`, `src/handlers/income.ts`, `src/handlers/gastos.ts` → llamadas a `registrarGasto`

---

## 9. Corrección de registros con trazabilidad

Cuando se confirma un gasto o ingreso con datos erróneos, hoy no hay forma de corregirlo desde el bot.

**Diseño acordado: flujo de aprobación + hoja de auditoría**

1. Quien quiere corregir inicia el flujo desde el bot (ej. "Corregir registro")
2. El bot le envía a Milagros un mensaje de aprobación:
   ```
   ⚠️ Corrección solicitada por Paola
   GAS-2026-0042 · limpieza · $45.000
   Campo: categoría → "mantenimiento"
   [✅ Aprobar]  [❌ Rechazar]
   ```
3. Solo se aplica si Milagros aprueba
4. Al aplicar, se escribe en la hoja `Historial`:
   `timestamp | idRegistro | tipoRegistro | campo | valorAnterior | valorNuevo | modificadoPor | aprobadoPor`

**Qué se puede corregir por bot:** `categoria` y `detalle` únicamente.
**Qué NO:** monto, fecha, quién pagó → esos van directo a la planilla.

**Archivos a crear/modificar:**
- `src/services/sheets.ts` → nueva función `corregirGasto(id, campos, modificadoPor)` + `registrarAudit(...)`
- `src/services/sheets.ts` → nueva hoja `Historial` en setup
- `src/handlers/correccion.ts` → nuevo handler (flujo de solicitud + aprobación)
- `src/index.ts` → rutear botones de aprobación/rechazo

---

## 10. Reporte de últimos registros

Para poder identificar qué registro hay que corregir (o simplemente auditar la actividad reciente), agregar un comando que muestre los últimos N gastos o ingresos.

**Formato propuesto:**
```
📋 Últimos 10 gastos:

1️⃣ GAS-2026-0042 · 12/06/2026
   limpieza · Francisco · $45.000 ARS

2️⃣ GAS-2026-0041 · 11/06/2026
   expensas · Milagros · $32.000 ARS
...
```

**Evaluación técnica:** simple de implementar.
- `sheets.ts` ya lee la hoja Gastos para `buscarGastoDuplicado` — usar la misma lectura, tomar las últimas 10 filas
- Accesible desde el submenú de Saldos o como opción en `menu_otros`
- Se podría extender a "últimos 10 ingresos" también

**Archivos a tocar:**
- `src/services/sheets.ts` → nueva función `obtenerUltimosGastos(n: number)`
- `src/handlers/balance.ts` → o nuevo handler `src/handlers/historial.ts`
- `src/index.ts` → nuevo botón en `menu_saldos` o `menu_otros`

---

## 11. Reserva sin adelanto

Permitir registrar una reserva sin pago inicial, para casos informales (amigos/conocidos) donde el acuerdo es verbal. Definir si se trata como saldo 100% pendiente o con un flag especial.
