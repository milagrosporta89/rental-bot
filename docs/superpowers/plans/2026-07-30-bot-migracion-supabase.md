# Migración del bot de WhatsApp a Supabase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El bot de WhatsApp (repo `rental-bot-whatsapp`) deja Google Sheets del todo. Queda con 3 acciones — Nuevo gasto, Registrar ingreso (siempre atado a una reserva existente), Ver saldo — que llaman por HTTP a endpoints nuevos en la web (repo `rental-bot`), reusando su lógica de negocio en vez de reimplementarla.

**Architecture:** Dos repos, dos frentes de trabajo. Primero se construyen los 6 endpoints nuevos en la web (`src/app/api/bot/*`), cada uno verificable de forma independiente con `curl`. Recién después se reescribe el lado del bot para consumirlos. El bot nunca toca Supabase directo.

**Tech Stack:** Web: Next.js/TypeScript/Supabase (sin dependencias nuevas). Bot: Node/TypeScript/Express, cliente HTTP con `axios` (ya instalado) — sin agregar `@supabase/supabase-js` ni ninguna librería de Supabase al bot.

## Global Constraints

- Repos: web = `c:/Users/Administrador/Milagros/rental-bot` (rama `master`), bot = `c:/Users/Administrador/Milagros/rental-bot-whatsapp` (rama `master`). Cada uno con su propio historial — los commits de este plan se hacen por separado en cada repo, nunca mezclados.
- Nueva env var **`BOT_API_SECRET`**: mismo valor literal en ambos repos (`.env` local en cada uno). El bot la manda como `Authorization: Bearer <valor>` en cada request; la web la valida antes de procesar cualquier cosa bajo `/api/bot/*`.
- Nueva env var en el bot: **`BOT_API_BASE_URL`** (ej. `http://localhost:3000` en dev, la URL real de producción de la web después) — base de las llamadas del cliente HTTP nuevo.
- **Titulares válidos** (usados en varios puntos: mapeo teléfono→titular del bot, validación server-side en la web, universo de "Ver saldo"): `Francisco`, `Milagros`, `Inés`, `Fernando`, `Paola` — mismo set que ya usan `NOMBRES_TITULARES` (bot) y `DESTINATARIOS` (web, `pago/page.tsx:17`). El universo de "Ver saldo" es un subconjunto de 4 (sin Paola, que tiene su propio sistema de comisión aparte) — ver Task 8.
- Nunca imprimir en la terminal ni en ningún commit el contenido de archivos `.env*` ni de `BOT_API_SECRET`.
- No se toca la tabla `historial` ni ninguna lógica de auditoría — el alcance de este plan es solo creación (gasto, ingreso), no edición.
- Spec de referencia: `docs/superpowers/specs/2026-07-30-bot-migracion-supabase-design.md` (vive en el repo web) — cualquier duda sobre alcance o qué-va-dónde se resuelve ahí.

---

# Frente 1 — Web (`rental-bot`)

### Task 1: Auth compartida bot↔web + bypass de middleware

**Files:**
- Create: `src/lib/bot-auth.ts`
- Modify: `src/lib/supabase/middleware.ts`
- Test: no hay test runner en este repo (confirmado: `package.json` no tiene script `test`) — verificación manual con `curl`, no se agrega un framework de testing nuevo solo para esto (fuera de alcance, YAGNI).

**Interfaces:**
- Produce: `validarAuthBot(req: NextRequest): boolean` — usada por las Tasks 3-7.

- [ ] **Step 1: Crear el helper de auth**

```typescript
// src/lib/bot-auth.ts
import type { NextRequest } from 'next/server'

/** Valida el header Authorization: Bearer <BOT_API_SECRET> que manda el bot en cada request a /api/bot/*. */
export function validarAuthBot(req: NextRequest): boolean {
  const header = req.headers.get('authorization') ?? ''
  const esperado = `Bearer ${process.env.BOT_API_SECRET}`
  return Boolean(process.env.BOT_API_SECRET) && header === esperado
}

export const TITULARES_VALIDOS = ['Francisco', 'Milagros', 'Inés', 'Fernando', 'Paola'] as const
export type TitularValido = typeof TITULARES_VALIDOS[number]

export function esTitularValido(valor: string): valor is TitularValido {
  return (TITULARES_VALIDOS as readonly string[]).includes(valor)
}
```

- [ ] **Step 2: Agregar `/api/bot` a las rutas públicas del middleware**

Editar `src/lib/supabase/middleware.ts` — la línea 28 hoy es:
```typescript
  const rutasPublicas = ['/login', '/forgot-password', '/reset-password']
```
Reemplazar por:
```typescript
  const rutasPublicas = ['/login', '/forgot-password', '/reset-password', '/api/bot']
```
(Nada más cambia en ese archivo — el resto de la lógica de sesión sigue igual para todo lo que no sea `/api/bot/*`.)

- [ ] **Step 3: Verificar con `curl` que el bypass funciona**

Con el dev server corriendo (`npm run dev`, puerto 3000 o el que asigne):
```bash
curl -i http://localhost:3000/api/bot/no-existe
```
Expected: `404` (Next.js, porque la ruta no existe todavía) — **no** un `307` a `/login`. Si da `307`, el bypass del middleware no está funcionando, revisar el Step 2 antes de seguir.

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/Administrador/Milagros/rental-bot"
git add src/lib/bot-auth.ts src/lib/supabase/middleware.ts
git commit -m "feat: agregar auth compartida bot-web y bypass de middleware para /api/bot

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `crearGasto` y `registrarPago` aceptan `registrado_por` override

**Files:**
- Modify: `src/app/actions/gastos.ts:43,68` (función `crearGasto`)
- Modify: `src/app/actions/ingresos.ts:71,75` (función `registrarPago`)

**Interfaces:**
- Consume: nada nuevo.
- Produce: `crearGasto(payload: GastoPayload, registradoPorOverride?: string): Promise<void>` y `registrarPago(reservaId: string, payload: IngresoPayload, registradoPorOverride?: string): Promise<void>` — firmas que consume la Task 4 y la Task 5.

- [ ] **Step 1: Modificar `crearGasto`**

En `src/app/actions/gastos.ts`, cambiar la firma de la línea 43 de:
```typescript
export async function crearGasto(payload: GastoPayload): Promise<void> {
```
a:
```typescript
export async function crearGasto(payload: GastoPayload, registradoPorOverride?: string): Promise<void> {
```
Y la línea 68, de:
```typescript
  const registrado_por = await registradoPorActual()
```
a:
```typescript
  const registrado_por = registradoPorOverride ?? await registradoPorActual()
```

- [ ] **Step 2: Modificar `registrarPago`**

En `src/app/actions/ingresos.ts`, cambiar la firma de las líneas 71-74 de:
```typescript
export async function registrarPago(
  reservaId: string,
  payload: IngresoPayload
): Promise<void> {
```
a:
```typescript
export async function registrarPago(
  reservaId: string,
  payload: IngresoPayload,
  registradoPorOverride?: string
): Promise<void> {
```
Y la línea 75, de:
```typescript
  const registrado_por = await registradoPorActual()
```
a:
```typescript
  const registrado_por = registradoPorOverride ?? await registradoPorActual()
```

- [ ] **Step 3: Verificar que la web sigue andando igual**

```bash
cd "c:/Users/Administrador/Milagros/rental-bot"
npx tsc --noEmit
```
Expected: sin errores. Estos dos cambios son 100% compatibles hacia atrás (parámetro opcional al final) — ningún caller existente (la UI web) pasa el segundo argumento, así que siguen usando `registradoPorActual()` exactamente igual que antes. No hace falta ninguna prueba manual en el navegador para este task puntual (sin cambio de comportamiento observable desde la UI), pero si querés confirmarlo: abrir `/gastos/nuevo` o "Asentar pago" y guardar algo de prueba, verificar que `registrado_por` en la fila nueva sigue siendo tu usuario logueado.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/gastos.ts src/app/actions/ingresos.ts
git commit -m "feat: crearGasto y registrarPago aceptan registrado_por opcional

