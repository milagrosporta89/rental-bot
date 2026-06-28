'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { registradoPorActual } from '@/lib/auth'
import type { SentidoMovimiento } from '@/lib/types'

export interface MovimientoInternoPayload {
  fecha: string // DD/MM/YYYY
  monto: number
  moneda: 'ARS' | 'USD'
  cotizacion: number
  monto_ars: number | null
  monto_usd: number | null
  sentido: SentidoMovimiento
  detalle: string | null
  comprobante_url: string | null
}

export async function crearMovimientoInterno(payload: MovimientoInternoPayload): Promise<void> {
  if (!payload.monto || payload.monto <= 0) {
    throw new Error('El monto debe ser mayor a 0.')
  }

  const registrado_por = await registradoPorActual()
  const supabase = createAdminClient()
  const id = `MOV-${Date.now()}`
  const timestamp = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })

  const { error } = await supabase.from('movimientos_internos').insert({
    ...payload,
    id,
    registrado_por,
    timestamp,
  })
  if (error) throw new Error(error.message)
}
