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
