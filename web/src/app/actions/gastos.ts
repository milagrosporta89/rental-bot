'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { toISO } from '@/lib/dates'
import { obtenerCotizacion } from '@/lib/cotizacion'
import { registradoPorActual } from '@/lib/auth'
import type { Gasto } from '@/lib/types'

export interface GastoPayload {
  fecha: string // DD/MM/YYYY
  monto: number
  moneda: 'ARS' | 'USD'
  categoria: string
  pagado_por: string
  nombre_destinatario: string | null
  banco_origen: string | null
  nro_operacion: string | null
  detalle: string | null
  comprobante_url: string | null
  id_reserva: string | null
}

export interface GastoDuplicado {
  fecha: string
  categoria: string
  monto: number
  pagado_por: string
}

/** Equivalente a buscarGastoDuplicado del bot (src/services/sheets.ts), pero contra Supabase */
export async function buscarGastoDuplicado(nroOperacion: string): Promise<GastoDuplicado | null> {
  if (!nroOperacion.trim()) return null
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('gastos')
    .select('fecha, categoria, monto, pagado_por')
    .eq('nro_operacion', nroOperacion)
    .limit(1)
    .maybeSingle()
  return data ?? null
}

export async function crearGasto(payload: GastoPayload): Promise<void> {
  if (!payload.monto || payload.monto <= 0) {
    throw new Error('El monto debe ser mayor a 0.')
  }
  const fechaISO = toISO(payload.fecha)
  if (fechaISO > new Date().toISOString().slice(0, 10)) {
    throw new Error('La fecha del gasto no puede ser futura.')
  }

  if (payload.nro_operacion) {
    const duplicado = await buscarGastoDuplicado(payload.nro_operacion)
    if (duplicado) {
      throw new Error(
        `Ya existe un gasto con ese número de operación: ${duplicado.fecha} · ${duplicado.categoria} · ${duplicado.monto} · pagado por ${duplicado.pagado_por}.`
      )
    }
  }

  // cotizacion NUNCA es la de hoy salvo que coincida con la fecha del gasto — replica obtenerCotizacion(fecha) del bot
  const cotizacion = await obtenerCotizacion(fechaISO)

  // Mismo criterio que services/sheets.ts del bot (registrarGasto)
  const monto_ars = payload.moneda === 'USD' ? (cotizacion > 0 ? +(payload.monto * cotizacion).toFixed(2) : null) : payload.monto
  const monto_usd = payload.moneda === 'ARS' ? (cotizacion > 0 ? +(payload.monto / cotizacion).toFixed(2) : null) : payload.monto

  const registrado_por = await registradoPorActual()
  const supabase = createAdminClient()
  const id = `GAS-${Date.now()}`
  const timestamp = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })

  const { error } = await supabase.from('gastos').insert({
    ...payload,
    id,
    cotizacion,
    monto_ars,
    monto_usd,
    registrado_por,
    timestamp,
  })
  if (error?.code === '23505') throw new Error(`El número de operación ${payload.nro_operacion} ya fue registrado.`)
  if (error) throw new Error(error.message)
}

export async function obtenerGasto(id: string): Promise<Gasto | null> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('gastos').select('*').eq('id', id).single()
  return data as Gasto | null
}

export async function editarGasto(id: string, payload: GastoPayload): Promise<void> {
  if (!payload.monto || payload.monto <= 0) {
    throw new Error('El monto debe ser mayor a 0.')
  }
  const fechaISO = toISO(payload.fecha)
  if (fechaISO > new Date().toISOString().slice(0, 10)) {
    throw new Error('La fecha del gasto no puede ser futura.')
  }

  // Recalcula cotizacion/monto_ars/monto_usd con la fecha (posiblemente nueva) del gasto
  const cotizacion = await obtenerCotizacion(fechaISO)
  const monto_ars = payload.moneda === 'USD' ? (cotizacion > 0 ? +(payload.monto * cotizacion).toFixed(2) : null) : payload.monto
  const monto_usd = payload.moneda === 'ARS' ? (cotizacion > 0 ? +(payload.monto / cotizacion).toFixed(2) : null) : payload.monto

  const supabase = createAdminClient()
  const { error } = await supabase.from('gastos').update({
    ...payload,
    cotizacion,
    monto_ars,
    monto_usd,
  }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function eliminarGasto(id: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('gastos').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
