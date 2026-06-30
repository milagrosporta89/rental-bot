import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formatea un monto en USD redondeado hacia arriba, sin decimales — solo para mostrar, nunca para guardar */
export function formatUSD(n: number | null | undefined): string {
  if (n == null) return '—'
  return `USD ${Math.ceil(n).toLocaleString('es-AR')}`
}

export type Moneda = 'USD' | 'ARS'

/**
 * Muestra un par de montos (USD y ARS, ya calculados por separado) según la moneda elegida.
 * El monto en ARS debe venir de la suma de pesos realmente asentados en cada registro, nunca
 * de convertir el USD a la cotización de hoy — así una devolución en pesos no varía con el dólar.
 */
export function formatMonto(usd: number | null | undefined, ars: number | null | undefined, moneda: Moneda): string {
  if (moneda === 'USD') return formatUSD(usd)
  if (ars == null) return '—'
  return `$ ${Math.ceil(ars).toLocaleString('es-AR')}`
}
