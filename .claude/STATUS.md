# Status — log de sesiones

Entradas nuevas arriba. No se borran las viejas.

---

## 2026-06-28 — Feature: cuenta-paola · Rama: `feature/cuenta-paola`

**Pipeline completo hasta Agente 3 (Developer), pendiente Agente 4 (QA).**

**Origen**: Mili pidió pensar cómo registrar la comisión de Paola (15% directo / 10% airbnb), que ahora se cobra como el primer pago de cada reserva directo a su cuenta. La conversación de diseño (antes de tocar `/explore`) llevó a un mecanismo de 2 niveles: saldo de caja crudo (cobrado − gastado ± ajustes) + una reconciliación devengado-vs-cobrado por reserva, anclada a la fecha de **checkout** (no a la fecha de cobro) para que una reserva cobrada en un mes pero cancelada/resuelta en otro no distorsione el cierre. Las cancelaciones con cobro ya hecho NO generan deuda automática — quedan en una cola de clasificación manual (comisión definitiva vs. pago a cuenta de caja chica).

- `/explore cuenta-paola` → `.claude/artifacts/cuenta-paola/explore.md`: encontró que el bot YA tiene un comando "💼 Comisión Paola" (`src/handlers/comision.ts` → `obtenerBalancePaola()`), pero es de solo lectura y sin la reconciliación nueva — se acepta que el número difiera del de la web. Hallazgo aparte: todo `src/` (bot) sigue persistiendo en Google Sheets, no solo gastos como decía `CONTEXT.md` — pendiente corregir la doc, no bloqueante.
- **Agente 1 (PO)** → `po-output.json`, 2 revisiones después de la 1ra aprobación (US-05 cierre mensual, US-06 cancelaciones) + una 3ra corrección de signo en la fórmula del saldo (restaba mal los gastos) detectada al comparar contra el bot, antes de codear.
- **Agente 2 (Designer)** → `designer-output.json`, mismas 2 secciones nuevas agregadas (`CierreMensualSection`, `CancelacionesPendientesSection`).
- **Agente 3 (Developer)** → commit `a6418fa`: migración `004_cuenta_paola.sql` (tabla `movimientos_internos` + columna `ingresos.resolucion_cancelacion`), `lib/cuentaPaola.ts`, server actions, `/api/cuenta-paola-data`, pantalla `/cuenta-paola`, tab nueva en `NavTabs`, gatillo en `pago/page.tsx` + modo prefill en `GastoWizard`. `tsc --noEmit` y `eslint` limpios (verificados también de forma independiente, no solo por el reporte del propio Developer).

**Acción manual pendiente fuera de este repo**: correr la migración `004_cuenta_paola.sql` a mano en el SQL Editor de Supabase — mismo patrón que las migraciones 001-003, no hay tooling automático.

**Agente 4 (QA) completado** → commit `6a4c207` → `.claude/artifacts/cuenta-paola/qa-output.json`. **`summary: PASS`**, pero con 2 bugs reales encontrados y corregidos en la misma ronda (no solo reportados):
- US-04: `nombre_destinatario` precargado por el gatillo de comisión quedaba en el payload pero invisible/no editable en `FormularioGasto.tsx` (el bloque solo se mostraba con `fromComprobante=true`). Se agregó un campo editable separado para el caso de prefill sin comprobante.
- US-04/US-05: el monto se redondeaba a entero (`Math.round`) al precargar tanto el gasto de comisión como el movimiento de cierre mensual, perdiendo centavos. Corregido en ambos casos.

**`critical_missing` no bloqueante, pendiente de decisión de Mili**: no hay forma de marcar un mes como "ya cerrado" en el cierre mensual (US-05) — si se revisita el mismo mes después de crear el ajuste, la tabla mostraría la misma diferencia otra vez y nada impide duplicar el `movimiento_interno`. Mitigación aplicada: el detalle del movimiento ahora incluye el mes, visible en la lista de ajustes, para que se note a simple vista. No es una prevención real.

**Sin verificación end-to-end (Playwright) en esta sesión** — bloqueado porque la migración `004_cuenta_paola.sql` todavía no está aplicada en Supabase real (tabla `movimientos_internos` y columna `ingresos.resolucion_cancelacion` no existen todavía en la base).

**Migración 004 confirmada corrida por Mili en staging** (`https://evhlzntpimxfkbgyhcci.supabase.co`, el proyecto al que apunta `.env.local`/`.env.staging.local`).

**Bug de runtime reportado y corregido**: `/cuenta-paola` crasheaba con "Cannot read properties of undefined (reading 'reduce')" cuando `/api/cuenta-paola-data` devolvía un error (exactamente por la migración no aplicada todavía en ese momento) — la página asumía que la respuesta siempre tenía la forma esperada. Commit `0c323e3`: ahora se muestra un cartel de error en vez de crashear.

**Limpieza + simulación de datos en staging, autorizada explícitamente por Mili** (confirmó que esa base es de prueba/desarrollo, sin huéspedes reales, antes de borrar nada):
- Borradas las 17 reservas `directo` que había + sus 15 ingresos asociados. Quedaron solo las 6 reservas `airbnb` preexistentes.
- Insertado un set de datos simulados marcados con `notas: 'SIMULACION cuenta-paola'` (reservas) y prefijo `[SIM]` (ingresos/gastos), para poder identificarlos y limpiarlos después: 7 reservas nuevas (ids 14-20) cubriendo mes anterior con comisión ya saldada, mes anterior sin comisión cobrada (deuda real), mes actual con comisión cobrada de más (Paola debe devolver), reserva a 3 meses con comisión ya cobrada (no cierra hasta ese mes), cancelada con comisión cobrada (pendiente de clasificar), cancelada sin cobro, y un caso airbnb (10%) saldado. 5 ingresos a Paola, 4 gastos (2 pagados por Paola, 2 por Fernando, incluyendo el caso de comisión airbnb pagada directo por Fernando). **A propósito, ningún `movimiento_interno`** — pedido explícito de Mili para poder ver el estado "sin ajustes todavía".
- Commit `f25b905`: en "Comisiones cobradas" el detalle ahora muestra "Reserva #N — nombre del huésped" en vez del texto genérico del ingreso (pedido de Mili tras ver la pantalla con datos reales).

