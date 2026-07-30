import { hoyISO, toISO } from './dates'
import { COMISION_PAOLA_PORCENTAJE, Gasto, Ingreso, MovimientoInterno, Plataforma, Reserva, TipoMovimientoInterno } from './types'

/** Corte desde el cual la contabilidad vive en el sistema nuevo; los registros anteriores son
 * datos migrados del sistema artesanal, que se conservan en la base para cruces de rentabilidad
 * pero no se muestran en la web. */
export const INICIO_CONTABILIDAD = '2026-07-01'

/**
 * Un ingreso o gasto es de la contabilidad nueva si su propia fecha ya es de julio en adelante, o
 * si está enlazado a una reserva de la tabla nueva (por ejemplo una seña cobrada por adelantado
 * antes del corte, para una reserva cuya estadía sí es de julio). Los migrados del sistema
 * artesanal no tienen id_reserva en esta tabla, así que quedan afuera igual.
 */
export function esDeContabilidadNueva(fecha: string, idReserva: string | null, reservasPorId: Map<string, Reserva>): boolean {
  return toISO(fecha) >= INICIO_CONTABILIDAD || (!!idReserva && reservasPorId.has(idReserva))
}

/** Comisión que le corresponde a una reserva concretada — $0 si está cancelada. */
export function comisionDevengada(reserva: Reserva): number {
  if (reserva.estado_reserva === 'cancelada') return 0
  const porcentaje = COMISION_PAOLA_PORCENTAJE[reserva.plataforma as Plataforma] ?? COMISION_PAOLA_PORCENTAJE.directo
  return reserva.monto_total_usd * porcentaje
}

/** Fecha (DD/MM/YYYY) del último movimiento_interno de un tipo dado, o null si nunca hubo uno. */
export function fechaUltimoCierre(movimientos: MovimientoInterno[], tipo: TipoMovimientoInterno): string | null {
  const delTipo = movimientos.filter(m => m.tipo === tipo)
  if (delTipo.length === 0) return null
  return delTipo.reduce((mas_reciente, m) => toISO(m.fecha) > toISO(mas_reciente.fecha) ? m : mas_reciente).fecha
}

export interface FilaReconciliacion {
  reserva: Reserva
  devengado: number
  cobrado: number
  diferencia: number
  // Mismos valores en pesos, pero sumando lo que cada registro ya tiene asentado en su momento
  // (ingreso.monto_ars real, o monto_total_usd * la cotización con la que se cargó la reserva)
  // — nunca convertidos a la cotización de hoy, para no inventar ganancias o pérdidas cambiarias.
  devengadoArs: number
  cobradoArs: number
  diferenciaArs: number
}

function filaDeReserva(reserva: Reserva, ingresosPaola: Ingreso[]): FilaReconciliacion {
  const devengado = comisionDevengada(reserva)
  const ingresosReserva = ingresosPaola.filter(i => i.id_reserva === reserva.id && i.resolucion_cancelacion !== 'caja_chica')
  const cobrado = ingresosReserva.reduce((s, i) => s + (i.monto_usd ?? 0), 0)
  const devengadoArs = devengado * reserva.cotizacion
  const cobradoArs = ingresosReserva.reduce((s, i) => s + (i.monto_ars ?? 0), 0)
  return { reserva, devengado, cobrado, diferencia: devengado - cobrado, devengadoArs, cobradoArs, diferenciaArs: devengadoArs - cobradoArs }
}

/**
 * Reconciliación devengado-vs-cobrado de todas las reservas ya terminadas (no canceladas).
 * No ancla por fecha de un cierre anterior: una reserva pendiente lo sigue estando sin importar
 * cuándo se cargó en el sistema — anclar por checkout-vs-fecha-de-cierre rompía con reservas
 * agregadas después de un cierre pero con checkout anterior a esa fecha (quedaban excluidas para
 * siempre). Lo que sí queda resuelto automáticamente: en cuanto diferencia llega a 0 (porque se
 * liquidó), deja de aparecer como pendiente en los filtros que usan este resultado.
 *
 * Reservas terminadas antes de INICIO_CONTABILIDAD quedan afuera: su comisión se manejó en el
 * sistema artesanal, así que sin sus ingresos migrados (ver esDeContabilidadNueva) siempre
 * aparecerían como "a resolver" sin serlo realmente.
 */
export function reconciliacionDesdeUltimoCierre(reservas: Reserva[], ingresosPaola: Ingreso[]): FilaReconciliacion[] {
  const hoy = hoyISO()
  return reservas
    .filter(r => r.estado_reserva !== 'cancelada' && toISO(r.fecha_salida) <= hoy && toISO(r.fecha_salida) >= INICIO_CONTABILIDAD)
    .map(r => filaDeReserva(r, ingresosPaola))
}

/**
 * Reservas ya resueltas (cobrado = devengado) — el espejo histórico de
 * reconciliacionDesdeUltimoCierre: esa mira lo pendiente (diferencia !== 0), esta mira lo que ya
 * quedó saldado (diferencia === 0), para poder revisar qué % cobró Paola en cada una. El
 * "cobrado" excluye lo ya re-etiquetado como caja chica al liquidar (ver
 * partirIngresoPorExcedente) — por eso una reserva conciliada queda con cobrado = devengado, no
 * con el monto bruto que incluía el excedente.
 */
