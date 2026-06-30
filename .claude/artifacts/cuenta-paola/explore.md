# Explore — cuenta-paola

## Lo que entendí del dominio

**Campos ya existentes (web, Supabase) que esta feature reusa sin tocar:**
- `ingresos.nombre_destinatario` — a qué cuenta entró la plata del cliente. Ya incluye "Paola" como opción en el selector de `pago/page.tsx` (`DESTINATARIOS`).
- `gastos.pagado_por` — de qué bolsillo salió la plata de un gasto. Ya incluye "Paola" en `TITULARES_PAGADOR` (`web/src/lib/types.ts:160`).
- Ambos campos se normalizan con `toTitleCase` antes de guardar (siempre "Paola", nunca "paola"/"PAOLA").

**Decisiones ya tomadas en el chat previo a este /explore (no volver a preguntar):**
- No se agrega `id_reserva` a `gastos`.
- Todo ingreso con `nombre_destinatario: Paola` se considera su comisión completa (no se calcula 15%/10%, es el monto real transferido).
- Gatillo semi-automático (no escritura automática): al guardar un ingreso con destinatario Paola, preguntar si se quiere asentar el mismo monto como gasto de comisión (`categoria: comision`, `pagado_por: Fernando`, `nombre_destinatario: Paola`) — abre el wizard de gastos precargado, editable.
- El saldo de Paola se **calcula** (lectura, no se persiste): `Σ ingresos(destinatario=Paola) + Σ gastos(pagado_por=Paola) − Σ movimientos_internos`.
- Tabla nueva `movimientos_internos`, acotada a la operatoria de Paola (no genérica entre titulares): `fecha`, `monto`, `moneda`, `cotizacion`, `monto_ars`, `monto_usd`, `sentido` ('a_favor_paola'|'a_favor_negocio'), `detalle`, `comprobante_url`, `registrado_por`, `timestamp`.
- Pantalla nueva dedicada "Cuenta de Paola" (no solo backend) — listas de comisiones cobradas, gastos pagados por ella, movimientos, y el saldo.

## Flujo actual del bot

**Sí tiene equivalente parcial**: comando de menú "💼 Comisión Paola" → `onComisionCommand` (`src/handlers/comision.ts`) → `obtenerBalancePaola()` (`src/services/sheets.ts:253`).

Es **solo lectura**, no escribe nada:
- Filtra ingresos donde `nombreDestinatario.toLowerCase() === "paola"` y gastos donde `pagadoPor.toLowerCase() === "paola"`.
- Devuelve `totalCobrado`, `totalGastado`, `balance = totalCobrado - totalGastado`, y los mismos 3 valores acotados al mes actual.
- **No existe ningún ajuste por transferencias reales hechas para saldar la diferencia** — el balance crece o decrece indefinidamente según lo cobrado/gastado histórico, sin noción de "esto ya se saldó". Es decir: el bot **no tiene** el equivalente de `movimientos_internos` — eso es una mejora real que se está agregando ahora, no una réplica 1:1.
- **No existe ningún gatillo** que pregunte "¿asentar esto como gasto de comisión?" al registrar un ingreso, ni en el bot ni en la web — es nuevo en ambos lados.
- Relacionado pero distinto: `onReportarSaldoCommand`/`onSaldoCommand` (`src/handlers/cash.ts`) — un sistema separado donde cada titular (Francisco, Milagros, Inés, Fernando) reporta a mano su saldo de caja real, comparado contra uno calculado (ingresos de sus casas − gastos que pagó). Es un concepto distinto ("saldo de caja por titular/casa") del de "cuánto se le debe a Paola por comisión" — no hace falta tocarlo ni replicarlo.

## Gaps o ambigüedades

**Hallazgo importante, no asumido — verificado por introspección de código, no de documentación:** `CONTEXT.md` dice que el bot escribe reservas e ingresos en Supabase y solo gastos quedó atrasado en Sheets. Pero no encontré **ningún** cliente de Supabase en `src/` (`grep supabase|createClient` → 0 archivos). Todo el bot (`reservas.ts`, `sheets.ts`, los handlers de ingresos/gastos/saldos) sigue escribiendo en Google Sheets vía `googleapis`. No bloquea esta feature (la web ya es Supabase-only para todo, incluida esta), pero la tabla de `CONTEXT.md` parece desactualizada más allá de lo que ya advierte sobre gastos — vale la pena corregirla en otro momento, no ahora.

Otras ambigüedades:
- El balance que va a mostrar la web (con el ajuste de `movimientos_internos`) **no va a coincidir** con el que hoy muestra el comando de WhatsApp (que no resta movimientos). Si Paola/Mili consultan ambos, van a ver números distintos.
- No quedó explícito si el gatillo semi-automático y el registro de `movimientos_internos` deben existir también en el bot de WhatsApp, o si esto es exclusivamente una mejora de la web.
- Filtrado por "Paola" en Supabase: dado que la web ya normaliza con `toTitleCase`, alcanza con `.eq('nombre_destinatario', 'Paola')` / `.eq('pagado_por', 'Paola')` — pero hay que confirmar que no existan filas viejas con variantes de capitalización que se escapen de un match exacto.

**Patrones de UI reusables encontrados:**
- `NavTabs.tsx` (`web/src/components/layout/NavTabs.tsx`): agregar una pestaña nueva es trivial (array `tabs`).
- `PagosSection.tsx`: patrón de listado de movimientos financieros con acciones (editar/eliminar/ver recibo) — buen punto de partida para las 3 listas de la pantalla nueva.
- `GastosTable.tsx` / wizard de gastos: patrón de alta con conversión de moneda (`cotizacion`/`monto_ars`/`monto_usd` calculados server-side) — mismo patrón a reusar para el alta de `movimientos_internos`.
- No hay ninguna pantalla de "balance"/dashboard financiero ya construida en la web — esta es la primera.

## Preguntas para Mili

1. El balance de "Cuenta de Paola" en la web va a diferir del que hoy muestra el comando de WhatsApp (la web resta `movimientos_internos`, el bot no) — ¿esto es aceptable, o el comando de WhatsApp debería actualizarse después para que ambos coincidan?
2. ¿Esta feature es solo para la web, o el gatillo semi-automático (preguntar al asentar un ingreso a Paola) y el registro de `movimientos_internos` también deberían existir en el flujo de WhatsApp?
3. ¿Confirmás match exacto `nombre_destinatario = 'Paola'` / `pagado_por = 'Paola'` (case-sensitive, ya normalizado), o preferís un filtro case-insensitive por si hay datos históricos con variantes?

## Respuestas de Mili

1. **Sí, está bien que difieran por ahora.** El comando de WhatsApp queda como está (solo lectura, sin restar `movimientos_internos`). Se puede unificar más adelante si hace falta.
2. **Solo web.** El gatillo semi-automático y el alta de `movimientos_internos` no tocan el bot de WhatsApp en esta vuelta.
3. **Match exacto `'Paola'`**, sin `ilike` — la web ya normaliza con `toTitleCase` antes de guardar.

Listo para `/run-pipeline cuenta-paola`.