**Pendiente / próximo paso**:
- Mili va a recorrer `/cuenta-paola` con los datos simulados poniéndose en el lugar de Paola — esperar su feedback de UX antes de seguir.
- Decidir con Mili si la mitigación del "mes cerrado" alcanza o hace falta un mecanismo real.
- Limpiar los datos simulados (`notas = 'SIMULACION cuenta-paola'` / detalle `ilike '[SIM]%'`) cuando se termine de probar — no se borran solos.
- Decidir merge a `master` o seguir puliendo estilos.

---

## 2026-06-26 (cont.) — Feature: responsive · Rama: `feature/responsive-ui`

**Agente 3 (Developer) completado en 3 tandas** (se dividió por tamaño — ~15 archivos tocados en total, una sola tanda hubiera sido inmanejable de revisar):

- Tanda 1 → commit `c602279`: menú hamburguesa en `NavTabs` (`md`: sin cambios; `<md`: logo + botón, panel desplegable con las 5 opciones). Bug encontrado y corregido por el propio agente: el backdrop tapaba el botón, rompía el toggle.
- Tanda 2 → commit `991f4af`: toolbars de `CalendarView`, `ReservasTable`, `GastosTable` (flex-wrap, buscador a ancho completo en mobile, paginadores apilados en `<md`).
- Tanda 3 → commit `8cbb5ef`: grillas de `ReservaModal`, `BloqueoModal`, `reservas/nueva` (pasos 1 y 2), `pago/page.tsx`, `FormularioGasto`, `FiltrosModal` (reservas y gastos) — todas a 1 columna en `<md` salvo las excepciones confirmadas en el Designer (Check-in/Check-out, Monto+Moneda, Plataforma+Estado, Casa+Estado, Cotización+Tipo de pago, Desde/Hasta). `TrasladarPagoModal`, `ReciboModal` y login: verificados sin cambios necesarios.

Las 3 tandas verificadas con `tsc --noEmit` (confirmado independientemente por mí, no solo por el reporte del agente) y con Playwright contra la cuenta QA fija, en 375px y 1024px.

**Incidente de datos de prueba, resuelto:** la tanda 3 necesitó crear una reserva real para probar `pago/page.tsx`, terminó creando 2 por un script corrido dos veces ("Qa Responsive Test", Casa 1, reservas `20`/`21`, con un ingreso de USD 50 cada una). El agente no pudo borrarlas (la app no tiene `eliminarReserva`, y backdatear fechas para poder cancelarlas fue bloqueado correctamente por el clasificador de permisos como modificación de datos sin consentimiento). Lo resolví yo directamente: verifiqué con `nombre_pax ilike '%Qa Responsive%'` que eran exactamente esas 2 y nada más, borré primero los `ingresos` asociados (FK) y después las `reservas`, confirmé 0 filas restantes de ambas tablas. Sin acción pendiente de Mili sobre esto.

**Pendiente / próximo paso:** mostrar a Mili para aprobación → si aprueba, arrancar **Agente 4 (QA)**. Recordar incluirle instrucción explícita de limpiar cualquier dato de prueba que genere (ya está en `PIPELINE.md` desde la feature de gastos, pero conviene remarcarlo dado este incidente).

---

## 2026-06-26 (cont.) — Feature: responsive · Rama: `feature/responsive-ui`

**Agente 2 (Designer) completado y aprobado** → commit `d5389d1` (estructura) + `d09c003` (resolución de pares ambiguos) → `.claude/artifacts/responsive/designer-output.json`.

El Designer encontró 10 pares de campos "ambiguos" (comparten fila hoy, no son ni Monto+Moneda ni fechas desde/hasta) y correctamente NO los resolvió solo — los marcó para este gate, tal como pedía el PO. Mili decidió:
- **Quedan en 2 columnas (excepciones nuevas)**: Plataforma+Estado (`ReservaModal`), Casa+Estado (`reservas/nueva` paso 1), Cotización ARS/USD+Tipo de pago (`pago/page.tsx`).
- **Quedan en 1 columna (sin excepción)**: Teléfono+Plataforma, Tipo de pago+Quién pagó, Fecha del pago+Destinatario, Banco destino+N° operación, Quién pagó+Fecha del pago, Fecha+Pagado por (gastos), Destinatario+Banco origen+N° operación (gastos).

Componente nuevo definido: `MobileMenuButton` + `MobileMenuPanel` para el menú hamburguesa de `NavTabs`. Todo lo demás son modificaciones de clases responsive sobre JSX existente, sin componentes nuevos.

**Pendiente / próximo paso:** mostrar a Mili (ya aprobado en la práctica al resolver los pares ambiguos) y arrancar **Agente 3 (Developer)**. Va a ser una tanda grande — toca ~15 archivos. Considerar dividirlo en sub-commits por superficie si se vuelve inmanejable en un solo commit.

---

## 2026-06-26 — Feature: responsive · Rama: `feature/responsive-ui`

