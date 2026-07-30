# Migración del bot de WhatsApp: Google Sheets → Supabase

## Contexto

El bot de WhatsApp (repo separado `rental-bot-whatsapp`, ver
`2026-07-29-separacion-repo-bot-web-design.md`) sigue usando Google Sheets para
todo. La web (este repo) ya maneja gastos, ingresos y reservas en Supabase,
con su propia lógica de negocio (cotización, redondeo de saldo, detección de
duplicados, recálculo de saldo de reserva, resolución automática de comisión
de Paola al cobrar).

Objetivo: que el bot dependa 100% de Supabase (cero Google Sheets) para tres
acciones puntuales, **reutilizando la lógica de la web en vez de
reimplementarla** — el bot llama a la API de la web, no toca las tablas
directo.

**Investigación previa** (dos exploraciones completas antes de este spec):
cómo arma hoy el bot sus filas de Sheets (`gastos.ts`, `income.ts`, `cash.ts`,
`reservas.ts`, `services/sheets.ts` del bot), y el esquema/reglas reales de
Supabase (`schema.sql`, migraciones, `app/actions/*.ts`, `lib/saldo.ts`,
`lib/cuentaPaola.ts` de la web). Hallazgo clave que definió la arquitectura:
la web ya escribe con la **service role key** (bypassa RLS, que además no
está activado en ninguna tabla) — no hay ninguna barrera técnica que impida
que el bot escriba directo, pero hacerlo obligaría a reimplementar en el
repo del bot toda esa lógica de negocio, con riesgo real de que las dos
implementaciones diverjan. De ahí la decisión de que el bot consuma la
lógica de la web vía HTTP, no que la duplique.

## Alcance final (confirmado con Mili, con recortes explícitos durante el diseño)

El menú del bot queda reducido a **exactamente 3 acciones**. Todo lo demás
desaparece del flujo (no queda oculto ni deshabilitado con aviso — se saca
del menú y del router):