Preparación para que /api/bot/* pueda pisar el 'quién' con el titular
resuelto por teléfono del bot, sin afectar la UI web (que sigue usando
la sesión de Supabase Auth como siempre).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Endpoint de comprobante para el bot (OCR + subida reusada)

**Files:**
- Create: `src/lib/comprobante.ts`
- Modify: `src/app/api/comprobante/route.ts` (usar el helper nuevo, sin cambiar su comportamiento)
- Create: `src/app/api/bot/comprobante/route.ts`

**Interfaces:**
- Produce: `extraerYSubirComprobante(file: File, tipo: 'gasto' | 'ingreso'): Promise<{ datos: DatosComprobanteOCR; url: string }>` — usada por ambas rutas.
- `DatosComprobanteOCR = { fecha, monto, moneda, nombreOrdenante, nombreDestinatario, bancoOrigen, bancoDestino, cbuDestino, nroOperacion }` (todos `string` salvo `monto: number`).

- [ ] **Step 1: Extraer la lógica compartida**

Crear `src/lib/comprobante.ts` con el contenido de `src/app/api/comprobante/route.ts` actual (líneas 1-41 y 59-90), sin el manejo de `NextRequest`/`FormData` (eso se queda en cada route.ts):

```typescript
// src/lib/comprobante.ts
import { createAdminClient } from '@/lib/supabase/admin'

const PROMPT = `Sos un asistente que extrae datos de comprobantes de transferencia bancaria argentinos.
Analizá el documento y extraé los siguientes datos en formato JSON exacto, sin texto adicional:
{
  "fecha": "DD/MM/YYYY",
  "monto": número sin puntos ni comas (ej: 85000),
  "moneda": "ARS" o "USD" según el símbolo o indicación en el comprobante. Si no hay indicación, usá "ARS",
  "nombreOrdenante": "nombre de quien hace la transferencia",
  "nombreDestinatario": "nombre de quien recibe la transferencia",
  "bancoOrigen": "banco desde donde se transfiere",
  "bancoDestino": "banco que recibe",
  "cbuDestino": "CBU o CVU destino, si aparece",
  "nroOperacion": "número de operación o transacción, si aparece"
}
Si algún dato no está visible, usá string vacío o 0 para monto.
Respondé SOLO con el JSON, sin markdown, sin explicaciones.`

export type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'

export interface DatosComprobanteOCR {
  fecha: string
  monto: number
  moneda: string
  nombreOrdenante: string
  nombreDestinatario: string
  bancoOrigen: string
  bancoDestino: string
  cbuDestino: string
  nroOperacion: string
}

async function subirComprobante(base64: string, mediaType: MediaType, nombreArchivo: string): Promise<string> {
  const ahora = new Date()
  const mesAnio = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
  const ext = mediaType === 'application/pdf' ? 'pdf' : mediaType.split('/')[1]
  const rutaArchivo = `${mesAnio}/${nombreArchivo}.${ext}`

  const supabase = createAdminClient()
  const { error } = await supabase.storage
    .from('comprobantes')
    .upload(rutaArchivo, Buffer.from(base64, 'base64'), { contentType: mediaType, upsert: true })
  if (error) throw error

  return supabase.storage.from('comprobantes').getPublicUrl(rutaArchivo).data.publicUrl
}

/** OCR (Claude Vision) + subida a Supabase Storage. Usado tanto por /api/comprobante (web) como /api/bot/comprobante (bot). */
export async function extraerYSubirComprobante(
  base64: string,
  mediaType: MediaType,
  tipo: 'gasto' | 'ingreso'
): Promise<{ datos: DatosComprobanteOCR; url: string }> {
  const archivoBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }

  let datos: DatosComprobanteOCR
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: [archivoBlock, { type: 'text', text: PROMPT }] }],
      }),
    })
    const data = await res.json() as { content: Array<{ type: string; text: string }> }
    const raw = data.content[0]?.text?.trim() ?? ''
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    datos = JSON.parse(jsonStr)
  } catch {
    throw new Error('No se pudo leer el comprobante')
  }

  if (!datos || datos.monto === 0) {
    throw new Error('Comprobante ilegible o sin monto')
  }

  const fechaStr = (datos.fecha ?? '').replace(/\//g, '-') || String(Date.now())
  const nroOperacion = String(datos.nroOperacion || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_')
  const nombre = `${tipo}_${fechaStr}_${nroOperacion}`
  const url = await subirComprobante(base64, mediaType, nombre).catch(() => '')

  return { datos, url }
}
```

- [ ] **Step 2: Reescribir `/api/comprobante/route.ts` para usar el helper**

Reemplazar el contenido completo de `src/app/api/comprobante/route.ts` por:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { extraerYSubirComprobante, type MediaType } from '@/lib/comprobante'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const tipo = (form.get('tipo') as string) === 'gasto' ? 'gasto' : 'ingreso'
  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mediaType = file.type as MediaType

  try {
    const { datos, url } = await extraerYSubirComprobante(base64, mediaType, tipo)
    return NextResponse.json({ datos, url })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 422 })
  }
}
```

(Mismo comportamiento observable que antes — mismo prompt, mismo bucket, misma respuesta `{ datos, url }` en éxito, `422` en error. Solo cambia dónde vive la lógica.)

- [ ] **Step 3: Nuevo endpoint para el bot**

```typescript
// src/app/api/bot/comprobante/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { validarAuthBot } from '@/lib/bot-auth'
import { extraerYSubirComprobante, type MediaType } from '@/lib/comprobante'

export async function POST(req: NextRequest) {
  if (!validarAuthBot(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const tipo = (form.get('tipo') as string) === 'gasto' ? 'gasto' : 'ingreso'
  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mediaType = file.type as MediaType

  try {
    const { datos, url } = await extraerYSubirComprobante(base64, mediaType, tipo)
    return NextResponse.json({ datos, url })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 422 })
  }
}
```

- [ ] **Step 4: Verificar con `curl`**

```bash
cd "c:/Users/Administrador/Milagros/rental-bot" && npm run dev &
sleep 3
curl -i -X POST http://localhost:3000/api/bot/comprobante
# Expected: 401 (sin Authorization)
curl -i -X POST http://localhost:3000/api/bot/comprobante -H "Authorization: Bearer $BOT_API_SECRET"
# Expected: 400 "No file" (con auth correcta, sin archivo adjunto)
```
Para probar el caso feliz hace falta un archivo de comprobante real de prueba — no crear uno sintético falso para esto (dato financiero, aunque sea de prueba conviene usar algo real de una carpeta de `comprobantes/` existente). Si no hay uno a mano ahora, dejar esta verificación puntual para cuando se pruebe el flujo end-to-end del bot (Task 9).

- [ ] **Step 5: Commit**

```bash
git add src/lib/comprobante.ts src/app/api/comprobante/route.ts src/app/api/bot/comprobante/route.ts
git commit -m "feat: extraer lógica de OCR+upload de comprobante a lib compartida, agregar endpoint para el bot

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `POST /api/bot/gastos`

**Files:**
- Create: `src/app/api/bot/gastos/route.ts`

**Interfaces:**
- Consume: `crearGasto` (Task 2), `validarAuthBot`/`esTitularValido` (Task 1).

- [ ] **Step 1: Escribir el endpoint**

```typescript
// src/app/api/bot/gastos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { validarAuthBot, esTitularValido } from '@/lib/bot-auth'
import { crearGasto, type GastoPayload } from '@/app/actions/gastos'

export async function POST(req: NextRequest) {
  if (!validarAuthBot(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as GastoPayload & { registrado_por: string }
  if (!esTitularValido(body.registrado_por)) {
    return NextResponse.json({ error: `registrado_por inválido: ${body.registrado_por}` }, { status: 400 })
  }

  const { registrado_por, ...payload } = body
  try {
    await crearGasto(payload, registrado_por)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al crear el gasto'
    const esDuplicado = msg.includes('ya fue registrado') || msg.includes('ya existe un gasto')
    return NextResponse.json({ error: msg }, { status: esDuplicado ? 409 : 400 })
  }
}
```

- [ ] **Step 2: Verificar con `curl`**

```bash
curl -i -X POST http://localhost:3000/api/bot/gastos -H "Authorization: Bearer $BOT_API_SECRET" -H "Content-Type: application/json" -d '{}'
# Expected: 400 (registrado_por undefined, falla esTitularValido)

curl -i -X POST http://localhost:3000/api/bot/gastos \
  -H "Authorization: Bearer $BOT_API_SECRET" -H "Content-Type: application/json" \
  -d '{"registrado_por":"Milagros","fecha":"01/07/2026","monto":100,"moneda":"ARS","categoria":"otro","pagado_por":"Milagros","nombre_destinatario":null,"banco_origen":null,"nro_operacion":null,"detalle":"prueba curl","comprobante_url":null,"id_reserva":null}'
# Expected: 200 {"ok":true} — CONFIRMAR EN SUPABASE (tabla gastos) que la fila quedó con registrado_por="Milagros"
# y borrar esta fila de prueba después de confirmar (es un dato de prueba real en la tabla).
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/bot/gastos/route.ts
git commit -m "feat: agregar POST /api/bot/gastos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `POST /api/bot/ingresos` y `GET /api/bot/cotizacion`

**Files:**
- Create: `src/app/api/bot/ingresos/route.ts`
- Create: `src/app/api/bot/cotizacion/route.ts`

**Interfaces:**
- Consume: `registrarPago` (Task 2), `obtenerCotizacionCompraVenta` (`src/lib/cotizacion.ts`, ya existe).

- [ ] **Step 1: Endpoint de cotización**

```typescript
// src/app/api/bot/cotizacion/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { validarAuthBot } from '@/lib/bot-auth'
import { obtenerCotizacionCompraVenta } from '@/lib/cotizacion'

export async function GET(req: NextRequest) {
  if (!validarAuthBot(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const fecha = req.nextUrl.searchParams.get('fecha')
  const { compra, venta } = await obtenerCotizacionCompraVenta(fecha ?? undefined)
  return NextResponse.json({ compra, venta })
}
```

- [ ] **Step 2: Endpoint de ingresos**

```typescript
// src/app/api/bot/ingresos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { validarAuthBot, esTitularValido } from '@/lib/bot-auth'
import { registrarPago, type IngresoPayload } from '@/app/actions/ingresos'

export async function POST(req: NextRequest) {
  if (!validarAuthBot(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as IngresoPayload & { registrado_por: string }
  if (!esTitularValido(body.registrado_por)) {
    return NextResponse.json({ error: `registrado_por inválido: ${body.registrado_por}` }, { status: 400 })
  }
  if (!body.id_reserva) {
    return NextResponse.json({ error: 'id_reserva es obligatorio' }, { status: 400 })
  }

  const { registrado_por, id_reserva, ...payload } = body
  try {
    await registrarPago(id_reserva, { ...payload, id_reserva }, registrado_por)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al registrar el ingreso'
    const esDuplicado = msg.includes('ya fue registrado')
    return NextResponse.json({ error: msg }, { status: esDuplicado ? 409 : 400 })
  }
}
```

- [ ] **Step 3: Verificar con `curl`**

```bash
curl -i http://localhost:3000/api/bot/cotizacion -H "Authorization: Bearer $BOT_API_SECRET"
# Expected: 200 {"compra":..., "venta":...} (valores reales de bluelytics)

curl -i -X POST http://localhost:3000/api/bot/ingresos -H "Authorization: Bearer $BOT_API_SECRET" -H "Content-Type: application/json" -d '{"registrado_por":"Milagros"}'
# Expected: 400 "id_reserva es obligatorio"
```
Probar el caso feliz completo (con un `id_reserva` real de una reserva de prueba existente, no una real con huéspedes) se deja para la verificación end-to-end del bot (Task 10) — requiere tener a mano un id de reserva válido y confirmar después en Supabase que `saldo_usd`/`estado_pago` se recalcularon bien.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/bot/ingresos/route.ts src/app/api/bot/cotizacion/route.ts
git commit -m "feat: agregar POST /api/bot/ingresos y GET /api/bot/cotizacion

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `GET /api/bot/reservas`

**Files:**
- Create: `src/app/api/bot/reservas/route.ts`

- [ ] **Step 1: Escribir el endpoint**

```typescript
// src/app/api/bot/reservas/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { validarAuthBot } from '@/lib/bot-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  if (!validarAuthBot(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const buscar = req.nextUrl.searchParams.get('buscar')
  const pendientes = req.nextUrl.searchParams.get('pendientes')

  const supabase = createAdminClient()
  let query = supabase
    .from('reservas')
    .select('id, nombre_pax, casa, fecha_entrada, fecha_salida, saldo_usd, estado_pago')
    .neq('estado_reserva', 'cancelada')

  if (pendientes) {
    query = query.neq('estado_pago', 'pagado')
  }
  if (buscar) {
    query = query.or(`nombre_pax.ilike.%${buscar}%,id.eq.${buscar}`)
  }

  const { data, error } = await query.order('fecha_entrada', { ascending: false }).limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reservas: data ?? [] })
}
```

- [ ] **Step 2: Verificar con `curl`**

```bash
curl -i "http://localhost:3000/api/bot/reservas?pendientes=1" -H "Authorization: Bearer $BOT_API_SECRET"
# Expected: 200 {"reservas": [...]} — comparar contra lo que se ve en /reservas de la web con
# el filtro "no pagado" para confirmar que la lista coincide.
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/bot/reservas/route.ts
git commit -m "feat: agregar GET /api/bot/reservas (lectura, para que el bot busque/liste reservas)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `GET /api/bot/saldos`

**Files:**
- Create: `src/app/api/bot/saldos/route.ts`

- [ ] **Step 1: Escribir el endpoint**

Lógica nueva (no existe equivalente hoy en la web): para cada titular del universo `Francisco, Milagros, Inés, Fernando`, `saldo = Σ ingresos.monto_usd (vía reservas.titular) − Σ gastos.monto_usd (vía gastos.pagado_por)`, sin filtro de fecha (todo el historial, mismo criterio que el cálculo actual del bot).

```typescript
// src/app/api/bot/saldos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { validarAuthBot } from '@/lib/bot-auth'
import { createAdminClient } from '@/lib/supabase/admin'

const TITULARES_SALDO = ['Francisco', 'Milagros', 'Inés', 'Fernando'] as const

export async function GET(req: NextRequest) {
  if (!validarAuthBot(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()
  const [{ data: reservas, error: re }, { data: ingresos, error: ie }, { data: gastos, error: ge }] = await Promise.all([
    supabase.from('reservas').select('id, titular'),
    supabase.from('ingresos').select('id_reserva, monto_usd'),
    supabase.from('gastos').select('pagado_por, monto_usd'),
  ])
  if (re) return NextResponse.json({ error: re.message }, { status: 500 })
  if (ie) return NextResponse.json({ error: ie.message }, { status: 500 })
  if (ge) return NextResponse.json({ error: ge.message }, { status: 500 })

  const titularPorReserva = new Map((reservas ?? []).map(r => [r.id, r.titular]))

  const saldos = TITULARES_SALDO.map(titular => {
    const totalIngresos = (ingresos ?? [])
      .filter(i => i.id_reserva && titularPorReserva.get(i.id_reserva) === titular)
      .reduce((s, i) => s + (i.monto_usd ?? 0), 0)
    const totalGastos = (gastos ?? [])
      .filter(g => g.pagado_por === titular)
      .reduce((s, g) => s + (g.monto_usd ?? 0), 0)
    return { titular, saldo_usd: totalIngresos - totalGastos }
  })

  return NextResponse.json({ saldos })
}
```

- [ ] **Step 2: Verificar con `curl` y a mano**

```bash
curl -i http://localhost:3000/api/bot/saldos -H "Authorization: Bearer $BOT_API_SECRET"
```
Expected: `200 { "saldos": [{"titular":"Francisco","saldo_usd":...}, ...] }` (4 titulares). **Antes de confiar en los números**: elegir uno de los 4 titulares y verificar a mano contra Supabase (sumar `monto_usd` de `ingresos` de sus reservas, restar `monto_usd` de sus `gastos`) que el resultado coincide — memoria del proyecto marca esto como zona sensible ("Confirmar fórmulas financieras").

- [ ] **Step 3: Commit**

```bash
git add src/app/api/bot/saldos/route.ts
git commit -m "feat: agregar GET /api/bot/saldos (cálculo por titular, portado del bot)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Frente 2 — Bot (`rental-bot-whatsapp`)

### Task 8: Cliente HTTP (`src/services/api.ts`) + mapeo teléfono→titular

**Files:**
- Create: `src/services/api.ts`
- Test: `src/__tests__/api.test.ts`
- Modify: `src/config.ts` (mapeo teléfono→titular, nuevas env vars)

**Interfaces:**
- Produce: `crearGasto`, `registrarPago`, `buscarReservas`, `obtenerCotizacion`, `obtenerSaldos`, `subirComprobante` — consumidas por las Tasks 9-11.

- [ ] **Step 1: Agregar el mapeo teléfono→titular a `config.ts`**

Agregar al final de `src/config.ts` (después de `titularDeCasa`):

```typescript
// Mapeo número de WhatsApp (E.164 sin "+", igual formato que WHATSAPP_TEAM_NUMBERS) → titular real.
// Se completa a mano con los números de cada titular — sin esto, el bot no puede resolver
// "quién registró" para mandarlo a la web (ver spec 2026-07-30-bot-migracion-supabase-design.md).
const TELEFONO_TITULAR: Record<string, Titular> = Object.fromEntries(
  (process.env.TELEFONOS_TITULARES ?? '')
    .split(',')
    .map((par) => par.trim().split(':'))
    .filter((par): par is [string, Titular] => par.length === 2 && par[0] !== '')
);

export function titularDeTelefono(telefono: string): Titular | null {
  return TELEFONO_TITULAR[telefono] ?? null;
}
```

Formato de `TELEFONOS_TITULARES` en `.env`: `5491111111111:Milagros,5492222222222:Fernando,...` (agregar a la sección de env vars, junto a `WHATSAPP_TEAM_NUMBERS`).

- [ ] **Step 2: Escribir el test del cliente HTTP (falla primero)**

```typescript
// src/__tests__/api.test.ts
import axios from 'axios';
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

process.env.BOT_API_BASE_URL = 'http://test.local';
process.env.BOT_API_SECRET = 'secreto-de-test';

import { crearGasto, obtenerCotizacion, buscarReservas } from '../services/api';

describe('services/api', () => {
  beforeEach(() => jest.clearAllMocks());

  it('crearGasto manda el payload y el header de auth correctos', async () => {
    mockedAxios.post.mockResolvedValue({ data: { ok: true } });
    await crearGasto({
      registrado_por: 'Milagros', fecha: '01/07/2026', monto: 100, moneda: 'ARS',
      categoria: 'otro', pagado_por: 'Milagros', nombre_destinatario: null,
      banco_origen: null, nro_operacion: null, detalle: null, comprobante_url: null, id_reserva: null,
    });
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://test.local/api/bot/gastos',
      expect.objectContaining({ registrado_por: 'Milagros', monto: 100 }),
      expect.objectContaining({ headers: { Authorization: 'Bearer secreto-de-test' } })
    );
  });

  it('crearGasto traduce un 409 a un mensaje de duplicado legible', async () => {
    mockedAxios.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { error: 'El número de operación 123 ya fue registrado.' } },
    });
    mockedAxios.isAxiosError = jest.fn().mockReturnValue(true) as unknown as typeof axios.isAxiosError;
    await expect(crearGasto({
      registrado_por: 'Milagros', fecha: '01/07/2026', monto: 100, moneda: 'ARS',
      categoria: 'otro', pagado_por: 'Milagros', nombre_destinatario: null,
      banco_origen: null, nro_operacion: '123', detalle: null, comprobante_url: null, id_reserva: null,
    })).rejects.toThrow('El número de operación 123 ya fue registrado.');
  });

  it('obtenerCotizacion devuelve compra y venta', async () => {
    mockedAxios.get.mockResolvedValue({ data: { compra: 1000, venta: 1050 } });
    const r = await obtenerCotizacion('01/07/2026');
    expect(r).toEqual({ compra: 1000, venta: 1050 });
  });

  it('buscarReservas manda el query param correcto', async () => {
    mockedAxios.get.mockResolvedValue({ data: { reservas: [] } });
    await buscarReservas({ buscar: 'Juan' });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('buscar=Juan'),
      expect.anything()
    );
  });
});
```

- [ ] **Step 2b: Correr el test y verificar que falla**

```bash
cd "c:/Users/Administrador/Milagros/rental-bot-whatsapp"
npx jest api.test.ts
```
Expected: FAIL — `Cannot find module '../services/api'` (el archivo todavía no existe).

- [ ] **Step 3: Implementar `src/services/api.ts`**

```typescript
// src/services/api.ts
import axios from "axios";
import { config } from "../config";
import type { GastoPayload, IngresoPayload } from "./api-types";

const HEADERS = { Authorization: `Bearer ${config.botApiSecret}` };

function traducirError(e: unknown, defecto: string): Error {
  if (axios.isAxiosError(e) && e.response) {
    const msg = (e.response.data as { error?: string })?.error;
    if (msg) return new Error(msg);
  }
  return new Error(defecto);
}

export async function crearGasto(payload: GastoPayload & { registrado_por: string }): Promise<void> {
  try {
    await axios.post(`${config.botApiBaseUrl}/api/bot/gastos`, payload, { headers: HEADERS });
  } catch (e) {
    throw traducirError(e, "No se pudo registrar el gasto.");
  }
}

export async function registrarIngreso(payload: IngresoPayload & { registrado_por: string }): Promise<void> {
  try {
    await axios.post(`${config.botApiBaseUrl}/api/bot/ingresos`, payload, { headers: HEADERS });
  } catch (e) {
    throw traducirError(e, "No se pudo registrar el ingreso.");
  }
}

export async function obtenerCotizacion(fecha?: string): Promise<{ compra: number; venta: number }> {
  const params = fecha ? { fecha } : {};
  const res = await axios.get<{ compra: number; venta: number }>(`${config.botApiBaseUrl}/api/bot/cotizacion`, { headers: HEADERS, params });
  return res.data;
}

export interface ReservaResumen {
  id: string;
  nombre_pax: string;
  casa: string;
  fecha_entrada: string;
  fecha_salida: string;
  saldo_usd: number;
  estado_pago: string;
}

export async function buscarReservas(opts: { buscar?: string; pendientes?: boolean }): Promise<ReservaResumen[]> {
  const params: Record<string, string> = {};
  if (opts.buscar) params.buscar = opts.buscar;
  if (opts.pendientes) params.pendientes = "1";
  const res = await axios.get<{ reservas: ReservaResumen[] }>(`${config.botApiBaseUrl}/api/bot/reservas`, { headers: HEADERS, params });
  return res.data.reservas;
}

export interface SaldoTitular { titular: string; saldo_usd: number }

export async function obtenerSaldos(): Promise<SaldoTitular[]> {
  const res = await axios.get<{ saldos: SaldoTitular[] }>(`${config.botApiBaseUrl}/api/bot/saldos`, { headers: HEADERS });
  return res.data.saldos;
}

export interface DatosComprobanteOCR {
  fecha: string; monto: number; moneda: string;
  nombreOrdenante: string; nombreDestinatario: string;
  bancoOrigen: string; bancoDestino: string; cbuDestino: string; nroOperacion: string;
}

export async function subirComprobante(
  base64: string,
  mimeType: string,
  tipo: "gasto" | "ingreso"
): Promise<{ datos: DatosComprobanteOCR; url: string }> {
  const form = new FormData();
  form.append("file", new Blob([Buffer.from(base64, "base64")], { type: mimeType }));
  form.append("tipo", tipo);
  const res = await axios.post<{ datos: DatosComprobanteOCR; url: string }>(
    `${config.botApiBaseUrl}/api/bot/comprobante`,
    form,
    { headers: HEADERS }
  );
  return res.data;
}
```

Crear también `src/services/api-types.ts` (tipos compartidos del payload, para no importar los `app/actions/*` de la web que no existen en este repo):

```typescript
// src/services/api-types.ts
export interface GastoPayload {
  fecha: string; monto: number; moneda: "ARS" | "USD"; categoria: string;
  pagado_por: string; nombre_destinatario: string | null; banco_origen: string | null;
  nro_operacion: string | null; detalle: string | null; comprobante_url: string | null;
  id_reserva: string | null;
}

export interface IngresoPayload {
  id_reserva: string; casa: string; fecha: string; monto: number; moneda: "ARS" | "USD";
  cotizacion: number; monto_ars: number; monto_usd: number; tipo_movimiento: "adelanto" | "saldo";
  quien_pago: string; nombre_destinatario: string | null; banco_destino: string | null;
  nro_operacion: string | null; detalle: string | null; comprobante_url: string | null;
}
```

- [ ] **Step 4: Agregar las env vars a `config.ts`**

En el objeto `config` de `src/config.ts`, agregar:
```typescript
  botApiBaseUrl: process.env.BOT_API_BASE_URL ?? "http://localhost:3000",
  botApiSecret: process.env.BOT_API_SECRET ?? "",
```

- [ ] **Step 5: Correr el test — debe pasar**

```bash
npx jest api.test.ts
```
Expected: `PASS`, 4/4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/services/api.ts src/services/api-types.ts src/__tests__/api.test.ts src/config.ts
git commit -m "feat: cliente HTTP hacia la API de la web + mapeo teléfono→titular

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Migrar el flujo de gasto (`src/handlers/gastos.ts`)

**Files:**
- Modify: `src/handlers/gastos.ts` (funciones `onPhoto` y `guardarGasto`)

**Interfaces:**
- Consume: `api.subirComprobante`, `api.crearGasto` (Task 8), `config.titularDeTelefono` (Task 8).

- [ ] **Step 1: Reemplazar los imports**

Cambiar:
```typescript
import { registrarGasto } from "../services/sheets";
import { obtenerCotizacion } from "../services/dolar";
import { procesarComprobante } from "../services/comprobantes";
```
por:
```typescript
import * as api from "../services/api";
```
(dejar el resto de los imports igual: `utils`, `./common`, `../types`, `../config`).

- [ ] **Step 2: Reescribir `onPhoto`**

Reemplazar el cuerpo completo de `onPhoto` (usa `procesarComprobante`, que hacía OCR local + chequeo de duplicado) por una versión que llama a la web para el OCR/subida (el chequeo de duplicado ahora ocurre recién al guardar, en `crearGasto` — ver nota más abajo):

```typescript
export async function onPhoto(
  ctx: WaCtx,
  mediaId: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"
): Promise<void> {
  await ctx.reply("Procesando el comprobante...");

  let base64: string;
  try {
    ({ base64 } = await downloadMedia(mediaId));
  } catch {
    await ctx.reply("No pude descargar la imagen. ¿Podés reenviarla?");
    return;
  }

  let datos, comprobanteUrl: string;
  try {
    ({ datos, url: comprobanteUrl } = await api.subirComprobante(base64, mimeType, "gasto"));
  } catch {
    await ctx.reply("No pude leer el comprobante. ¿Podés reenviar una versión más nítida?");
    return;
  }

  estados.set(ctx.from.id, { paso: "confirmar_datos", tipo: "comprobante", datos: { ...datos, comprobanteUrl } });

  const titularOrd = detectarTitular(datos.nombreOrdenante ?? "");
  const sugerencia = titularOrd ? `\n\n🔍 Detecté: gasto de ${titularOrd}` : "";

  await ctx.replyButtons(formatearResumenComprobante(datos) + sugerencia, [
    { id: "gasto_confirmar", title: "✅ Confirmar" },
    { id: "gasto_corregir",  title: "✏️ Corregir" },
  ]);
}
```
Agregar el import de `downloadMedia`: `import { downloadMedia } from "../services/whatsapp";`.

**Nota de comportamiento (aceptada, documentada en el spec):** antes, un comprobante duplicado se detectaba apenas se subía la foto. Ahora se detecta recién al confirmar y guardar (paso final), porque el duplicado lo valida `crearGasto` en la web, no el OCR. Es un cambio de UX menor, no un bug — si en el uso real molesta, se revisita.

- [ ] **Step 3: Reescribir `guardarGasto`**

Reemplazar la función completa:

```typescript
async function guardarGasto(ctx: WaCtx, estado: EstadoGasto, pagadoPor: string) {
  const d = estado.datos as DatosComprobante & { comprobanteUrl?: string; categoria?: string; detalle?: string };
  const hoy = fechaHoy();
  const categoriaFinal = d.categoria ?? "otro";
  const moneda = (d.moneda ?? "ARS") as "ARS" | "USD";
  const simbolo = moneda === "USD" ? "U$D" : "$";
  const pagadoPorFinal = resolverNombre(pagadoPor);

  const registrado_por = titularDeTelefono(ctx.from.id) ?? nombreWa(ctx.from.name, ctx.from.id);

  try {
    await api.crearGasto({
      registrado_por,
      fecha: d.fecha || hoy,
      monto: d.monto ?? 0,
      moneda,
      categoria: categoriaFinal,
      pagado_por: pagadoPorFinal,
      nombre_destinatario: d.nombreDestinatario || null,
      banco_origen: estado.tipo === "manual" ? "Efectivo" : (d.bancoOrigen || null),
      nro_operacion: d.nroOperacion || null,
      detalle: d.detalle || null,
      comprobante_url: d.comprobanteUrl || null,
      id_reserva: null,
    });
  } catch (e) {
    await ctx.reply(`⚠️ ${e instanceof Error ? e.message : "No se pudo guardar el gasto."}`);
    await ctx.replyButtons("¿Qué querés hacer?", MENU_BOTONES);
    return;
  }

  await ctx.reply(
    `✅ Gasto registrado\n${categoriaFinal} · ${pagadoPorFinal} · ${simbolo}${(d.monto ?? 0).toLocaleString("es-AR")}`
  );
  await ctx.replyButtons("¿Querés registrar algo más?", MENU_BOTONES);
}
```
Agregar el import: `import { titularDeTelefono } from "../config";` (junto al `resolverNombre` ya importado de `../config`).

- [ ] **Step 4: Verificación manual (no hay test unitario previo de este handler — no se agrega uno nuevo ahora, fuera del alcance mínimo de este task; si se quiere cobertura, es un task aparte)**

```bash
npx tsc --noEmit
```
Expected: 0 errores. Prueba real end-to-end (mandar un comprobante de gasto de prueba por WhatsApp) se hace en la Task 12 (verificación final), cuando el bot ya arranca de punta a punta con las env vars reales.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/gastos.ts
git commit -m "feat: gastos.ts persiste vía la API de la web en vez de Sheets

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Nuevo flujo unificado de ingreso (`src/handlers/ingresos.ts`)

**Files:**
- Create: `src/handlers/ingresos.ts` (reemplaza `income.ts`, `cash.ts`, y la porción de `reservas.ts` que registraba adelanto/saldo — esos 3 archivos se borran en la Task 11)

**Interfaces:**
- Consume: `api.buscarReservas`, `api.obtenerCotizacion`, `api.registrarIngreso` (Task 8), `config.titularDeTelefono`.
- Produce: `onIngresoCommand(ctx)`, `onCallback(ctx, buttonId)`, `onText(ctx)`, `onPhoto(ctx, mediaId, mimeType)` — mismo contrato que los demás handlers, para que `index.ts` (Task 11) los conecte igual que a los otros.

- [ ] **Step 1: Escribir el handler completo**

```typescript
// src/handlers/ingresos.ts
import * as api from "../services/api";
import { titularDeTelefono, resolverNombre } from "../config";
import { downloadMedia } from "../services/whatsapp";
import { nombreWa, fechaHoy, validarFecha, validarMonto, esEscapePalabra, pedirConfirmacionEscape } from "../utils";
import { WaCtx, MENU_BOTONES } from "../types";

interface EstadoIngreso {
  paso: string;
  reserva?: api.ReservaResumen;
  datos: {
    monto?: number;
    moneda?: "ARS" | "USD";
    cotizacion?: number;
    cotizacionCompra?: number;
    cotizacionVenta?: number;
    quienPago?: string;
    fecha?: string;
    nombreDestinatario?: string;
    bancoDestino?: string;
    nroOperacion?: string;
    detalle?: string;
    comprobanteUrl?: string;
  };
}

const estados = new Map<string, EstadoIngreso>();

// ── Entry point ───────────────────────────────────────────────────────────

export async function onIngresoCommand(ctx: WaCtx): Promise<void> {
  estados.set(ctx.from.id, { paso: "buscar_reserva", datos: {} });
  await pedirReserva(ctx);
}

async function pedirReserva(ctx: WaCtx) {
  const reservas = await api.buscarReservas({ pendientes: true });
  if (reservas.length === 0) {
    await ctx.reply("No hay reservas con saldo pendiente en este momento.");
    await ctx.replyButtons("¿Qué querés hacer?", MENU_BOTONES);
    estados.delete(ctx.from.id);
    return;
  }
  await ctx.replyList(
    "¿A qué reserva corresponde este ingreso? (o escribí el nombre del huésped para buscar)",
    reservas.slice(0, 10).map(r => ({
      id: `ingreso_reserva_${r.id}`,
      title: `#${r.id} ${r.nombre_pax} — U$D ${r.saldo_usd}`,
    }))
  );
}