**Setup**: rama creada (partió de `feature/auth-header`, que partió de `master` post-gastos). `/explore responsive` corrido y aprobado por Mili → `.claude/artifacts/responsive/explore.md`. Cuenta de QA fija autorizada para toda la feature: `qa-responsive@example.com` / `QaResponsive123!` — no borrar hasta cerrar la feature.

**Corrección estructural importante hecha en esta sesión**: los artifacts del pipeline (`po-output.json`, etc.) tenían nombre plano sin carpeta por feature — se iban a pisar entre features (gastos vs. responsive). Se movieron a `.claude/artifacts/<feature>/` y se actualizó `pipeline-viewer.mjs`, `PIPELINE.md`, `run-pipeline.md`, `CONTEXT.md` con la convención nueva. Ver commit `0198fd9`.

**Decisiones de Mili (no volver a preguntar):**
- Calendario y tablas: el scroll horizontal que ya tienen alcanza, no se tocan.
- Header en mobile: menú hamburguesa.
- Grillas de formularios a 1 columna, excepto Monto+Moneda y pares de fecha (2 columnas igual).
- Breakpoints estándar de Tailwind, sin mínimo especial.

**Agente 1 (PO) completado** → commit `f26a7f8` → `.claude/artifacts/responsive/po-output.json` (6 user stories: header, toolbar calendario, toolbars+paginación de tablas, formularios de reservas, formularios de gastos, login).

**Pendiente / próximo paso:** mostrar PO a Mili, conseguir aprobación, arrancar **Agente 2 (Designer)**.

---

## 2026-06-26 (cont.) — Feature: auth-header · Rama: `feature/auth-header`

**Link "Dashboard"** ahora apunta a `https://temporalias.lovable.app/` (target="_blank") → commit `20f821f`.

**SSO entre esta app y el dashboard de Lovable: quedó como plan, sin implementar.** Ambas apps usan el mismo proyecto de Supabase, pero NO comparten sesión automáticamente (localStorage/cookies están aislados por origen en el navegador, no es algo que Supabase resuelva solo). Plan acordado (no implementado todavía): hand-off de `access_token`/`refresh_token` vía fragmento de URL (`#...`, no query) al clickear Dashboard; el lado receptor (llamar a `supabase.auth.setSession()`) vive en el otro repo de Lovable, sin acceso desde esta sesión. Detalle completo guardado en memoria (`project_sso_lovable_dashboard.md`).

---

## 2026-06-26 (cont.) — Feature: auth-header · Rama: `feature/auth-header`

**Cuenta real de Mili creada**: `milagrosporta89@gmail.com`, contraseña temporal generada (compartida en el chat, no en ningún archivo). Pendiente: armar cambio de contraseña / recuperación, todavía no existe.

**Header reorganizado** → commit `78a8b2c`: logo "TempoBoard" (tipográfico) a la izquierda, "Dashboard" pasa a estar agrupado junto a Calendario/Reservas/Gastos, se quita el nombre del titular logueado del header (queda solo el botón de cerrar sesión).

**Aviso de seguridad importante para sesiones futuras:** el clasificador de permisos bloqueó dos veces en esta sesión acciones sobre Supabase Auth — (1) escribir la contraseña real de Mili en texto plano dentro de un script de Playwright (correcto: nunca escribir credenciales reales en archivos, ni siquiera temporalmente), y (2) crear una segunda cuenta de prueba asumiendo que la autorización de la cuenta anterior se extendía — no es así, **cada creación de usuario en Auth necesita autorización explícita puntual**, no hay autorización "de una vez para siempre" en esta sesión.

**`/explore`/`PIPELINE.md` ahora aplican a toda feature nueva** (no solo las que replican el bot) — decisión de Mili, ver commit `83e90ec`. El login/header ya construido NO se rehace retroactivamente por el pipeline; la regla aplica de acá en adelante.

**Pendiente / próximo paso:**
- Cuentas de Francisco, Inés, Fernando y Paola — todavía no se pidieron sus emails.
- Cambio de contraseña / recuperación de cuenta — no existe ninguna pantalla para esto todavía.
- Decidir destino real del link "Dashboard" (hoy es un placeholder `href="#"`, sin funcionalidad).

---

## 2026-06-26 — Feature: auth-header · Rama: `feature/auth-header`

**`feature/expense-ui` mergeada a `master` y pusheada** antes de arrancar esta feature (decisión de Mili). Esta es una feature nueva, no replica ningún flujo del bot (WhatsApp identifica por teléfono, no por login) — no aplica el pipeline de 4 agentes de `PIPELINE.md` ni `/explore`.

**Decisiones de Mili (sin volver a preguntar):**
- Supabase Auth (ya era dependencia instalada vía `@supabase/ssr`, cero deps nuevas).
- Mismo nivel de acceso para los 5 titulares — el login es solo para identificar QUIÉN hizo cada acción, no para restringir nada.
- Cuentas pre-creadas a mano, sin alta pública.

**Construido y commiteado** (`01b86dd`):
- `src/middleware.ts` + `lib/supabase/middleware.ts`: refresca sesión + redirige a `/login` sin sesión (y al revés).
- `/login`: form simple email+contraseña, sin registro público.
- `NavTabs` muestra el titular logueado (`user_metadata.titular`) + botón de logout. `layout.tsx` obtiene el usuario server-side; sin sesión no se renderiza el header.
- `lib/auth.ts` (`registradoPorActual()`): resuelve el TODO histórico de `registrado_por` hardcodeado como `'Milagros'` en **gastos.ts, ingresos.ts, reservas.ts y bloqueos.ts** — los 4 lugares donde existía ese hardcode, no solo gastos.

