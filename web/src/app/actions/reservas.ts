'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { toDDMMYYYY } from '@/lib/dates'
import { registradoPorActual } from '@/lib/auth'
import { CASA_TITULAR } from '@/lib/types'
import { verificarDisponibilidad } from '@/lib/disponibilidad'

async function getNextId(supabase: ReturnType<typeof createAdminClient>): Promise<string> {
  const { data } = await supabase.from('reservas').select('id')
  const max = (data ?? []).reduce((m, r) => Math.max(m, parseInt(r.id, 10) || 0), 0)
  return String(max + 1)
}

export interface ReservaPayload {
  casa: string
  estado_reserva: string
  titular: string
  nombre_pax: string
  fecha_entrada: string
  fecha_salida: string
  cantidad_pax: number
  cantidad_noches: number
  telefono: string | null
  monto_total_usd: number
  saldo_usd: number
  estado_pago: string
  plataforma: string
  notas: string | null
  cotizacion: number
}

function toTitleCase(s: string): string {
  return s.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

export async function crearReserva(payload: ReservaPayload): Promise<{ id: string }> {
  const conflicto = await verificarDisponibilidad(payload.casa, payload.fecha_entrada, payload.fecha_salida)
  if (conflicto) throw new Error(conflicto)

  const registrado_por = await registradoPorActual()
  const supabase = createAdminClient()
  const id = await getNextId(supabase)
  const now = new Date()
  const timestamp = now.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  const casaNum = payload.casa.replace(/\D/g, '')
  const casa = casaNum ? `Casa ${casaNum}` : payload.casa   // siempre "Casa N"
  const titular = CASA_TITULAR[casaNum] ?? payload.titular
  const nombre_pax = toTitleCase(payload.nombre_pax)

  const { error } = await supabase.from('reservas').insert({
    ...payload,
    casa,
    titular,
    nombre_pax,
    id,
    fecha_registro: toDDMMYYYY(now.toISOString().slice(0, 10)),
    registrado_por,
    timestamp,
  })
  if (error) throw new Error(error.message)

  await supabase.from('historial').insert({
    timestamp,
    id_registro: id,
    tipo_registro: 'reserva',
    campo: 'creacion',
    valor_anterior: null,
    valor_nuevo: id,
    modificado_por: registrado_por,
    aprobado_por: registrado_por,
  })

  return { id }
}

export async function editarReserva(
  id: string,
  payload: ReservaPayload,
  anterior: Record<string, unknown>
): Promise<void> {
  if (payload.estado_reserva !== 'cancelada') {
    const conflicto = await verificarDisponibilidad(payload.casa, payload.fecha_entrada, payload.fecha_salida, { excludeReservaId: id })
    if (conflicto) throw new Error(conflicto)
  }

  const registrado_por = await registradoPorActual()
  const supabase = createAdminClient()
  const casaNum = payload.casa.replace(/\D/g, '')
  const casa = casaNum ? `Casa ${casaNum}` : payload.casa
  const titular = CASA_TITULAR[casaNum] ?? payload.titular
  const nombre_pax = toTitleCase(payload.nombre_pax)
  const { error } = await supabase.from('reservas').update({ ...payload, casa, titular, nombre_pax, registrado_por }).eq('id', id)
  if (error) throw new Error(error.message)

  const timestamp = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  const campos = (Object.keys(payload) as (keyof ReservaPayload)[]).filter(
    (k) => String(payload[k]) !== String(anterior[k] ?? '')
  )
  if (campos.length > 0) {
    await supabase.from('historial').insert(
      campos.map((campo) => ({
        timestamp,
        id_registro: id,
        tipo_registro: 'reserva',
        campo,
        valor_anterior: String(anterior[campo] ?? ''),
        valor_nuevo: String(payload[campo] ?? ''),
        modificado_por: registrado_por,
        aprobado_por: registrado_por,
      }))
    )
  }
}

export async function editarEstadoReserva(id: string, estado: string): Promise<void> {
  const supabase = createAdminClient()
  // Al cancelar ya no queda nada por cobrar — el monto original y los pagos ya hechos quedan intactos en su historial
  const updates: Record<string, unknown> = estado === 'cancelada'
    ? { estado_reserva: estado, saldo_usd: 0 }
    : { estado_reserva: estado }
  const { error } = await supabase.from('reservas').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
}
