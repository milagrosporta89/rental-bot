import { parse, format, differenceInDays, isValid } from 'date-fns'

const DD_MM_YYYY = 'dd/MM/yyyy'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/** "2025-06" → "Junio 2025" */
export function mesLabel(claveAnioMes: string): string {
  const [anio, mes] = claveAnioMes.split('-')
  return `${MESES[Number(mes) - 1]} ${anio}`
}

/** "15/06/2025" → "2025-06-15" */
export function toISO(ddmmyyyy: string): string {
  const d = parse(ddmmyyyy, DD_MM_YYYY, new Date())
  if (!isValid(d)) return ddmmyyyy
  return format(d, 'yyyy-MM-dd')
}

/** "2025-06-15" → "15/06/2025" */
export function toDDMMYYYY(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (!isValid(d)) return iso
  return format(d, DD_MM_YYYY)
}

/** Noches entre dos fechas DD/MM/YYYY */
export function calcularNoches(entrada: string, salida: string): number {
  const d1 = parse(entrada, DD_MM_YYYY, new Date())
  const d2 = parse(salida, DD_MM_YYYY, new Date())
  if (!isValid(d1) || !isValid(d2)) return 0
  return differenceInDays(d2, d1)
}

/** Hoy en DD/MM/YYYY */
export function hoy(): string {
  return format(new Date(), DD_MM_YYYY)
}

/** Hoy en YYYY-MM-DD */
export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Terminada = el checkout ya pasó. El día del checkout todavía no cuenta como terminada. */
export function esTerminada(fechaSalida: string): boolean {
  return toISO(fechaSalida) < hoyISO()
}

/** En curso = ya pasó el check-in y todavía no terminó la estadía (incluye el día de checkout) */
export function esEnCurso(fechaEntrada: string, fechaSalida: string): boolean {
  return toISO(fechaEntrada) <= hoyISO() && !esTerminada(fechaSalida)
}

/** Estado a mostrar: cancelada siempre gana, después terminada, después en curso, sino el estado real */
export function estadoVisual(estadoReserva: string | null | undefined, fechaEntrada: string, fechaSalida: string): string {
  if (estadoReserva === 'cancelada') return 'cancelada'
  if (esTerminada(fechaSalida)) return 'terminada'
  if (esEnCurso(fechaEntrada, fechaSalida)) return 'en_curso'
  return estadoReserva ?? 'confirmada'
}

/** Verifica si dos rangos se solapan (DD/MM/YYYY) */
export function solapan(
  a: { desde: string; hasta: string },
  b: { desde: string; hasta: string }
): boolean {
  const aDesde = parse(a.desde, DD_MM_YYYY, new Date())
  const aHasta = parse(a.hasta, DD_MM_YYYY, new Date())
  const bDesde = parse(b.desde, DD_MM_YYYY, new Date())
  const bHasta = parse(b.hasta, DD_MM_YYYY, new Date())
  return aDesde < bHasta && aHasta > bDesde
}