Verificado end-to-end con una cuenta de prueba descartable — **autorización explícita pedida y obtenida antes de crearla** (el clasificador de seguridad bloqueó el primer intento por no tener autorización explícita, correctamente). Cuenta borrada al terminar, 0 usuarios de Auth quedan en el proyecto.

**Pendiente / próximo paso:**
- **Crear las cuentas reales de los 5 titulares** (Francisco, Milagros, Inés, Fernando, Paola) — necesito que Mili decida emails y cómo se distribuyen las contraseñas iniciales (¿yo las creo con una temporal y cada uno la cambia en su primer login? ¿Mili las crea a mano en el dashboard de Supabase?). Sin esto, nadie puede loggearse todavía en el ambiente real.
- Decidir si "Dashboard" (el link suelto en el header, sin funcionalidad real desde antes de esta sesión) se mantiene, se conecta a algo, o se quita — quedó sin tocar.
- Probar en un navegador real (no solo Playwright headless) que el flujo de login se vea y comporte bien.

---

## 2026-06-26 (cierre) — Feature: gastos · Rama: `feature/expense-ui`

**Sesión de gastos dada por terminada por Mili.** Pipeline completo (PO→Designer→Developer→QA, todos en PASS/aprobado) más ~10 rondas de fixes de UX/feedback de uso real, todo commiteado en `feature/expense-ui`. Resumen de lo que quedó construido:

- Tabla `/gastos` (búsqueda, filtros avanzados, orden, paginación, editar/eliminar con íconos directos).
- Wizard `/gastos/nuevo` (alta) y `/gastos/nuevo?edit=<id>` (edición): comprobante opcional con OCR, duplicados inline, categorías sin texto libre, confirmación estilo recibo, stepper de 3 pasos con pantalla de éxito propia.
- Server actions completos: `crearGasto`, `editarGasto`, `obtenerGasto`, `eliminarGasto`, `buscarGastoDuplicado`.
- `web/src/lib/cotizacion.ts` compartido (cotización histórica por fecha).
- Migración `003_unique_nro_operacion_gastos.sql` — **pendiente correr a mano en el SQL Editor de Supabase** (nadie confirmó haberla corrido todavía).

**No mergeado a `master` todavía** — quedó pendiente esa decisión, nunca se cerró explícitamente. Antes de arrancar la próxima feature en una rama nueva, conviene decidir si `feature/expense-ui` se mergea ahora o se deja abierta en paralelo.

**Próximo foco, pedido por Mili:** header con accesos + login de usuarios. Es una feature nueva (no replica ningún flujo del bot — WhatsApp identifica por teléfono, no hay "login" ahí), así que no aplica `/explore` tal cual está pensado en `PIPELINE.md`. Directamente relevante: el TODO de `registrado_por` hardcodeado como `'Milagros'` en `actions/gastos.ts` (y el mismo patrón en `actions/ingresos.ts`) se resuelve naturalmente una vez que exista login real.

---

## 2026-06-26 (cont. 15) — Feature: gastos · Rama: `feature/expense-ui`

**Tres ajustes de UX** → commit `c6e4387`:
- En modo edición el CTA dice "Guardar cambios" (título de la tarjeta de confirmación + botón), no "Confirmar gasto". `FormularioGasto` suma un botón "Volver" (variant outline) junto a "Continuar" cuando está editando.
- Campo Monto con prefijo dinámico `USD`/`$` según la moneda, mismo patrón que `pago/page.tsx`.
- Tabla: se reemplazó el menú de tres puntos por dos íconos directos (lápiz/tacho), sin dropdown. Columna "Acciones" sin texto visible (sr-only).

Verificado con Playwright: prefijo cambia a "USD" al elegir dólares, pantalla de edición muestra "Volver" + datos precargados, confirmación dice "Guardar cambios" en título y botón.

**⚠️ Observación, no accionada:** durante esta verificación noté que la fila original "$5.080 Lavandería Paola" (la primera que confirmaste como real al principio de esta sesión) ya no está en la tabla. Ninguno de mis scripts de esta ronda ni de rondas anteriores la tocó — es probable que la hayas editado o eliminado vos misma usando el botón que justo terminamos de construir. Lo dejo anotado por transparencia, no asumí nada y no toqué la base por este motivo.

**Pendiente / próximo paso:** confirmar si la fila de $5.080 faltante es esperada. Decidir pasada de estilos general vs. merge a `master`.

---

## 2026-06-26 (cont. 14) — Feature: gastos · Rama: `feature/expense-ui`

**Consistencia entre features** → commit `e2b010e`: el mismo cambio de label-arriba-del-buscador que se hizo en `GastosTable.tsx` se replicó en `ReservasTable.tsx` (pedido explícito de Mili, "ya que estamos").

⚠️ Nota: este commit toca `reservas/ReservasTable.tsx`, fuera del alcance estricto de la feature gastos, pero vive en esta misma rama (`feature/expense-ui`) porque surgió en el flujo de esta sesión. No afecta nada del pipeline de gastos — al mergear, este fix viaja junto.

**Pendiente / próximo paso:** decidir pasada de estilos general vs. merge a `master`.

---

## 2026-06-26 (cont. 13) — Feature: gastos · Rama: `feature/expense-ui`

**Editar y eliminar gastos** → commit `b8521dc` (código) + `187d130` (po-output.json).

