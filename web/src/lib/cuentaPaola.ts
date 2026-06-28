import { toISO } from './dates'
import { COMISION_PAOLA_PORCENTAJE, Gasto, Ingreso, MovimientoInterno, Plataforma, Reserva } from './types'

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

/** "YYYY-MM" de la fecha de salida (checkout) de una reserva. */
function mesDeCheckout(reserva: Reserva): string {
  return toISO(reserva.fecha_salida).slice(0, 7)
}

export interface FilaReconciliacion {
  reserva: Reserva
  devengado: number
  cobrado: number
  diferencia: number
}

/**
 * Reconciliación devengado-vs-cobrado de las reservas cuyo checkout cae en `mes` (YYYY-MM).
 * Ancla por fecha de checkout (no por fecha de cobro) para no distorsionar el cierre con
 * reservas cobradas en un mes pero resueltas en otro. Reservas canceladas no entran acá
 * (van a los "cobros pendientes de clasificar" de US-06).
 */
export function reconciliacionDelMes(
  reservas: Reserva[],
  ingresosPaola: Ingreso[],
  mes: string
): FilaReconciliacion[] {
  return reservas
    .filter(r => r.estado_reserva !== 'cancelada' && mesDeCheckout(r) === mes)
    .map(reserva => {
      const devengado = comisionDevengada(reserva)
      const cobrado = ingresosPaola
        .filter(i => i.id_reserva === reserva.id)
        .reduce((s, i) => s + (i.monto_usd ?? 0), 0)
      return { reserva, devengado, cobrado, diferencia: devengado - cobrado }
    })
}