// ── Comprobante (OCR vía la web) ──────────────────────────────────────────

export async function onPhoto(
  ctx: WaCtx,
  mediaId: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"
): Promise<boolean> {
  const estado = estados.get(ctx.from.id);
  if (!estado || estado.paso !== "esperando_datos") return false;

  await ctx.reply("Procesando el comprobante...");
  let base64: string;
  try {
    ({ base64 } = await downloadMedia(mediaId));
  } catch {
    await ctx.reply("No pude descargar la imagen. ¿Podés reenviarla?");
    return true;
  }

  try {
    const { datos, url } = await api.subirComprobante(base64, mimeType, "ingreso");
    estado.datos.monto = datos.monto;
    estado.datos.moneda = (datos.moneda === "USD" ? "USD" : "ARS");
    estado.datos.quienPago = resolverNombre(datos.nombreOrdenante || "");
    estado.datos.nombreDestinatario = resolverNombre(datos.nombreDestinatario || "");
    estado.datos.bancoDestino = datos.bancoDestino || undefined;
    estado.datos.nroOperacion = datos.nroOperacion || undefined;
    estado.datos.fecha = datos.fecha || fechaHoy();
    estado.datos.comprobanteUrl = url;
  } catch {
    await ctx.reply("No pude leer el comprobante. ¿Podés reenviar una versión más nítida, o escribir los datos a mano?");
    return true;
  }

  await pedirCotizacion(ctx, estado);
  return true;
}