1. **💸 Nuevo gasto**
2. **💰 Registrar ingreso** — siempre atado a una reserva ya existente (la
   reserva la sigue manejando la web; el bot ya no pregunta "¿es una reserva
   nueva?" ni tiene un camino de ingreso suelto sin reserva)
3. **📊 Ver saldo** — calculado en vivo desde Supabase (ingresos de las casas
   de cada titular, vía la reserva vinculada, menos gastos que pagó). **Sin
   reporte manual de saldo real** — eso se descartó explícitamente, no se crea
   ninguna tabla para guardarlo; todo sale de un cálculo sobre los datos que ya
   existen.

**Explícitamente fuera de esta migración** (decisiones tomadas durante el
diseño, no pendientes de re-discutir):

- Crear una reserva nueva desde el bot — no se hace, punto. Las reservas se
  siguen creando solo desde la web.
- Corregir un gasto/ingreso ya cargado — el comando "corregir gasto" se
  **elimina** del bot en vez de dejarlo apuntando a datos que ya no van a
  estar en Sheets.
- "Gestionar reservas" (crear/corregir/anular) y "Comisión Paola" — se
  eliminan del menú del bot completo.
- Reporte manual de saldo real ("Actualizar saldo") — eliminado, no se
  migra ni se reemplaza.

## Arquitectura

```
WhatsApp → bot (rental-bot-whatsapp, VM propia)
              │  HTTP + Authorization: Bearer <BOT_API_SECRET>
              ▼
        web (rental-bot) — /api/bot/*
              │  llama directo a las mismas funciones que usa la UI
              ▼
        Supabase (mismo proyecto que ya usa la web)
```

El bot nunca toca Supabase directo. Todo pasa por 6 endpoints nuevos en la
web bajo `src/app/api/bot/`, protegidos por un secret compartido — mismo
patrón que ya usa el webhook de WhatsApp con `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

### Autenticación entre servicios

- Nueva env var `BOT_API_SECRET` en **ambos** repos (mismo valor).
- El bot manda `Authorization: Bearer <BOT_API_SECRET>` en cada request.
- `src/lib/supabase/middleware.ts` de la web agrega `/api/bot` a
  `rutasPublicas` (para que el middleware de sesión no lo redirija a
  `/login` — el bot no tiene cookies de sesión).
- Cada endpoint de `/api/bot/*` valida el header él mismo, al principio,
  antes de tocar cualquier dato — si no matchea, `401`.

### Identidad ("quién registró")

- Nuevo mapeo número de WhatsApp → titular en el bot (`src/config.ts`,
  junto a `WHATSAPP_TEAM_NUMBERS`), análogo al mapeo `casa → titular` que ya
  existe. El bot resuelve el titular real (Francisco/Milagros/Inés/
  Fernando/Paola) y lo manda como `registrado_por` en cada request.
- La web **valida** que el `registrado_por` recibido sea uno de los 5
  titulares conocidos antes de usarlo (límite de confianza — no se confía a
  ciegas en lo que mande el bot) — `400` si no matchea ninguno.
- `crearGasto`, `crearIngreso` y `registrarPago` (en
  `src/app/actions/{gastos,ingresos}.ts`) hoy sacan `registrado_por` siempre
  de `registradoPorActual()` (sesión de Supabase Auth) sin que el caller lo
  pueda pisar. Se les agrega un parámetro opcional (ej. `registradoPorOverride`)
  que **solo usan las rutas `/api/bot/*`** — la UI web normal sigue
  funcionando exactamente igual, sin ningún cambio de comportamiento.

## Endpoints nuevos en la web (`src/app/api/bot/`)

### `POST /api/bot/comprobante`

Recibe `multipart/form-data` (`file`, `tipo`: `gasto`|`ingreso`), igual que
`/api/comprobante` ya existente. Se extrae la lógica de OCR (prompt de
Claude) + subida a Storage de `/api/comprobante/route.ts` a un helper
compartido (ej. `src/lib/comprobante.ts`, función `extraerYSubirComprobante`)
para que **ambas** rutas (la web con sesión, el bot con secret) lo reusen sin
duplicar el prompt ni la lógica de upload. Devuelve `{ datos, url }` — el bot
muestra `datos` por chat para que el usuario confirme/corrija antes de
guardar, exactamente como hace hoy con su propio OCR (que se elimina del
lado del bot).

### `POST /api/bot/gastos`

Recibe los campos ya confirmados por el usuario (`fecha`, `monto`, `moneda`,
`categoria`, `pagado_por`, `nombre_destinatario`, `banco_origen`,
`nro_operacion`, `detalle`, `comprobante_url`, `id_reserva`) más
`registrado_por` (resuelto por teléfono). Llama a `crearGasto(...)` pasando
el override. Duplicados por `nro_operacion` (chequeo previo + `UNIQUE`
constraint real) ya vienen gratis de la función existente — el endpoint
solo traduce el error a JSON (`{ error: mensaje }`, status `409` si es
duplicado, `400` si es de validación).

### `POST /api/bot/ingresos`

Requiere `id_reserva` (siempre — el bot ya no permite ingreso sin reserva).
Llama a `registrarPago(id_reserva, payload)`, que bloquea si la reserva está
cancelada, recalcula `saldo_usd`/`estado_pago` de la reserva completa y
dispara `resolverComisionAlCobrar` si corresponde. **Importante** (corrige
una imprecisión de una versión anterior de este spec): a diferencia de
`crearGasto`, `registrarPago` **no calcula** `cotizacion`/`monto_ars`/
`monto_usd` — los recibe ya resueltos en el payload, calculados por quien
llama (hoy la propia pantalla de "Asentar pago" de la web). El bot pasa a
tener esa misma responsabilidad — ver `GET /api/bot/cotizacion` abajo y el
detalle del flujo de ingreso más adelante en este documento.

### `GET /api/bot/cotizacion?fecha=DD/MM/YYYY`

Solo lectura. Envoltorio directo de `obtenerCotizacionCompraVenta` (el mismo
helper que ya usa `/api/cotizacion` para la pantalla de pago) — devuelve
`{ compra, venta }`. Sin fecha, trae la cotización del día.

### `GET /api/bot/reservas?buscar=<texto>` y `GET /api/bot/reservas?pendientes=1`

Solo lectura. Devuelve una lista de reservas (con `estado_pago != 'pagado'`
para `pendientes=1`, o que matcheen `nombre_pax`/`id` para `buscar`) con los
campos mínimos para que el bot arme la lista/selección por chat: `id`,
`nombre_pax`, `casa`, `fecha_entrada`, `fecha_salida`, `saldo_usd`,
`estado_pago`. Reemplaza `listarReservasPendientes`/`buscarReservasPorNombre`
que hoy el bot corre contra Sheets.

### `GET /api/bot/saldos`

Solo lectura, sin parámetros. Lógica **nueva** en la web (no existe hoy un
equivalente — esto no es "reusar", es portar la matemática que ya tiene el
bot en `obtenerSaldos()` a una versión que lee Supabase):

Para cada titular en `Francisco, Milagros, Inés, Fernando` (mismo universo
que la actual hoja `SaldosReales` — Paola queda afuera, su balance vive en
el sistema separado de `cuenta-paola`):

```
saldo(titular) = Σ ingresos.monto_usd de reservas cuyo reservas.titular = titular
               − Σ gastos.monto_usd donde gastos.pagado_por = titular
```

Sin filtro de fecha (igual que el cálculo actual del bot — suma todo el
historial). `reservas.titular` ya se completa automáticamente desde `casa`
al crear la reserva (comportamiento existente de `crearReserva`), así que el
join es directo. Devuelve `{ titular, saldo_usd }[]`.

## Cambios del lado del bot (`rental-bot-whatsapp`)

- **Se eliminan** (archivos y referencias en `index.ts`): todo lo de
  `src/handlers/reservas.ts` salvo lo que haga falta para buscar/seleccionar
  una reserva (se reescribe, ya no crea/corrige/anula), `src/handlers/
  correccion.ts` completo, `src/handlers/comision.ts` completo, el menú
  "📋 Gestionar reservas" y "💼 Comisión Paola" de `index.ts`.
- **`src/services/sheets.ts`** dejan de usarse para gasto/ingreso/reserva/
  comisión — solo quedaría (a evaluar en el plan de implementación) si algo
  residual sigue leyendo/escribiendo Sheets; el objetivo declarado es cero
  Sheets, así que si no queda ningún uso real, el archivo se elimina entero.
- **Nuevo `src/services/api.ts`**: cliente HTTP a los 6 endpoints, con el
  header `Authorization` y manejo de errores (traduce `409`/`400`/`401` a
  mensajes de chat legibles, mismo tono que los errores de duplicado que ya
  maneja hoy).
- **`src/handlers/gastos.ts`**: mismo flujo conversacional (categoría, monto,
  moneda, descripción, pagado por, fecha, comprobante opcional), cambia solo
  la llamada final (`api.crearGasto(...)` en vez de `registrarGasto` de
  Sheets).
- **Ingreso — flujo nuevo unificado** (reemplaza `income.ts`/`cash.ts`/la
  parte de `reservas.ts` que registraba adelanto/saldo):
  1. Pregunta a qué reserva corresponde (lista de pendientes vía
     `GET /api/bot/reservas?pendientes=1`, o buscar por nombre).
  2. Monto y moneda (u OCR de comprobante que los sugiere).
  3. **Cotización**: llama a `GET /api/bot/cotizacion` (con la fecha del
     pago, si ya se sabe) y muestra compra/venta al usuario, **precargando
     el promedio redondeado** como valor por defecto — mismo criterio que
     ya usa hoy la pantalla "Asentar pago" de la web
     (`Math.round((compra + venta) / 2)`). El usuario puede escribir un
     valor distinto para pisar el default antes de confirmar; el bot
     recalcula `monto_ars`/`monto_usd` con la cotización final (la
     por-defecto o la que el usuario haya puesto) antes de mandar el
     payload — igual que hace `pago/page.tsx` en el cliente.
  4. Quién pagó, fecha, confirmar → llama a `api.registrarIngreso(idReserva,
     ...)` mandando ya `cotizacion`/`monto_ars`/`monto_usd` resueltos.
- **`src/handlers/balance.ts`**: se reduce a un solo comando ("Ver saldo"),
  que llama a `GET /api/bot/saldos` y formatea la respuesta — se elimina
  `onReportarSaldoCommand` y todo lo de `SaldosReales`.
- **Menú principal** (`src/index.ts`, `sendMenu`): pasa de 4 botones a 3
  (Nuevo gasto / Registrar ingreso / Ver saldo), se elimina el submenú
  "📎 Otros" salvo que quede algo que de verdad siga haciendo falta (a
  confirmar en el plan — hoy incluía justamente las tres cosas que se
  eliminan: ingreso efectivo suelto, corregir reserva, corregir gasto).

## Testing / verificación

- Cada endpoint nuevo de `/api/bot/*`: probar sin header (401), con header
  pero `registrado_por` inválido (400), caso feliz, y caso de duplicado
  (409) — reusando los mismos casos que ya cubren (o deberían cubrir)
  `crearGasto`/`registrarPago` desde la UI.
- `GET /api/bot/saldos`: verificar contra un cálculo manual con datos de
  prueba (reservas con distintos titulares, ingresos y gastos cruzados)
  antes de confiar en el número — memoria del proyecto ya marca esto como
  zona sensible ("Confirmar fórmulas financieras" antes de tocar código de
  cálculo de negocio).
- Verificación end-to-end real del bot (no solo unitaria) queda para cuando
  se implemente, contra un ambiente de staging de Supabase si existe uno
  disponible y corriente (la memoria del proyecto marca el staging actual
  como caído/eliminado — a confirmar antes de asumir que existe).

## Riesgos / cosas a tener presente

- **Concurrencia en `registrarPago`**: el recálculo de saldo de una reserva
  no es transaccional (lee todo, calcula en JS, actualiza aparte) — si el
  bot y la web registran un pago sobre la **misma reserva** casi al mismo
  tiempo, uno de los dos cálculos de saldo puede pisar al otro (el pago en
  sí no se pierde, pero el `saldo_usd`/`estado_pago` final puede quedar mal
  hasta el próximo pago que lo recalcule). Riesgo preexistente de la web,
  no algo que este spec deba resolver, pero ahora hay una fuente más de
  escritura concurrente — documentado, no bloqueante.
- **Tabla `historial`**: existe y se usa desde las actions de la web, pero
  su `CREATE TABLE` no está en `schema.sql` ni en ninguna migración
  versionada del repo — quedó creada a mano en algún momento. No bloquea
  esta migración (las acciones en alcance son solo creación, que no escribe
  en `historial`), pero es deuda a anotar aparte.
- **`.env` del bot**: hoy tiene credenciales de Google Sheets
  (`GOOGLE_SHEET_ID`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`) que dejan
  de usarse por completo con este cambio — se pueden sacar del `.env` y de
  `config.ts` una vez confirmado que no queda ningún uso.

## Próximo paso

Con este spec aprobado, sigue el plan de implementación
(`writing-plans`) — probablemente dos frentes de trabajo separables (web:
endpoints nuevos + cambios a las actions; bot: nuevo cliente HTTP +
reescritura de handlers), a decidir el orden/paralelismo en el plan mismo.