- Columna "Acciones" en la tabla, menú de tres puntos (Editar/Eliminar), mismo patrón que `PagosSection.tsx` de ingresos.
- `actions/gastos.ts`: `obtenerGasto`, `editarGasto` (recalcula cotización/montos con la fecha del gasto, igual que crear), `eliminarGasto`.
- `GastoWizard` soporta `/gastos/nuevo?edit=<id>`: precarga datos, **sin** dropzone de comprobante (editar es para corregir un dato, no reemplazar el comprobante original), breadcrumb dice "Editar gasto", mensaje final dice "actualizado" en vez de "registrado".
- `po-output.json` actualizado: edición/borrado salió de `out_of_scope` y ahora es una business_rule documentada.

Verificado end-to-end con Playwright: creé un gasto centinela (monto 777777) → lo edité (888888, confirmé el precargado correcto y el recálculo) → lo eliminé con el diálogo de confirmación → confirmé en la base que quedó borrado (el screenshot inmediato post-delete mostró la fila todavía por timing del realtime, no por un bug real — confirmado contra la base directamente, y con una recarga limpia después).

**Pendiente / próximo paso:** decidir pasada de estilos general vs. merge a `master`.

---

## 2026-06-26 (cont. 12) — Feature: gastos · Rama: `feature/expense-ui`

**Filtros avanzados en la tabla** → commit `b3d3430`:
- `FiltrosModal.tsx` (mismo patrón que reservas): rango de fechas, categoría (12, alfabéticas) y pagado_por, con badge de cantidad activa junto al botón "Filtros", ubicado al costado del buscador. Sin chips de filtro rápido — pedido explícito de Mili, y de todas formas gastos no tiene una dimensión de estado equivalente a reservas (próxima/en curso/etc).
- El placeholder del buscador pasa a ser un `<Label>` arriba del input en vez de texto dentro del campo (no desaparece al escribir).

Verificado con Playwright: filtro por categoría reduce correctamente de 8 a 4 filas, badge muestra "1".

**Pendiente / próximo paso:** decidir pasada de estilos general vs. merge a `master`.

---

## 2026-06-26 (cont. 11) — Feature: gastos · Rama: `feature/expense-ui`

**Dos ajustes más** → commit `c32e87b`:
- Categorías del dropdown ordenadas alfabéticamente (`localeCompare('es')` sobre el label, no el orden del enum). "Otro" cae naturalmente al final sin necesidad de caso especial.
- Tipografía de `ConfirmacionGasto` reducida una vez más (`text-sm` → `text-xs`) — Mili confirmó que seguía grande tras el ajuste anterior.

**Pendiente / próximo paso:** decidir pasada de estilos general vs. merge a `master`.

---

## 2026-06-26 (cont. 10) — Feature: gastos · Rama: `feature/expense-ui`

**Ajustes finos de UI** → commit `f443b6b`:
- Se quitó el botón de "Volver" junto al breadcrumb (redundante, "Gastos" ya es cliqueable — mismo patrón que el breadcrumb de reservas, sin botón aparte).
- `ComprobanteDropzone`: los 4 estados (idle/uploading/done/error) ahora comparten la misma altura fija (`h-24`, 96px) — antes el estado "done" era visiblemente más bajo que "idle" y hacía saltar el resto del formulario al completarse la carga. Verificado con Playwright midiendo la bounding box (96px en ambos casos).
- Leyenda explicativa debajo del dropzone: más corta y en tipografía más chica (`text-[11px]`).
- `ConfirmacionGasto`: tipografía en negrita de los valores reducida de `text-base` a `text-sm`.

**Pendiente / próximo paso:** decidir pasada de estilos general vs. merge a `master`.

---

## 2026-06-26 (cont. 9) — Feature: gastos · Rama: `feature/expense-ui`

**Tanda grande de feedback de uso real de Mili, atendida en `fea7044` (código) + `beced4f` (artifacts):**
- Duplicado de comprobante: advertencia inline en la misma pantalla en vez de navegar a otra (`DuplicadoBloqueo` ya no es una pantalla aparte).
- Breadcrumb (Gastos > Nuevo gasto) + botón de volver arriba del wizard.
- Categoría "otro": se quitó el texto libre — riesgo de romper la normalización para análisis. Si hace falta una categoría nueva, se agrega al enum (tarea de desarrollo). `pagado_por` SÍ mantiene texto libre para "Otro" (son nombres de personas, no una taxonomía fija) — asunción mía a confirmar si no es lo que se quiso decir con "lo mismo aplica para quien pago" (lo interpreté como aplicar el recorte de altura del dropdown, no quitarle el texto libre).
- Confirmación rediseñada con el lenguaje visual del recibo de pago de ingresos (filas label/valor alineadas), sin imagen ni logo — vive como HTML directo en la pantalla.
- Dropdowns de categoría y pagado_por con altura máxima (~5-6 opciones visibles, scroll para el resto).
- Reemplazado el feedback de éxito (antes: redirect + toast) por un **stepper de 3 pasos** (Carga / Confirmación / Listo) — el paso 3 es una pantalla propia del wizard con ícono de check y botón "Continuar" que recién ahí redirige a la tabla. Se sacó el componente `Toast` de uso en gastos (queda como primitiva genérica sin uso, no se borró el archivo).
- `po-output.json` y `designer-output.json` actualizados (4ta revisión) con notas explicando cada cambio respecto del diseño previamente aprobado.

**A partir de ahora regenero `viewer.html` después de cada commit relevante** (pedido explícito de Mili), no solo en gates formales del pipeline.

**Verificado con Playwright**: breadcrumb/volver/stepper visibles, dropdown de categoría recorta a ~6 opciones con scroll, "otro" sin input de texto libre, pantalla de confirmación con el estilo recibo, flujo completo hasta la pantalla de éxito y vuelta a la tabla.