// ── Cotización (promedio por defecto, editable) ──────────────────────────

async function pedirCotizacion(ctx: WaCtx, estado: EstadoIngreso) {
  const { compra, venta } = await api.obtenerCotizacion(estado.datos.fecha);
  estado.datos.cotizacionCompra = compra;
  estado.datos.cotizacionVenta = venta;
  const promedio = compra > 0 && venta > 0 ? Math.round((compra + venta) / 2) : 0;
  estado.datos.cotizacion = promedio;
  estado.paso = "cotizacion";
  estados.set(ctx.from.id, estado);

  await ctx.reply(
    `Cotización del día — compra $${Math.round(compra)} · venta $${Math.round(venta)}\n\n` +
    `Por defecto se usa el promedio: *$${promedio}*. Si querés usar otro valor, escribilo ahora ` +
    `(solo el número). Si está bien así, escribí *ok*.`
  );
}

// ── Texto ─────────────────────────────────────────────────────────────────

export async function onText(ctx: WaCtx): Promise<boolean> {
  const estado = estados.get(ctx.from.id);
  if (!estado) return false;
  const texto = ctx.text?.trim() ?? "";

  if (esEscapePalabra(texto)) {
    await pedirConfirmacionEscape(ctx, () => estados.delete(ctx.from.id));
    return true;
  }

  // Buscar reserva por nombre (mientras se está eligiendo)
  if (estado.paso === "buscar_reserva") {
    const reservas = await api.buscarReservas({ buscar: texto });
    if (reservas.length === 0) {
      await ctx.reply(`No encontré ninguna reserva pendiente que coincida con "${texto}". Probá con otro nombre.`);
      return true;
    }
    await ctx.replyList(
      "Elegí la reserva:",
      reservas.slice(0, 10).map(r => ({ id: `ingreso_reserva_${r.id}`, title: `#${r.id} ${r.nombre_pax} — U$D ${r.saldo_usd}` }))
    );
    return true;
  }

  // Monto manual (sin comprobante)
  if (estado.paso === "monto") {
    const v = validarMonto(texto);
    if (!v.ok) { await ctx.reply(v.error!); return true; }
    estado.datos.monto = v.monto;
    estado.paso = "moneda";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿En qué moneda?", [
      { id: "ingreso_moneda_ARS", title: "🇦🇷 Pesos (ARS)" },
      { id: "ingreso_moneda_USD", title: "🇺🇸 Dólares (USD)" },
    ]);
    return true;
  }

  // Cotización — número nuevo, o "ok" para aceptar el default
  if (estado.paso === "cotizacion") {
    if (texto.toLowerCase() !== "ok") {
      const v = validarMonto(texto);
      if (!v.ok) { await ctx.reply("Escribí un número (ej: 1050), o *ok* para usar el promedio sugerido."); return true; }
      estado.datos.cotizacion = v.monto;
    }
    estado.paso = "quien_pago";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Quién pagó?");
    return true;
  }

  if (estado.paso === "quien_pago") {
    if (!texto) { await ctx.reply("Escribí el nombre de quién pagó."); return true; }
    estado.datos.quienPago = resolverNombre(texto);
    estado.paso = "fecha";
    estados.set(ctx.from.id, estado);
    await ctx.reply('¿Fecha del pago? (DD/MM/YYYY o "hoy")');
    return true;
  }

  if (estado.paso === "fecha") {
    let fecha: string;
    if (texto.toLowerCase() === "hoy") {
      fecha = fechaHoy();
    } else {
      const v = validarFecha(texto);
      if (!v.ok) { await ctx.reply(v.error!); return true; }
      fecha = v.fecha!;
    }
    estado.datos.fecha = fecha;
    estado.paso = "confirmar";
    estados.set(ctx.from.id, estado);
    await mostrarConfirmacion(ctx, estado);
    return true;
  }

  return false;
}

