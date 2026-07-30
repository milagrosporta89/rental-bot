import type { NextRequest } from 'next/server'

/** Valida el header Authorization: Bearer <BOT_API_SECRET> que manda el bot en cada request a /api/bot/*. */
export function validarAuthBot(req: NextRequest): boolean {
  const header = req.headers.get('authorization') ?? ''
  const esperado = `Bearer ${process.env.BOT_API_SECRET}`
  return Boolean(process.env.BOT_API_SECRET) && header === esperado
}

export const TITULARES_VALIDOS = ['Francisco', 'Milagros', 'Inés', 'Fernando', 'Paola'] as const
export type TitularValido = typeof TITULARES_VALIDOS[number]

export function esTitularValido(valor: string): valor is TitularValido {
  return (TITULARES_VALIDOS as readonly string[]).includes(valor)
}