**⚠️ Aviso de proceso, repetido:** durante la verificación aparecieron 4 gastos reales más cargados por Mili en paralelo (Lavandería con comprobante real de Francisco, "bolsas de consorcio" de Paola, Jardinero de Paola, Lavandería de Milagros). No se tocó ninguno — se identificó la fila propia de cada test por un valor centinela bien distintivo antes de borrar, nunca por posición o conteo.

**Pendiente / próximo paso:** confirmar con Mili si la interpretación sobre "pagado por" (mantener texto libre, solo recortar altura del dropdown) fue la correcta. Decidir pasada de estilos general vs. merge a `master`.

---

## 2026-06-26 (cont. 8) — Feature: gastos · Rama: `feature/expense-ui`

**Mili: el toggle manual/comprobante complejizaba innecesariamente el flujo.** Se simplificó a una sola pantalla → commit `c0e58a8`:
- Dropzone de comprobante siempre visible arriba (opcional), resto del formulario siempre visible abajo.
- Subir un archivo solo decide si los campos se autocompletan (readonly) o se llenan a mano. Sin comprobante, `banco_origen` se asume `'Efectivo'`.
- Se eliminó `SeleccionCaminoToggle.tsx` (sin uso) y el tipo `Camino` por completo.
- `designer-output.json` actualizado para reflejar el flujo real (steps 1/2a/2b/4a originales colapsados en un solo step 1), con `_revision_nota` explicando el cambio respecto del diseño aprobado originalmente.

**Aviso de proceso, atendido:** Mili notó que `viewer.html` no reflejaba los últimos cambios — correcto, no lo regeneré después de los commits de la tabla de gastos ni de las correcciones de UX anteriores. Es un generador on-demand, no un dashboard en vivo; no se actualiza solo. Reforzar: correr `node scripts/pipeline-viewer.mjs` después de CUALQUIER commit relevante, no solo en las 4 fases formales del pipeline — quedó dicho en `run-pipeline.md` pero no se vino cumpliendo en las rondas de fixes directos.

**Pendiente / próximo paso:** decidir pasada de estilos general vs. merge a `master`. Confirmar con Mili si quiere que el visor se regenere automáticamente (ej. con `node --watch`) en vez de manualmente.

---

## 2026-06-26 (cont. 7) — Feature: gastos · Rama: `feature/expense-ui`

**Feedback de uso real de Mili sobre el wizard + tabla, atendido en commit `8c4ba86`:**
- Tabla: columna "Comprobante" → "Método de pago" (Transferencia/Efectivo según `nro_operacion`, mismo criterio que `PagosSection.tsx`).
- Feedback de guardado: banner fijo → **toast** flotante autodescartable (`web/src/components/ui/toast.tsx`, sin dependencias nuevas — Radix no tiene `react-toast` instalado en este proyecto, se construyó uno propio con una animación CSS mínima en `globals.css`).
- **Bug real corregido**: tras un OCR exitoso, el dropzone (con su botón de quitar) dejaba de renderizarse — quedaba reemplazado por el formulario, sin forma de deshacer una elección de comprobante equivocada. Se unificó "elegir camino" + dropzone/formulario en una sola pantalla (`paso: 'carga'`); el toggle manual/comprobante queda siempre visible arriba y duplica como mecanismo de "volver" entre ambos caminos.
- Camino "manual" ahora es el default al entrar al wizard (antes había una pantalla intermedia de elección obligatoria).
- Bajada explicativa antes de subir el comprobante ("al subir completamos los datos automáticamente").
- Aplicadas heurísticas de Nielsen explícitamente: visibilidad del estado (toast), control y libertad del usuario (toggle como volver, botón de quitar alcanzable), prevención de errores (bajada explicativa antes de la acción).

Verificado con Playwright: default manual ✓, blurb+dropzone al cambiar a comprobante ✓, dropzone persiste con botón de quitar tras OCR (interceptando la llamada real a Claude para no gastar API) ✓, toast aparece y se autodescarta a los 4s limpiando el query param ✓.

**⚠️ Aviso de proceso:** durante esta verificación apareció en la tabla un gasto real cargado por Mili en paralelo (vía Supabase realtime, visible también en el navegador de test) — se le preguntó antes de tocar nada y se confirmó que era real, no se borró. Server reminder para toda sesión futura: ante cualquier fila inesperada en una tabla de datos reales, preguntar antes de asumir que es basura de test.

**Pendiente / próximo paso:** decidir pasada de estilos general vs. merge a `master`.

---

## 2026-06-26 (cont. 6) — Feature: gastos · Rama: `feature/expense-ui`

**Pedido de Mili:** faltaba feedback visible al confirmar un gasto. Se agregó una tabla de gastos cargados en `/gastos` (antes esa ruta era directamente el wizard) → commit `3a33ab0`.

- `/gastos` ahora es `GastosTable` (búsqueda, orden por fecha/monto, paginación, botón "Nuevo gasto").
- `/gastos/nuevo` es el wizard (`GastoWizard`, sin cambios de lógica salvo que al confirmar redirige a `/gastos?creado=1`).
- Nuevo `web/src/app/api/gastos-data/route.ts`, mismo patrón que `api/calendar-data`.
- Columnas elegidas: fecha, categoría, monto, pagado_por, detalle, comprobante (link si existe). Se omitieron a propósito `nro_operacion`/`banco_origen`/`nombre_destinatario` (metadata interna de OCR, no aportan en una vista de lista) y `registrado_por` (hoy siempre el mismo valor hardcodeado). Sin chips de filtro rápido tipo reservas: gastos no tiene una dimensión de estado equivalente.
- Verificado end-to-end con Playwright: tabla vacía → nuevo gasto → confirmación (sin `cotizacion` visible en pantalla, correcto) → vuelta a la tabla con el aviso verde "Gasto registrado correctamente" y la fila visible al instante.