// ── Botones ───────────────────────────────────────────────────────────────

export async function onCallback(ctx: WaCtx, buttonId: string): Promise<boolean> {
  if (!buttonId.startsWith("ingreso_")) return false;
  const estado = estados.get(ctx.from.id);
  if (!estado) return false;

  if (buttonId.startsWith("ingreso_reserva_")) {
    const id = buttonId.replace("ingreso_reserva_", "");
    const reservas = await api.buscarReservas({ buscar: id });
    const reserva = reservas.find(r => r.id === id);
    if (!reserva) { await ctx.reply("No encontré esa reserva, probá de nuevo."); return true; }
    estado.reserva = reserva;
    estado.paso = "esperando_datos";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons(
      `Reserva #${reserva.id} — ${reserva.nombre_pax}\nSaldo pendiente: U$D ${reserva.saldo_usd}\n\n¿Mandás el comprobante, o cargás los datos a mano?`,
      [{ id: "ingreso_manual", title: "✏️ Cargar a mano" }]
    );
    return true;
  }

  if (buttonId === "ingreso_manual") {
    estado.paso = "monto";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Cuál es el monto?");
    return true;
  }

  if (buttonId.startsWith("ingreso_moneda_")) {
    estado.datos.moneda = buttonId.replace("ingreso_moneda_", "") as "ARS" | "USD";
    await pedirCotizacion(ctx, estado);
    return true;
  }

  if (buttonId === "ingreso_confirmar") {
    await guardarIngreso(ctx, estado);
    estados.delete(ctx.from.id);
    return true;
  }

  if (buttonId === "ingreso_cancelar") {
    estados.delete(ctx.from.id);
    await ctx.replyButtons("Registro cancelado.", MENU_BOTONES);
    return true;
  }

  return false;
}