export function historicoReservasLiquidadas(reservas: Reserva[], ingresosPaola: Ingreso[]): FilaReconciliacion[] {
  return reconciliacionDesdeUltimoCierre(reservas, ingresosPaola)
    .filter(f => f.diferencia === 0)
    .sort((a, b) => toISO(b.reserva.fecha_salida).localeCompare(toISO(a.reserva.fecha_salida)))
}

/**
 * Comisiones que Paola ya cobró por adelantado, de reservas cuyo checkout todavía no llegó.
 * Quedan "en stand-by": no entran a reconciliacionDesdeUltimoCierre (que solo mira checkouts ya
 * ocurridos) hasta que la reserva efectivamente termine — recién ahí se sabe si correspondía.
 * Reservas canceladas quedan afuera (van a la clasificación de US-06, no acá).
 */
export function comisionesPorAdelantado(ingresosPaola: Ingreso[], reservas: Reserva[]): Ingreso[] {
  const hoy = hoyISO()
  const reservasPorId = new Map(reservas.map(r => [r.id, r]))
  return ingresosPaola.filter(i => {
    if (i.resolucion_cancelacion === 'caja_chica') return false
    const reserva = i.id_reserva ? reservasPorId.get(i.id_reserva) : undefined
    return !!reserva && reserva.estado_reserva !== 'cancelada' && toISO(reserva.fecha_salida) > hoy
  })
}

/**
 * Comisión "provisoria" sobre lo que Paola ya cobró (15% directas, 10% airbnb), mientras el
 * sistema de comisiones formal no está activo (arranca en agosto, solo para reservas nuevas).
 * A diferencia de comisionDevengada, no mira el monto total de la reserva sino lo efectivamente
 * cobrado — no hay reconciliación corriendo, así que no hay "lo que corresponde" que comparar.
 * Filtrable por plataforma; sin ese filtro, suma ambas.
 */
export function comisionSobreCobrado(
  ingresos: Ingreso[],
  reservasPorId: Map<string, Reserva>,
  campo: 'monto_usd' | 'monto_ars',
  plataforma?: Plataforma
): number {
  return ingresos.reduce((s, i) => {
    const reserva = i.id_reserva ? reservasPorId.get(i.id_reserva) : undefined
    if (!reserva) return s
    if (plataforma && reserva.plataforma !== plataforma) return s
    const pct = COMISION_PAOLA_PORCENTAJE[reserva.plataforma as Plataforma] ?? COMISION_PAOLA_PORCENTAJE.directo
    return s + (i[campo] ?? 0) * pct
  }, 0)
}

/** Gastos pagados por Paola desde el último reembolso (excluido) hasta hoy. */
export function gastosPendientesDeReembolso(gastosPaola: Gasto[], fechaUltimoReembolsoISO: string | null): Gasto[] {
  return gastosPaola.filter(g => !fechaUltimoReembolsoISO || toISO(g.fecha) > fechaUltimoReembolsoISO)
}

/**
 * Saldo acumulado de caja chica: plata que es del negocio pero quedó en la cuenta de Paola (por
 * comisión cobrada de más, o por un cobro de reserva cancelada clasificado como caja chica),
 * menos lo que ya se usó para cubrir comisiones o reembolsos en liquidaciones posteriores.
 * Es un stock que persiste entre liquidaciones, no algo que se resetee cada vez.
 */
export function saldoCajaChica(movimientos: MovimientoInterno[], campo: 'monto_usd' | 'monto_ars' = 'monto_usd'): number {
  return movimientos.reduce((s, m) => {
    if (m.tipo === 'cierre_comision') {
      return m.sentido === 'a_favor_negocio' ? s + (m[campo] ?? 0) : s
    }
    if (m.tipo === 'caja_chica') {
      return s + (m.sentido === 'a_favor_negocio' ? (m[campo] ?? 0) : -(m[campo] ?? 0))
    }
    return s
  }, 0)
}

export interface SaldoPendienteDesglosado {
  comision: number
  gastos: number
  total: number
  comisionArs: number
  gastosArs: number
  totalArs: number
}

/**
 * Lo que falta saldar con Paola en este momento, desglosado: comisión pendiente y gastos
 * pendientes de reembolso, ambos desde el último cierre de cada tipo (mismo cálculo que usa
 * "Cerrar cuenta"). Positivo = el negocio le debe a Paola; negativo = Paola le debe al negocio.
 */
export function saldoPendienteDesglosado(
  reservas: Reserva[],
  ingresosPaola: Ingreso[],
  gastosPaola: Gasto[],
  movimientos: MovimientoInterno[]
): SaldoPendienteDesglosado {
  const fechaCierreReembolso = fechaUltimoCierre(movimientos, 'reembolso_gastos')

  const filasComision = reconciliacionDesdeUltimoCierre(reservas, ingresosPaola)
  const comision = filasComision.reduce((s, f) => s + f.diferencia, 0)
  const comisionArs = filasComision.reduce((s, f) => s + f.diferenciaArs, 0)

  const gastosPendientes = gastosPendientesDeReembolso(
    gastosPaola, fechaCierreReembolso ? toISO(fechaCierreReembolso) : null
  )
  const gastos = gastosPendientes.reduce((s, g) => s + (g.monto_usd ?? 0), 0)
  const gastosArs = gastosPendientes.reduce((s, g) => s + (g.monto_ars ?? 0), 0)

  return { comision, gastos, total: comision + gastos, comisionArs, gastosArs, totalArs: comisionArs + gastosArs }
}
