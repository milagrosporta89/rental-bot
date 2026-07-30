# QA Manual – Diseñar plan de pruebas completo

Actuá como QA Lead. Tu tarea es leer el código del proyecto **rental-bot** (bot WhatsApp + web Next.js) y generar un plan de pruebas manual exhaustivo, mapeando la mayor cantidad de casuísticas posible.

---

## Paso 1 – Relevamiento del sistema

Lee estos archivos para entender las superficies testeables:

**Web (Next.js):**
- `src/app/reservas/nueva/page.tsx` — formulario nueva reserva (2 pasos)
- `src/app/reservas/[id]/pago/page.tsx` — asentar/editar pago
- `src/app/reservas/[id]/page.tsx` — detalle de reserva
- `src/app/reservas/page.tsx` — listado de reservas
- `src/app/calendario/page.tsx` — vista calendario
- `src/components/reservas/ReservasTable.tsx` — tabla reservas
- `src/components/reservas/PagosSection.tsx` — sección pagos en detalle
- `src/components/modals/ReservaModal.tsx` — modal editar reserva
- `src/components/modals/BloqueoModal.tsx` — modal bloqueo de fechas
- `src/components/calendario/CalendarView.tsx` — calendario interactivo
- `src/app/actions/reservas.ts` — acciones server-side reservas
- `src/app/actions/ingresos.ts` — acciones server-side ingresos
- `src/lib/types.ts` — tipos compartidos

**Bot WhatsApp:**
- `src/handlers/income.ts` — flujo comprobantes foto/PDF
- `src/handlers/cash.ts` — ingreso/gasto manual
- `src/handlers/balance.ts` — reporte de saldos
- `src/handlers/reservas.ts` — gestión de reservas por chat
- `src/handlers/gastos.ts` — gastos
- `src/handlers/comision.ts` — comisiones
- `src/handlers/correccion.ts` — correcciones
- `src/index.ts` — enrutamiento de mensajes

---

## Paso 2 – Mapear casuísticas por área

Para cada área identificá los casos de prueba cubriendo estas dimensiones:

### Dimensiones a cubrir por flujo
- **Happy path** — el flujo ideal sin fricción
- **Campos obligatorios vacíos** — qué pasa si falta cada campo requerido
- **Valores límite** — cero, negativos, decimales extremos, strings muy largos, fechas pasadas/futuras
- **Orden de pasos** — saltear pasos, volver atrás, recargar la página a mitad
- **Concurrencia/doble submit** — click doble, reenvío del form
- **Recuperación de errores** — qué pasa si falla la API, si hay error de red
- **Estados intermedios** — loading spinners, disabled buttons, transiciones
- **Consistencia de datos** — que lo que se guarda sea lo que se muestra
- **Casos de borde de negocio** — reservas que se solapan, pagos que superan el total, saldo en cero

---

## Paso 3 – Generar el plan

Producí el plan en este formato:

---

## Plan QA Manual – [fecha]

### RESUMEN EJECUTIVO
[2-3 líneas sobre alcance y áreas cubiertas]

---

### ÁREA: [Nombre del área]

#### [Nombre del flujo]

| ID | Caso de prueba | Precondición | Pasos | Resultado esperado | Prioridad |
|----|---------------|--------------|-------|--------------------|-----------|
| WEB-01 | Nueva reserva – tentativa happy path | Sin reservas previas | 1. Ir a /reservas/nueva · 2. Completar todos los campos · 3. Seleccionar "Tentativa" · 4. Click "Guardar reserva" | Redirige a /calendario con la reserva visible | ALTA |
| WEB-02 | Nueva reserva – campo nombre vacío | — | 1. Dejar nombre en blanco · 2. Click "Guardar" | Mensaje de error "El nombre del huésped es obligatorio" | ALTA |

_(continuar para cada caso)_

---

### SECCIÓN: CASOS LÍMITE TRANSVERSALES

Casos que aplican a múltiples flujos:

| ID | Caso | Aplica a | Resultado esperado |
|----|------|----------|--------------------|
| CROSS-01 | Doble click en botón de submit | Todos los forms | Solo se crea 1 registro, botón queda disabled durante la request |
| CROSS-02 | Pérdida de conexión durante submit | Todos los forms | Mensaje de error, datos no se pierden del form |

---

### SECCIÓN: BOT WHATSAPP

| ID | Caso de prueba | Input del usuario | Respuesta esperada | Prioridad |
|----|---------------|-------------------|--------------------|-----------|
| BOT-01 | Registrar ingreso – foto comprobante válida | Envía foto de transferencia bancaria | Extrae datos y confirma registro | ALTA |

---

### RESUMEN DE COBERTURA

| Área | Casos totales | ALTA | MEDIA | BAJA |
|------|--------------|------|-------|------|
| Nueva reserva (web) | N | N | N | N |
| Asentar pago (web) | N | N | N | N |
| Detalle reserva (web) | N | N | N | N |
| Calendario (web) | N | N | N | N |
| Bot – comprobantes | N | N | N | N |
| Bot – saldos | N | N | N | N |
| Casos transversales | N | N | N | N |
| **TOTAL** | **N** | **N** | **N** | **N** |

---

## Instrucciones de formato

- Los IDs deben ser únicos y predecibles: `WEB-01`, `WEB-02`, `BOT-01`, `CROSS-01`, etc.
- Prioridad: **ALTA** = flujo core / pérdida de datos · **MEDIA** = UX degradada · **BAJA** = edge case cosmético.
- Los pasos deben ser ejecutables por alguien que no conoce el código (sin jerga técnica).
- Si encontrás un caso que ya es claramente un bug existente, marcalo con `[BUG?]` en el nombre.
- Ordenar cada área de mayor a menor prioridad.

---

## Al terminar

Decí:
> "Plan QA listo — N casos mapeados (N ALTA, N MEDIA, N BAJA). Podés pedirme que lo exporte a CSV, que priorice los ALTA solamente, o que genere casos de regresión para una funcionalidad específica."
