import { hoyISO, toISO } from './dates'
import { COMISION_PAOLA_PORCENTAJE, Gasto, Ingreso, MovimientoInterno, Plataforma, Reserva, TipoMovimientoInterno } from './types'

/**
 * Saldo de caja crudo de Paola — misma fórmula que obtenerBalancePaola() del bot
 * (cobrado − gastado), extendida con los ajustes ya hechos vía movimientos_internos.
 * Positivo = surplus suyo (no implica deuda); negativo = el negocio le debe el absoluto.
 */
export function calcularSaldoPaola(
  ingresosPaola: Ingreso[],
  gastosPaola: Gasto[],
  movimientos: MovimientoInterno[]
): number {
  const cobrado = ingresosPaola.reduce((s, i) => s + (i.monto_usd ?? 0), 0)
  const gastado = gastosPaola.reduce((s, g) => s + (g.monto_usd ?? 0), 0)
  const aFavorPaola = movimientos
    .filter(m => m.sentido === 'a_favor_paola')
    .reduce((s, m) => s + (m.monto_usd ?? 0), 0)
  const aFavorNegocio = movimientos
    .filter(m => m.sentido === 'a_favor_negocio')
    .reduce((s, m) => s + (m.monto_usd ?? 0), 0)
  return cobrado - gastado + aFavorPaola - aFavorNegocio
}

/** Comisión devengada de una reserva concretada — $0 si está cancelada. */
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

/** Gastos pagados por Paola desde el último reembolso (excluido) hasta hoy. */
export function gastosPendientesDeReembolso(gastosPaola: Gasto[], fechaUltimoReembolsoISO: string | null): Gasto[] {
  return gastosPaola.filter(g => !fechaUltimoReembolsoISO || toISO(g.fecha) > fechaUltimoReembolsoISO)
}