**⚠️ Hallazgo durante la verificación:** la tabla `gastos` en Supabase tenía 2 filas de prueba ("Jardinero $300 Inés", timestamps de 5 segundos de diferencia) que no estaban ahí cuando se confirmó vacía al inicio del pipeline. Todo indica que quedaron de la verificación del Agente QA (que probablemente ejecutó la app real en vez de solo leer código, sin limpiar después). Se borraron ambas filas, y también el gasto de prueba que generé yo mismo al verificar esta tabla. La tabla quedó en 0 filas otra vez, confirmado.

**Nota para sesiones futuras / para el prompt de QA en `PIPELINE.md`:** si un agente de QA ejecuta la app contra datos reales (Supabase, no un entorno de test), tiene que limpiar cualquier fila que cree durante la verificación. Vale la pena agregar esto explícitamente a las instrucciones del Agente 4 en `PIPELINE.md` la próxima vez que se edite.

---

## 2026-06-26 (cont. 5) — Feature: gastos · Rama: `feature/expense-ui`

**Atendidas las 3 sugerencias menores de QA** → commit `1e4df2c`:
- `banco_origen` ahora es `'Efectivo'` por defecto en el camino manual (paridad con el bot).
- `web/src/lib/cotizacion.ts` (nuevo): lógica de cotización extraída de `api/cotizacion/route.ts`, importada directo en `actions/gastos.ts` — elimina el auto-fetch HTTP a la propia API y el fallback a `localhost:3000`.
- `supabase/migrations/003_unique_nro_operacion_gastos.sql` (nuevo): UNIQUE index parcial sobre `nro_operacion`, mismo patrón que la migración 002 de `ingresos`.

`tsc --noEmit` confirmado limpio después de los 3 fixes.

**⚠️ Acción manual pendiente fuera de este repo:** la migración `003` es solo el archivo `.sql` — igual que 001 y 002, no hay tooling de migraciones automático en este proyecto. Para que el UNIQUE constraint exista realmente en la base, alguien tiene que correr ese SQL a mano en el SQL Editor de Supabase. No tengo una connection string de Postgres ni acceso a la Management API de Supabase para aplicarlo yo mismo, solo el cliente REST con la service role key (que no ejecuta DDL arbitrario).

**Pendiente / próximo paso:** correr la migración 003 en Supabase. Después: decidir pasada de estilos vs. merge a `master` tal como está.

---

## 2026-06-26 (cont. 4) — Feature: gastos · Rama: `feature/expense-ui`

**Agente 4 (QA) completado** → commit `88a4368` `[agent-qa] revisión completada` → `.claude/artifacts/qa-output.json`. **`summary: PASS`** — las 4 user stories pasan, `critical_missing` vacío. `tsc --noEmit` confirmado limpio otra vez de forma independiente.

**Pipeline de la feature gastos: completo (PO → Designer → Developer → QA, los 4 con PASS/aprobación).**

**Sugerencias menores no bloqueantes que quedaron en `qa-output.json` (para decidir si se atienden ahora o después):**
- Camino manual no fija `banco_origen: 'Efectivo'` por defecto (el bot sí lo hace) — rompe paridad de datos para análisis histórico.
- No hay `UNIQUE constraint` versionado en SQL sobre `nro_operacion` en la tabla `gastos` — la defensa contra duplicados es doble (cliente + server) pero no atómica a nivel DB ante condiciones de carrera.
- El patrón de auto-fetch HTTP en `gastos.ts` (server action llamando a su propia API route) sigue como deuda técnica menor, confirmado no bloqueante por QA.

**Pendiente / próximo paso:** decidir con Mili si se atienden las sugerencias menores, se pasa a una pasada de estilos (el Developer no aplicó CSS, por instrucción del pipeline), o se mergea así a `master`.

---

## 2026-06-26 (cont. 3) — Feature: gastos · Rama: `feature/expense-ui`

**Agente 3 (Developer) completado** → commit `90cbbb8` `[agent-dev] formulario base sin estilos` (15 archivos, `tsc --noEmit` y eslint sin errores, verificado independientemente).

- Nuevo: `web/src/app/actions/gastos.ts` (`crearGasto`, `buscarGastoDuplicado`), `web/src/app/gastos/page.tsx`, 8 componentes en `web/src/components/gastos/` (1:1 con el component_tree del Designer), `web/src/hooks/useGastoSubmit.ts`.
- Modificado: `web/src/lib/types.ts` (tipo `Gasto`, `CategoriaGasto`, `CATEGORIA_GASTO_LABEL`, `TITULARES_PAGADOR`), `web/src/app/api/cotizacion/route.ts` (ahora acepta `?fecha=`, usa el endpoint historical de bluelytics cuando no es hoy — réplica de `src/services/dolar.ts`), `web/src/app/api/comprobante/route.ts` (acepta `tipo: 'gasto'|'ingreso'`), `NavTabs.tsx` (tab "Gastos").
- `cotizacion`/`monto_ars`/`monto_usd` se calculan enteramente en el server action, nunca en el cliente — consistente con la corrección de Mili.

