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

---

## 8. Columnas innecesarias en la tabla de Gastos
Las columnas `nombreDestinatario`, `bancoOrigen` y `nroOperacion` tienen sentido para ingresos (transferencias con comprobante), pero en gastos siempre quedan vacías o sin valor real.

**Opciones:**
- Ocultarlas en la sheet sin borrarlas (más seguro, no rompe nada)
- Eliminarlas del modelo `Gasto` en `src/types.ts` y del registro en `src/services/sheets.ts`

**Confirmar primero:** si hay algún gasto donde esos campos se usen (ej. reembolsos con comprobante).
