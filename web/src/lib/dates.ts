import { parse, format, differenceInDays, isValid } from 'date-fns'

const DD_MM_YYYY = 'dd/MM/yyyy'

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

/** Genera un id de reserva tipo TMP-2025-0042 */
export function generarIdReserva(n: number): string {
  const año = new Date().getFullYear()
  return `TMP-${año}-${String(n).padStart(4, '0')}`
}

/** Hoy en DD/MM/YYYY */
export function hoy(): string {
  return format(new Date(), DD_MM_YYYY)
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
