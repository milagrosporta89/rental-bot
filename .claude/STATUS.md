# Status — log de sesiones

Entradas nuevas arriba. No se borran las viejas.

---

## 2026-07-01 — Producción · Rama: `master`

**Sesión de puesta en producción.** Todo mergeado a `master` antes de arrancar (PR #2 cerrado en esta sesión).

**Lo que se hizo:**
- `/explore produccion` corrido → `.claude/artifacts/produccion/explore.md`. Hallazgo clave: migraciones 004-007 no estaban en prod, tabla `movimientos_internos` no existía, datos históricos de gastos/ingresos de Paola (marzo-junio) iban a contaminar cuenta-paola.
- **Migraciones 004-007 corridas en prod** (SQL Editor de Supabase) por Mili.
- **`schema.sql` baseline** creado en `supabase/schema.sql` — equivale a correr las 7 migraciones desde cero, para nuevos entornos.
- **`.env.local` → prod** (`klkysntjfnrrbnkjzzdy.supabase.co`). Scripts `use:staging` / `use:prod` ya existían en `package.json`.
- **Filtro de fecha de corte** en `/api/cuenta-paola-data`: gastos e ingresos con `fecha < 2026-07-01` se excluyen del cálculo de cuenta-paola pero siguen en la base para cruce de rentabilidad a fin de año.
- **Flujo de restablecimiento de contraseña**: `/forgot-password` + `/reset-password` + link en LoginForm. Bug PKCE encontrado y corregido: `resetPasswordForEmail` tiene que correr en el browser (no en server action) para que el code verifier y el `exchangeCodeForSession` compartan la misma cookie jar.
- **Deploy en Vercel** → `https://temporalias.vercel.app`. Root Directory = `web`. `STORAGE_BASE_URL` vacío (OCR funciona, storage de archivos deshabilitado por ahora).
- **4 cuentas de Auth en prod**: Milagros, Francisco, Fernando, Paola (Inés sin cuenta por ahora). `user_metadata.titular` seteado vía SQL (`UPDATE auth.users SET raw_user_meta_data = '{"titular":"..."}'::jsonb`). El `||` jsonb falló porque `raw_user_meta_data` era NULL — hay que setear directo, no hacer merge.
- **Historial de auditoría**: quitada la entrada `campo='creacion'` de reservas (redundante con `registrado_por`+`timestamp`). Agregado historial a `editarGasto` (campo por campo), `eliminarGasto` (resumen) y `editarEstadoReserva`.

**Pendiente / próximo paso:**
- Configurar SMTP propio en Supabase (Resend u otro) para eliminar el rate limit de emails de auth — con el rate limit de Supabase gratis no se puede probar el flujo de reset en producción.
- Contraseña temporal `Temporalias2026!` — avisarle a Francisco, Fernando y Paola para que entren y la cambien con "¿Olvidaste tu contraseña?" (una vez resuelto el SMTP).
- Redirect URL en Supabase ya configurada (`https://temporalias.vercel.app/reset-password`).
- Storage de comprobantes: `STORAGE_BASE_URL` vacío en prod — OCR extrae datos pero no guarda el archivo. Pendiente migrar a Supabase Storage si hace falta.
- La pregunta de "saldo inicial con Paola" (opening balance para el corte de julio) quedó sin implementar — ver análisis en la sesión anterior.

---

## 2026-06-29 — Feature: cuenta-paola · Rama: `feature/cuenta-paola`

**Migraciones `006` y `007` confirmadas corridas por Mili.** Reset de datos repetido (la app bloquea crear reservas de prueba con `fecha_entrada` anterior a hoy desde la UI — esperable, es la validación real de `crearReserva`; el camino para datos simulados sigue siendo inserción directa vía REST, no la UI). Se encontraron y borraron filas extra respecto del último reset (14 reservas/13 ingresos/25 gastos/4 movimientos en vez de 13/12/23/2) — quedaron de intentos de Mili probando la UI manualmente antes de pegar con la validación.

Mismo dataset que el reset anterior, reconstruido con los campos nuevos:
- Gastos de comisión (`GAS-com-*`) ahora con `id_reserva` poblado (1, 3, 4, 7, 8, 12, 13).
- Movimientos históricos con `cuenta_origen: 'Fernando'`.
- Corregido de paso un error aritmético que tenía el cierre histórico de comisión desde el reset anterior ($6,90 en vez de $6,10 — el 10% real de la reserva #13 es $103,90, no $103,70).

Verificado con script independiente: comisión pendiente $150, gastos pendientes $727,03, total $877,03 — igual que antes del reset, confirmando que el modelo "desde el último cierre" es estable.

**Quita el total de "Movimientos de ajuste"** → commit `48750cd`: mezclaba sentidos opuestos (a_favor_paola y a_favor_negocio) sin considerar el signo, la suma no representaba nada real.

**Tema grande para retomar, sin tocar código todavía** — escenario planteado por Mili: Fernando (quien transfiere para saldar la deuda del negocio con Paola) viaja mucho y a veces no se lo puede contactar. Si Paola necesita esa plata y no puede esperar, se cobra de más en la próxima reserva que entra para hacerse de parte de lo que le deben. Al día siguiente Fernando se pone al día con el balance sin saber que ella ya se autopagó → Paola cobra dos veces.

Mi análisis (compartido con Mili en el chat, no implementado):
- No es un problema que el modelo de datos resuelva solo — si Fernando transfiere sin mirar la app antes, va a pasar igual. Lo que el sistema sí puede hacer es que el autopago de Paola se vea reflejado en el saldo pendiente **en el momento en que ocurre**, no recién en el próximo "Cerrar cuenta" — así se achica la ventana de error.
- La idea de Mili de usar "Comisiones cobradas por adelantado" (reservas futuras) para esto tiene una vuelta de tuerca: esa tabla se diseñó a propósito para NO compararse contra nada hasta que la reserva termine (por las cancelaciones). Si el excedente que Paola se autopaga queda escondido ahí dentro, queda invisible justo donde Fernando necesita verlo. Mejor: separar el excedente de lo que le corresponde a esa reserva puntual, y registrarlo de una como un movimiento explícito que baja el saldo pendiente ya — la reserva futura sigue su curso normal con su 15%/10% real, sin el excedente mezclado.
- **Limitación de fondo encontrada pensando esto**: el modelo "desde el último cierre" asume que cada cierre liquida TODO lo pendiente de una sola vez (mueve un corte de fecha único por tipo). No está resuelto cómo registrar un pago *parcial* (Paola cobra una parte de la deuda, no toda) sin romper esa lógica de "todo lo de antes de esta fecha ya está saldado". Posible necesidad: una forma de marcar "se saldó una parte" sin mover el corte completo, o repensar el modelo de corte por fecha hacia algo más granular.

**Pendiente / próximo paso**: diseñar esto con Mili antes de tocar código — no hay decisión tomada todavía, solo el análisis de arriba. Mili sigue recorriendo `/cuenta-paola` con datos simulados.

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

**Reseed completo de `gastos`** (pedido explícito de Mili: "elimina todos los gastos de la tabla"): borrados los 14 que había (los 4 `[SIM]` de la tanda anterior + 10 preexistentes) y reemplazados por 19 gastos nuevos con montos realistas que Mili pasó de una planilla real (descartando los nombres propios de esa planilla — eran pagos de huéspedes, no gastos — y usando solo las filas de categoría: limpieza, lavandería, expensas, internet, community manager → `marketing`, electricidad → `luz`, impuestos comuna → `impuestos`). Repartidos en mayo 2026 (cerrado, 10 gastos) y junio 2026 (en curso, 9 gastos), `pagado_por`: limpieza/lavandería → Paola, el resto → Fernando. Mismo marcador `[SIM]` en el detalle para limpiar después.

**Iteración de UX sobre la pantalla, pedida por Mili tras probar con los datos simulados** → commit `6d86e6b`:
- "Comisiones cobradas" pasa de lista a **tabla** (`TablaComisionesCobradas.tsx`): fecha, reserva, monto de la reserva, cobrado, **% cobrado** (cobrado/monto reserva — muestra de un vistazo si Paola cobró de más o de menos respecto del 15%/10% nominal), método de pago, y una fila de totales (suma + % ponderado).
- Tanto esa tabla como "Gastos pagados por Paola" se acotan al **mes calendario en curso** por ahora (placeholder explícito, TODO en el código) — Mili ya avisó que más adelante esto pasa a ser "desde el último cierre de caja", para soportar un cierre tardío que no caiga necesariamente el día 30. No implementado todavía, solo el filtro simple por mes.
- Dato simulado agregado para entender el comportamiento: un `movimiento_interno` que representa el cierre de mayo ya hecho (`MOV-SIM-mayo`, 180 USD a favor de Paola — coincide con la diferencia real de la reserva #15). Sirve para que Mili vea en carne propia la limitación ya anotada en `qa-output.json`: como no hay un "mes cerrado" real, la tabla de cierre de mayo va a seguir mostrando la misma diferencia de 180 aunque ya exista ese movimiento.
- También se agregó n° de operación a un ingreso simulado (`ING-SIM-3`) para que la columna "Método de pago" no fuera siempre "Efectivo".

**Gap detectado por Mili y corregido**: los 5 ingresos simulados a Paola no tenían su gasto de comisión espejo (lo que generaría el gatillo de US-04 en el flujo real). Se agregaron 4 gastos `categoria: comision` (Fernando → Paola) para las reservas #14, #16, #17 y #20, con el mismo monto/fecha que sus ingresos correspondientes (igual que precargaría el gatillo real). **A propósito, el ingreso de la reserva #18 (cancelada) queda sin su gasto espejo** — simula el caso de "Mili declinó el gatillo", razonable porque en ese momento todavía no se sabía si ese cobro se iba a clasificar como comisión o como caja chica.

**Cambio de modelo grande, pedido por Mili tras entender el flujo** → commit `c443bc0` + migración `005_movimiento_tipo.sql`:
- El cierre deja de ser "por mes calendario" y pasa a ser **"desde el último cierre"** de cada tipo — permite cierres tardíos, no atados al día 30.
- `movimientos_internos` suma un campo `tipo` (`cierre_comision` | `reembolso_gastos` | `caja_chica` | `ajuste_libre`). Se corrigió un riesgo real de doble conteo: antes, **todo** movimiento a favor de Paola generaba un gasto espejo en `/gastos`; ahora solo lo genera `cierre_comision` (plata nunca contada) — `reembolso_gastos` no genera nada nuevo, porque esos gastos (limpieza, lavandería) ya están en `/gastos` desde el día que Paola los pagó, y duplicarlos sería pagarlos dos veces en los números.
- `CierreCuentaSection` (reemplaza `CierreMensualSection`): dos bloques — comisión pendiente y gastos pendientes de reembolso, cada uno desde su último cierre — con un botón único que crea hasta 2 movimientos en un solo paso.
- El botón genérico "Registrar movimiento" ahora pide el concepto (comisión pendiente / reembolso de gastos / otro ajuste).

**Reset completo de datos en staging**, autorizado explícitamente por Mili, incorporando una regla de negocio que faltaba: **las reservas de Airbnb no tienen seña — todo se paga al check-in**. Se corrigió también un caso inválido que Mili señaló (una reserva *confirmada* con $0 cobrado no puede existir, porque nunca podría haberse iniciado sin al menos la seña). Datos nuevos (13 reservas, 12 ingresos, 23 gastos, 2 movimientos históricos — todos marcados `SIMULACION cuenta-paola` / `[SIM]`):
- Período anterior ya cerrado (reservas #1, #7, #13, checkout ≤ 30/04) — no aparecen más en pantalla, a propósito, para probar que el filtro "desde el último cierre" las excluye.
- Comisión pendiente real (#2: seña pagada a la cuenta general, comisión de Paola nunca cobrada → +$180), cobro de más (#3: -$30), futura con comisión ya cobrada por adelantado (#4, no cierra hasta septiembre), cancelada con comisión cobrada pendiente de clasificar (#5), cancelada sin cobro (#6), airbnb futuras sin ningún pago — válido, todavía no inició la estadía (#9, #11), airbnb cancelada sin cobro (#10).
- Verificado con un script de cálculo independiente (no solo confiando en la UI): comisión pendiente actual = +$150, gastos pendientes de reembolso = $727,03 — coincide con lo esperado a mano.

**Todas las secciones de la pantalla pasan a tabla con fila de totales** → commit `aa38d68`: `ListaMovimientoFinanciero` se reemplaza por `TablaMovimientoFinanciero` (gastos de Paola, movimientos de ajuste, gastos pendientes de reembolso) y `CancelacionesPendientesSection` pasa a tabla con columna de acciones — mismo patrón visual que `TablaComisionesCobradas`/`TablaReconciliacionComision` en todos los casos.

**Saldo principal corregido** → commit `5680e6d`: Mili no entendía por qué el saldo mostraba +$427 habiendo puesto ~$700 de su bolsillo. Causa real: `calcularSaldoPaola` sumaba **todo el histórico** (incluidos períodos ya cerrados), mezclando lo resuelto con lo pendiente. Se reemplaza por `saldoPendienteTotal` = comisión pendiente + gastos pendientes de reembolso, ambos desde el último cierre de cada tipo — el mismo número que ya calculaba "Cerrar cuenta" (ahora $877,03 con los datos simulados, no $427). De paso, positivo ahora significa siempre "el negocio le debe a Paola", sin la ambigüedad de antes. También se cambió "Devengado" → "Le corresponde" en la tabla de reconciliación (jerga contable, no era intuitiva).

**Cuenta de origen/destino en cada movimiento** → commit `a30e96b` + migración `006_movimiento_cuenta_origen.sql`: Mili notó que si Fernando transfiere internamente y no se asienta como salida de su cuenta, el saldo de esa cuenta se desfasa con el tiempo. Se agregó `cuenta_origen` (nullable) a `movimientos_internos`; el gasto espejo de `cierre_comision` ahora usa esa cuenta como `pagado_por` en vez de "Fernando" fijo; tanto "Registrar movimiento" como "Cerrar cuenta" la piden antes de confirmar. De paso se sacó el prop `prefill` de `MovimientoModal`, que había quedado sin uso.

**Comisiones por adelantado separadas** → commit `ee23e79`: las comisiones que Paola ya cobró de reservas que todavía no terminaron (ej. reserva #4, checkout en septiembre) quedaban mezcladas dentro de "Comisiones cobradas" sin distinguirse de las que ya están listas para cerrar. Ahora son dos tablas separadas (`comisionesPorAdelantado()` en `lib/cuentaPaola.ts`).

**Tanda de ajustes finos** → commits `e042e4c`, `669cc90`, `8aefbf7` + migración `007_gasto_id_reserva.sql`:
- El gasto de comisión del gatillo (US-04) ahora se vincula a la reserva por `id_reserva` (columna nueva, nullable) además de por texto en el detalle — Mili había descartado esto al principio, lo revisó y pidió agregarlo igual, porque el detalle se puede editar/borrar y el id no.
- "Movimientos de ajuste" pasa a `TablaMovimientos.tsx` dedicada: un solo monto (antes mostraba el original + el equivalente USD duplicado, casi siempre igual) y una columna nueva de cuenta de origen.
- "Comisiones cobradas" suma columna Plataforma.
- El saldo principal se desglosa en 3 cards (total, comisión pendiente, gastos pendientes) en vez de una sola combinada — `saldoPendienteDesglosado()` reemplaza `saldoPendienteTotal()`.

**Pendiente / próximo paso**:
- Correr la migración `007_gasto_id_reserva.sql` en Supabase (además de la `006` ya avisada).
- `designer-output.json` quedó con una nota de la 3ra revisión pero sin reescribir el `component_tree`/`flow` línea por línea — el código es la fuente de verdad mientras tanto.
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

**Historial detallado de las 15 rondas de esta sesión** (cada commit, cada ronda de feedback de Mili) archivado en `.claude/artifacts/gastos/status.md` — este resumen de cierre alcanza para el día a día; ese archivo queda para cuando haga falta el por qué de una decisión puntual.
