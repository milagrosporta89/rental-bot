import { toISO, mesLabel } from './dates'
import type { Gasto, Ingreso, Reserva } from './types'

/** % plano usado solo para esta liquidación provisoria — a diferencia de comisionDevengada
 * (que distingue 10%/15% según plataforma), acá Paola pidió calcularlo siempre al 15% de lo
 * facturado en el mes, para tener una referencia rápida de los meses sin comisión asentada. */
const COMISION_SUGERIDA_PORCENTAJE = 0.15

export interface FilaLiquidacionMensual {
  mes: string // "YYYY-MM"
  mesLabel: string
  ingresosPaola: number
  ingresosPaolaArs: number
  gastosPaola: number
  gastosPaolaArs: number
  comisionAsentada: number
  comisionAsentadaArs: number
  comisionSugerida: number
  comisionSugeridaArs: number
  saldoMes: number // positivo = el negocio le debe a Paola ese mes; negativo = Paola le debe al negocio
  saldoMesArs: number
  saldoAcumulado: number
  saldoAcumuladoArs: number
}

function claveMes(fechaDDMMYYYY: string): string {
  return toISO(fechaDDMMYYYY).slice(0, 7)
}

function sumarPorMes<T>(items: T[], fecha: (item: T) => string, usd: (item: T) => number, ars: (item: T) => number) {
  const usdPorMes = new Map<string, number>()
  const arsPorMes = new Map<string, number>()
  for (const item of items) {
    const mes = claveMes(fecha(item))
    usdPorMes.set(mes, (usdPorMes.get(mes) ?? 0) + usd(item))
    arsPorMes.set(mes, (arsPorMes.get(mes) ?? 0) + ars(item))
  }
  return { usdPorMes, arsPorMes }
}

/**
 * Liquidación mensual provisoria con Paola: ingresos que entraron a su cuenta, gastos que ella
 * pagó de su bolsillo, y comisión (la ya asentada como gasto, y una sugerida al 15% de lo
 * facturado ese mes, útil para los meses donde todavía no se cargó ninguna). El saldo de cada
 * mes usa la comisión asentada, no la sugerida — la sugerida es solo una referencia para decidir
 * cuánto cargar en los meses pendientes (ver comisionAsentada === 0).
 */
export function liquidacionMensual(
  ingresosPaola: Ingreso[],
  gastosPaolaBolsillo: Gasto[],
  gastosComision: Gasto[],
  reservas: Reserva[]
): FilaLiquidacionMensual[] {
  const ingresosPorMes = sumarPorMes(ingresosPaola, i => i.fecha, i => i.monto_usd ?? 0, i => i.monto_ars ?? 0)
  const gastosPorMes = sumarPorMes(gastosPaolaBolsillo, g => g.fecha, g => g.monto_usd ?? 0, g => g.monto_ars ?? 0)
  const comisionAsentadaPorMes = sumarPorMes(gastosComision, g => g.fecha, g => g.monto_usd ?? 0, g => g.monto_ars ?? 0)

  const reservasFacturables = reservas.filter(r => r.estado_reserva !== 'cancelada')
  const facturadoPorMes = sumarPorMes(reservasFacturables, r => r.fecha_salida, r => r.monto_total_usd, r => r.monto_total_usd * r.cotizacion)

  const meses = new Set<string>([
    ...ingresosPorMes.usdPorMes.keys(),
    ...gastosPorMes.usdPorMes.keys(),
    ...comisionAsentadaPorMes.usdPorMes.keys(),
    ...facturadoPorMes.usdPorMes.keys(),
  ])

  let acumulado = 0
  let acumuladoArs = 0
  return [...meses].sort().map(mes => {
    const ingresos = ingresosPorMes.usdPorMes.get(mes) ?? 0
    const ingresosArs = ingresosPorMes.arsPorMes.get(mes) ?? 0
    const gastos = gastosPorMes.usdPorMes.get(mes) ?? 0
    const gastosArs = gastosPorMes.arsPorMes.get(mes) ?? 0
    const comisionAsentada = comisionAsentadaPorMes.usdPorMes.get(mes) ?? 0
    const comisionAsentadaArs = comisionAsentadaPorMes.arsPorMes.get(mes) ?? 0
    const comisionSugerida = (facturadoPorMes.usdPorMes.get(mes) ?? 0) * COMISION_SUGERIDA_PORCENTAJE
    const comisionSugeridaArs = (facturadoPorMes.arsPorMes.get(mes) ?? 0) * COMISION_SUGERIDA_PORCENTAJE

    const saldoMes = gastos + comisionAsentada - ingresos
    const saldoMesArs = gastosArs + comisionAsentadaArs - ingresosArs
    acumulado += saldoMes
    acumuladoArs += saldoMesArs

    return {
      mes, mesLabel: mesLabel(mes),
      ingresosPaola: ingresos, ingresosPaolaArs: ingresosArs,
      gastosPaola: gastos, gastosPaolaArs: gastosArs,
      comisionAsentada, comisionAsentadaArs,
      comisionSugerida, comisionSugeridaArs,
      saldoMes, saldoMesArs,
      saldoAcumulado: acumulado, saldoAcumuladoArs: acumuladoArs,
    }
  })
}
