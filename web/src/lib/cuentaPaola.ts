import { hoyISO, toISO } from './dates'
import { COMISION_PAOLA_PORCENTAJE, Gasto, Ingreso, MovimientoInterno, Plataforma, Reserva, TipoMovimientoInterno } from './types'

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
}

/**
 * Reconciliación devengado-vs-cobrado de las reservas con checkout entre el último cierre de
 * comisión (excluido) y hoy (incluido). Ancla por fecha de checkout, no por fecha de cobro,
 * para no distorsionar el cierre con reservas cobradas en un momento pero resueltas en otro.
 * Reservas canceladas o con checkout todavía no ocurrido quedan afuera.
 */
export function reconciliacionDesdeUltimoCierre(
  reservas: Reserva[],
  ingresosPaola: Ingreso[],
  fechaUltimoCierreISO: string | null
): FilaReconciliacion[] {
  const hoy = hoyISO()
  return reservas
    .filter(r => {
      if (r.estado_reserva === 'cancelada') return false
      const checkoutISO = toISO(r.fecha_salida)
      if (checkoutISO > hoy) return false
      if (fechaUltimoCierreISO && checkoutISO <= fechaUltimoCierreISO) return false
      return true
    })
    .map(reserva => {
      const devengado = comisionDevengada(reserva)
      const cobrado = ingresosPaola
        .filter(i => i.id_reserva === reserva.id)
        .reduce((s, i) => s + (i.monto_usd ?? 0), 0)
      return { reserva, devengado, cobrado, diferencia: devengado - cobrado }
    })
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
    const reserva = i.id_reserva ? reservasPorId.get(i.id_reserva) : undefined
    return !!reserva && reserva.estado_reserva !== 'cancelada' && toISO(reserva.fecha_salida) > hoy
  })
}

/** Gastos pagados por Paola desde el último reembolso (excluido) hasta hoy. */
export function gastosPendientesDeReembolso(gastosPaola: Gasto[], fechaUltimoReembolsoISO: string | null): Gasto[] {
  return gastosPaola.filter(g => !fechaUltimoReembolsoISO || toISO(g.fecha) > fechaUltimoReembolsoISO)
}

export interface SaldoPendienteDesglosado {
  comision: number
  gastos: number
  total: number
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
  const fechaCierreComision = fechaUltimoCierre(movimientos, 'cierre_comision')
  const fechaCierreReembolso = fechaUltimoCierre(movimientos, 'reembolso_gastos')

  const comision = reconciliacionDesdeUltimoCierre(
    reservas, ingresosPaola, fechaCierreComision ? toISO(fechaCierreComision) : null
  ).reduce((s, f) => s + f.diferencia, 0)

  const gastos = gastosPendientesDeReembolso(
    gastosPaola, fechaCierreReembolso ? toISO(fechaCierreReembolso) : null
  ).reduce((s, g) => s + (g.monto_usd ?? 0), 0)

  return { comision, gastos, total: comision + gastos }
}