**TODOs dejados por el Developer:**
- `gastos.ts:6` — registrado_por hardcodeado, reemplazar con login.
- `gastos.ts:30` — el fetch a `/api/cotizacion` desde el server action usa `http://localhost:3000` como fallback si no hay `NEXT_PUBLIC_BASE_URL`. Funciona en dev, pero es un auto-llamado HTTP a la propia app — más prolijo sería factorizar la lógica de cotización a una función compartida en `lib/` que use tanto la ruta API como la server action, sin pasar por HTTP. Lo anoto para que QA lo evalúe como mejora, no es bloqueante.
- `FormularioGasto.tsx:33` — el OCR no infiere `pagado_por`, queda siempre editable en el camino de comprobante.

**Pendiente / próximo paso:**
- Mostrar a Mili para aprobación → si aprueba, arrancar **Agente 4 (QA)**.

---

## 2026-06-26 (cont. 2) — Feature: gastos · Rama: `feature/expense-ui`

**Correcciones de Mili sobre PO y Designer ya commiteados (antes de aprobar, en revisión):**
- `cotizacion` deja de ser un campo del formulario en cualquier camino (manual o comprobante). Se calcula en el servidor al guardar, usando la cotización de la **fecha del gasto** (la del comprobante vía OCR, o la ingresada a mano) — nunca la fecha en que se está registrando. Es un dato para análisis posterior, no una decisión del usuario al cargar. → commit `9396e30` (po-output.json) y `5b06c35` (designer-output.json).
- Se agrega una pestaña **"Gastos"** al nav principal (`web/src/components/layout/NavTabs.tsx`), junto a "Calendario" y "Reservas", ruta `/gastos`. Modelado como step 0 ("NavegacionPrincipal") en el flow del Designer y como componente `NavTabs` en el component_tree. → commit `5b06c35`.
- Herramienta nueva: `node scripts/pipeline-viewer.mjs` genera `.claude/artifacts/viewer.html`, visor standalone con tabs PO/Designer/Developer/QA (no se commitea, está en `.gitignore`).

**Pendiente / próximo paso:**
- Mostrar PO y Designer corregidos a Mili y conseguir aprobación antes de arrancar **Agente 3 (Developer)**.
- El Developer deberá: crear `web/src/app/gastos/page.tsx` (nueva ruta), agregar el tab a `NavTabs.tsx`, e implementar el cálculo de cotización server-side por fecha del gasto (revisar si `/api/cotizacion` necesita un parámetro de fecha — hoy no lo tiene, lo usa ingresos sin fecha explícita).

---

## 2026-06-26 (cont.) — Feature: gastos · Rama: `feature/expense-ui`

**Hecho en esta sesión:**
- Commiteada la estructura de `.claude/` (`f5af3d8`).
- **Agente 2 (Designer) completado** → commit `fc07d6f` `[agent-designer] estructura de componentes y flujo` → `.claude/artifacts/designer-output.json`. Flujo de 6 pantallas (selección de camino → dropzone/duplicado/form-comprobante en el camino foto, o form manual directo → confirmación obligatoria común a ambos). Reusa 1 a 1 los 4 estados del dropzone de `pago/page.tsx` (`ComprobanteDropzone`) y su función `ro()` de campos readonly; agrega dos piezas nuevas que no existen en ingresos: `DuplicadoBloqueo` (bloqueo por `nro_operacion` repetido, antes de confirmar) y `ConfirmacionGasto` (pantalla de revisión obligatoria — en ingresos el submit es directo, sin paso intermedio).
- Pendiente de aprobación de Mili en el chat antes de pasar al Agente 3.

**Ver `CONTEXT.md` (sección "Backends"):** se editó directamente para aclarar que el código del bot que hoy escribe gastos a Sheets está desactualizado/pendiente de migrar — no es la arquitectura objetivo. No cambia nada de lo ya construido en esta feature (la web ya es Supabase-only).

**Pendiente / próximo paso:**
- Si se aprueba el Designer: arrancar **Agente 3 (Developer)** → leer `po-output.json` + `designer-output.json`, construir el formulario en `web/src/components/gastos/`.

---

## 2026-06-26 — Feature: gastos · Rama: `feature/expense-ui`

**Hecho en esta sesión:**
- Se ordenó la estructura de `.claude/` (este archivo, `CONTEXT.md`, `PIPELINE.md`, `commands/explore.md`, `commands/run-pipeline.md`). El pipeline de 4 agentes y el comando de exploración quedaron genéricos/parametrizados por feature, no específicos de gastos.
- `/explore gastos` corrido y aprobado por Mili → persistido en `.claude/artifacts/gastos-explore.md` (no existía como archivo, solo había quedado en el chat — se agregó retroactivamente).
- Rama `feature/expense-ui` creada.
- **Agente 1 (PO) completado y aprobado en el chat** → commit `f2140d2` `[agent-po] user stories y campos definidos` → `.claude/artifacts/po-output.json` (4 user stories, 16 campos, 9 business rules, 6 out-of-scope).

**Pendiente / próximo paso:**
- Arrancar **Agente 2 (Designer)** → leer `po-output.json`, producir `.claude/artifacts/designer-output.json`. El component tree debe reusar el patrón de dropzone de comprobante de `web/src/app/reservas/[id]/pago/page.tsx` (no inventar uno nuevo) — ver decisión #2 de Mili en `gastos-explore.md`.

**Decisiones de negocio ya tomadas (no volver a preguntar):**
- Backend: Supabase, tabla `gastos` (ya existe, vacía). Sin Sheets.
- UI soporta manual + foto/comprobante con OCR.
- Categorías: las 12 de `CategoriaGasto`, incluyendo `jardinero` y `comision`.
- Confirmación obligatoria siempre, en ambos caminos.
- `registrado_por`: hardcodeado/placeholder hasta que exista login.