// ── Confirmación y guardado ───────────────────────────────────────────────

async function mostrarConfirmacion(ctx: WaCtx, estado: EstadoIngreso) {
  const d = estado.datos;
  const simbolo = d.moneda === "USD" ? "U$D" : "$";
  await ctx.replyButtons(
    `*Confirmar ingreso — reserva #${estado.reserva?.id}*\n\n` +
    `Monto: ${simbolo}${(d.monto ?? 0).toLocaleString("es-AR")}\n` +
    `Cotización: $${d.cotizacion}\n` +
    `Quién pagó: ${d.quienPago}\n` +
    `Fecha: ${d.fecha}`,
    [
      { id: "ingreso_confirmar", title: "✅ Confirmar" },
      { id: "ingreso_cancelar",  title: "❌ Cancelar" },
    ]
  );
}

async function guardarIngreso(ctx: WaCtx, estado: EstadoIngreso) {
  const d = estado.datos;
  const reserva = estado.reserva!;
  const monto = d.monto ?? 0;
  const moneda = d.moneda ?? "ARS";
  const cotizacion = d.cotizacion ?? 0;
  const monto_usd = moneda === "USD" ? monto : (cotizacion > 0 ? monto / cotizacion : 0);
  const monto_ars = moneda === "ARS" ? monto : monto * cotizacion;
  const saldoActual = reserva.saldo_usd;
  const tipo_movimiento = monto_usd >= saldoActual ? "saldo" : "adelanto";

  const registrado_por = titularDeTelefono(ctx.from.id) ?? nombreWa(ctx.from.name, ctx.from.id);

  try {
    await api.registrarIngreso({
      registrado_por,
      id_reserva: reserva.id,
      casa: reserva.casa,
      fecha: d.fecha ?? fechaHoy(),
      monto,
      moneda,
      cotizacion,
      monto_ars: Math.round(monto_ars),
      monto_usd,
      tipo_movimiento,
      quien_pago: d.quienPago ?? "",
      nombre_destinatario: d.nombreDestinatario ?? null,
      banco_destino: d.bancoDestino ?? null,
      nro_operacion: d.nroOperacion ?? null,
      detalle: d.detalle ?? null,
      comprobante_url: d.comprobanteUrl ?? null,
    });
  } catch (e) {
    await ctx.reply(`⚠️ ${e instanceof Error ? e.message : "No se pudo guardar el ingreso."}`);
    await ctx.replyButtons("¿Qué querés hacer?", MENU_BOTONES);
    return;
  }

  await ctx.reply(`✅ Ingreso registrado — reserva #${reserva.id}`);
  await ctx.replyButtons("¿Querés registrar algo más?", MENU_BOTONES);
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```
Expected: 0 errores (ajustar cualquier import sin uso que marque, como la nota de arriba).

- [ ] **Step 3: Commit**

```bash
git add src/handlers/ingresos.ts
git commit -m "feat: nuevo flujo unificado de ingreso, siempre atado a una reserva existente

Reemplaza income.ts/cash.ts/la porción de reservas.ts que registraba
adelanto o saldo (se borran en el próximo task). Incluye cotización
compra/venta con promedio por defecto, editable antes de confirmar.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Simplificar "Ver saldo" (`src/handlers/balance.ts`)

**Files:**
- Modify: `src/handlers/balance.ts` (reemplazo completo del contenido)

- [ ] **Step 1: Reescribir el archivo completo**

```typescript
// src/handlers/balance.ts
import * as api from "../services/api";
import { WaCtx, MENU_BOTONES } from "../types";

export async function onSaldoCommand(ctx: WaCtx): Promise<void> {
  await ctx.reply("Consultando saldos...");
  try {
    const saldos = await api.obtenerSaldos();
    let msg = "*SALDOS DE CUENTAS*\n\n";
    for (const { titular, saldo_usd } of saldos) {
      msg += `*${titular}*: U$D ${saldo_usd.toLocaleString("es-AR")}\n`;
    }
    await ctx.reply(msg);
  } catch {
    await ctx.reply("Error consultando los saldos. Intentá de nuevo.");
  }
  await ctx.replyButtons("¿Qué más querés hacer?", MENU_BOTONES);
}
```

(Se elimina `onReportarSaldoCommand` y todo el manejo de botones/texto de esa función — decisión ya tomada, no se migra el reporte manual.)

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```
Expected: en este punto va a fallar porque `index.ts` todavía importa `onReportarSaldoCommand` y el `onCallback`/`onText` viejos de `balance.ts` que ya no existen — **eso se corrige en la Task 12**, es esperable que este task quede con errores de compilación hasta que se complete el siguiente. Confirmar que el único error nuevo es justamente ese (referencias a `balance.ts` desde `index.ts`), no algo dentro del propio `balance.ts` reescrito.

- [ ] **Step 3: Commit**

```bash
git add src/handlers/balance.ts
git commit -m "feat: balance.ts se reduce a Ver saldo (calculado, vía la API de la web)

Se elimina el reporte manual de saldo real (Actualizar saldo) — decisión
tomada en el diseño, no se migra ni se reemplaza.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Simplificar `index.ts`, borrar handlers/servicios muertos, limpiar dependencias

**Files:**
- Modify: `src/index.ts` (menú + routing)
- Delete: `src/handlers/reservas.ts`, `src/handlers/correccion.ts`, `src/handlers/comision.ts`, `src/handlers/income.ts`, `src/handlers/cash.ts`
- Delete: `src/services/sheets.ts`, `src/services/reservas.ts`, `src/services/dolar.ts`, `src/services/comprobantes.ts`, `src/services/claude.ts`, `src/services/storage.ts`
- Delete: `src/__tests__/reservas.test.ts` (probaba exactamente lo que se borra)
- Modify: `src/types.ts` (actualizar `MENU_BOTONES`, quitar tipos que ya no se usan si quedan huérfanos)
- Modify: `package.json` (quitar `googleapis`, `@anthropic-ai/sdk` si `services/claude.ts` era su único uso)

**Interfaces:**
- Consume: `onIngresoCommand` (Task 10), `onSaldoCommand` (Task 11), lo existente de `gastos.ts` (Task 9).

- [ ] **Step 1: Reescribir `src/types.ts` — `MENU_BOTONES`**

Cambiar:
```typescript
export const MENU_BOTONES = [
  { id: "menu_gasto",   title: "💸 Nuevo gasto" },
  { id: "menu_reserva", title: "📋 Gestionar reservas" },
  { id: "menu_saldos",  title: "📊 Saldos y reportes" },
  { id: "menu_otros",   title: "📎 Otros" },
];
```
por:
```typescript
export const MENU_BOTONES = [
  { id: "menu_gasto",   title: "💸 Nuevo gasto" },
  { id: "menu_ingreso", title: "💰 Registrar ingreso" },
  { id: "menu_saldo",   title: "📊 Ver saldo" },
];
```

- [ ] **Step 2: Reescribir `routeMessage`/`sendMenu` en `src/index.ts`**

Reemplazar los imports del principio del archivo (quitar todo lo de `income`, `cash`, `balance` viejo, `comision`, `reservas`, `correccion`):

```typescript
import "dotenv/config";
import express from "express";
import { config } from "./config";
import { parseWebhookBody, sendText, sendButtons, sendList, WaMessage } from "./services/whatsapp";
import { WaCtx } from "./types";
import { onPhoto as onPhotoGasto, onManualGasto, onCallback as onCallbackGasto, onText as onTextGasto } from "./handlers/gastos";
import { onIngresoCommand, onCallback as onCallbackIngreso, onText as onTextIngreso, onPhoto as onPhotoIngreso } from "./handlers/ingresos";
import { onSaldoCommand } from "./handlers/balance";
import { onCallbackEscape } from "./utils";
```

Reemplazar `sendMenu`:
```typescript
async function sendMenu(ctx: WaCtx) {
  await ctx.replyList(
    `Hola ${ctx.from.name.split(" ")[0]} 👋 ¿Qué querés hacer?`,
    [
      { id: "menu_gasto",   title: "💸 Nuevo gasto" },
      { id: "menu_ingreso", title: "💰 Registrar ingreso" },
      { id: "menu_saldo",   title: "📊 Ver saldo" },
    ]
  );
}
```

Reemplazar el cuerpo de `routeMessage` — mismo `buildCtx`/gate de `isTeam` de antes, pero con el bloque de imágenes y el bloque de botones simplificados:

```typescript
async function routeMessage(msg: WaMessage) {
  const isTeam = config.whatsappTeamNumbers.has(msg.from);
  if (!isTeam) {
    await sendText(msg.from, "Hola, gracias por contactarnos. Te responderemos a la brevedad 👋");
    return;
  }

  const ctx = buildCtx(msg);

  // ── Imágenes y documentos ─────────────────────────────────────────────
  if ((msg.type === "image" && msg.imageId) || (msg.type === "document" && msg.documentId && msg.mimeType?.startsWith("image/"))) {
    const mediaId = (msg.imageId ?? msg.documentId)!;
    const mime = (msg.mimeType ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";
    if (await onPhotoIngreso(ctx, mediaId, mime)) return;
    await onPhotoGasto(ctx, mediaId, mime);
    return;
  }
  if (msg.type === "document" && msg.documentId && msg.mimeType === "application/pdf") {
    if (await onPhotoIngreso(ctx, msg.documentId, "application/pdf")) return;
    await onPhotoGasto(ctx, msg.documentId, "application/pdf");
    return;
  }

  // ── Botones / listas ──────────────────────────────────────────────────
  if (msg.type === "interactive" && msg.buttonReplyId) {
    const id = msg.buttonReplyId;
    if (id === "menu_gasto")   { await onManualGasto(ctx); return; }
    if (id === "menu_ingreso") { await onIngresoCommand(ctx); return; }
    if (id === "menu_saldo")   { await onSaldoCommand(ctx); return; }

    if (await onCallbackEscape(ctx, id)) return;
    if (await onCallbackGasto(ctx, id)) return;
    if (await onCallbackIngreso(ctx, id)) return;
    return;
  }

  // ── Texto ─────────────────────────────────────────────────────────────
  if (msg.type === "text") {
    if (await onTextIngreso(ctx)) return;
    if (await onTextGasto(ctx)) return;
    await sendMenu(ctx);
  }
}
```

Nota: `onPhotoIngreso` (nuevo, de la Task 10) devuelve `boolean` (`false` si no hay un flujo de ingreso activo esperando comprobante) — por eso va primero y, si no aplica, se cae a `onPhotoGasto` (que no tiene guarda de "flujo activo", siempre intenta interpretar la foto como gasto). Esto reemplaza la cascada vieja de tres niveles (`onPhotoReserva` → `onPhotoSinContexto` → `onPhoto` de income) por dos, ya que reserva y "sin contexto" ya no existen.

Quitar del archivo cualquier función que haya quedado sin uso (`onCorregirCommand`, `onReservaCommand`, etc. si estaban referenciadas en el `routeMessage` viejo) — no debería quedar ninguna después de este reemplazo, pero confirmar con el Step 3.

- [ ] **Step 3: Borrar los archivos muertos**

```bash
cd "c:/Users/Administrador/Milagros/rental-bot-whatsapp"
git rm src/handlers/reservas.ts src/handlers/correccion.ts src/handlers/comision.ts src/handlers/income.ts src/handlers/cash.ts
git rm src/services/sheets.ts src/services/reservas.ts src/services/dolar.ts src/services/comprobantes.ts src/services/claude.ts src/services/storage.ts
git rm src/__tests__/reservas.test.ts
```

- [ ] **Step 4: Limpiar `package.json`**

Confirmar primero que nada más usa `googleapis` o `@anthropic-ai/sdk`:
```bash
grep -rn "googleapis\|@anthropic-ai/sdk" src/
```
Expected: sin resultados (ambos solo los usaban los archivos ya borrados). Si es así, quitar del `package.json`:
```bash
npm uninstall googleapis @anthropic-ai/sdk
```

- [ ] **Step 5: Verificar que compila y testea**

```bash
npx tsc --noEmit
```
Expected: 0 errores — este es el punto donde se resuelve el error esperado que quedó pendiente de la Task 11.

```bash
npm test
```
Expected: la suite corre con `api.test.ts` (Task 8, 4 tests) y `setup.test.ts` (4 tests — verificado: es infraestructura genérica de Jest/mocks, no depende de fixtures de reservas, no necesita ningún ajuste) — 8/8 pasando. Ya no hay deuda de "38/123 fallando": el archivo que fallaba (`reservas.test.ts`) se borró junto con la funcionalidad que probaba.

```bash
npm run build
```
Expected: build limpio, `dist/index.js` generado.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: simplificar el bot a 3 acciones — borrar reservas/correcciones/comisión/Sheets

Menú final: Nuevo gasto, Registrar ingreso, Ver saldo. Se borran los
handlers y servicios que ya no se usan (Sheets, OCR local, dólar
local) y las dependencias que solo ellos necesitaban.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Verificación final end-to-end y checklist de cierre

**Files:** ninguno nuevo.

- [ ] **Step 1: Levantar la web y el bot juntos, en local**

```bash
# Terminal 1
cd "c:/Users/Administrador/Milagros/rental-bot" && npm run dev
# Terminal 2 — .env del bot debe tener BOT_API_BASE_URL=http://localhost:3000 y el mismo BOT_API_SECRET que la web
cd "c:/Users/Administrador/Milagros/rental-bot-whatsapp" && npm run dev
```

- [ ] **Step 2: Probar los 3 flujos por WhatsApp real** (número de prueba, no un huésped real)

1. **Nuevo gasto** con comprobante real de prueba → confirmar que en Supabase (`gastos`) aparece la fila con `registrado_por` = titular correcto (no el nombre de perfil de WhatsApp), `comprobante_url` apuntando al bucket de Storage.
2. **Registrar ingreso** contra una reserva de prueba existente (no una real) → probar explícitamente cambiar la cotización sugerida por otro valor antes de confirmar, y verificar que `monto_ars`/`monto_usd` en la fila de Supabase reflejan la cotización que se puso, no el promedio original. Verificar que `saldo_usd`/`estado_pago` de la reserva se recalcularon bien.
3. **Ver saldo** → comparar el número contra un cálculo manual con los datos de prueba usados en el paso anterior.

- [ ] **Step 3: Confirmar que no queda ningún rastro de Sheets**

```bash
cd "c:/Users/Administrador/Milagros/rental-bot-whatsapp"
grep -rn "googleapis\|GOOGLE_SHEET\|GOOGLE_CLIENT_EMAIL\|GOOGLE_PRIVATE_KEY" src/ .env 2>/dev/null
```
Expected: sin resultados en `src/`. Si el `.env` real todavía tiene esas variables, se pueden dejar sin usar por ahora o borrarlas — no rompen nada al quedar sin leer, pero lo prolijo es sacarlas.

- [ ] **Step 4: Checklist manual pendiente** (avisar a Mili, no se resuelve con código):
  - Configurar `BOT_API_SECRET` y `BOT_API_BASE_URL` reales en el `.env` de producción del bot (la VM), y `BOT_API_SECRET` en las variables de entorno de Vercel de la web — deben coincidir.
  - `TELEFONOS_TITULARES` real (mapeo número→titular) en el `.env` de producción del bot.
  - El bot en producción sigue sin pipeline de deploy funcionando (`.github/workflows`) — ya anotado como pendiente en el spec de separación de repos, no se resuelve acá.
  - Decidir qué hacer con los comprobantes viejos que quedaron en el filesystem local del bot (`STORAGE_DIR`/`comprobantes/`) — no se migran automáticamente a Supabase Storage, quedan donde están salvo que se pida explícitamente moverlos.
