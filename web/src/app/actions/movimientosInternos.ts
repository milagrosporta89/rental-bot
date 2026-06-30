'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { registradoPorActual } from '@/lib/auth'
import type { SentidoMovimiento, TipoMovimientoInterno } from '@/lib/types'

export interface MovimientoInternoPayload {
  fecha: string // DD/MM/YYYY
  monto: number
  moneda: 'ARS' | 'USD'
  cotizacion: number
  monto_ars: number | null
  monto_usd: number | null
  sentido: SentidoMovimiento
  tipo: TipoMovimientoInterno
  cuenta_origen: string | null
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

  // Solo 'cierre_comision' a_favor_paola es plata real que sale del negocio hacia Paola — ese sí
  // tiene que quedar en /gastos como costo de comisión. Si el sentido es a_favor_negocio (Paola
  // cobró de más y queda como caja chica), no hay salida real de plata, no se crea gasto.
  if (payload.tipo === 'cierre_comision' && payload.sentido === 'a_favor_paola') {
    const { error: ge } = await supabase.from('gastos').insert({
      id: `GAS-${Date.now() + 1}`,
      fecha: payload.fecha,
      monto: payload.monto,
      moneda: payload.moneda,
      categoria: 'comision',
      pagado_por: payload.cuenta_origen || 'Fernando',
      nombre_destinatario: 'Paola',
      banco_origen: 'Liquidación de comisión',
      nro_operacion: null,
      detalle: payload.detalle,
      registrado_por,
      comprobante_url: null,
      timestamp,
      cotizacion: payload.cotizacion,
      monto_ars: payload.monto_ars,
      monto_usd: payload.monto_usd,
    })
    if (ge) throw new Error(ge.message)
  }
}
