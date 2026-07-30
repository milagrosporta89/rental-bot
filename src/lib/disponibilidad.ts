import { createAdminClient } from '@/lib/supabase/admin'
import { solapan } from '@/lib/dates'

/**
 * Busca conflictos de fechas para una casa, cruzando reservas activas y bloqueos.
 * `casa` puede venir como "3" o "Casa 3" — se normaliza para consultar cada tabla
 * con el formato real que usa (bloqueos.casa = "3", reservas.casa = "Casa 3").
 */
export async function verificarDisponibilidad(
  casa: string,
  fechaEntrada: string,
  fechaSalida: string,
  opts?: { excludeReservaId?: string; excludeBloqueoId?: string }
): Promise<string | null> {
  const supabase = createAdminClient()
  const casaNum = casa.replace(/\D/g, '') || casa
  const rango = { desde: fechaEntrada, hasta: fechaSalida }

  const { data: reservas } = await supabase
    .from('reservas')
    .select('id, nombre_pax, fecha_entrada, fecha_salida')
    .eq('casa', `Casa ${casaNum}`)
    .neq('estado_reserva', 'cancelada')

  const reservaConflicto = (reservas ?? []).find(r =>
    r.id !== opts?.excludeReservaId &&
    solapan(rango, { desde: r.fecha_entrada, hasta: r.fecha_salida })
  )
  if (reservaConflicto) {
    return `Casa ${casaNum} ya tiene una reserva de ${reservaConflicto.nombre_pax} en ese período (${reservaConflicto.fecha_entrada} – ${reservaConflicto.fecha_salida}).`
  }

  const { data: bloqueos } = await supabase
    .from('bloqueos')
    .select('id, motivo, fecha_desde, fecha_hasta')
    .eq('casa', casaNum)

  const bloqueoConflicto = (bloqueos ?? []).find(b =>
    b.id !== opts?.excludeBloqueoId &&
    solapan(rango, { desde: b.fecha_desde, hasta: b.fecha_hasta })
  )
  if (bloqueoConflicto) {
    return `Casa ${casaNum} está bloqueada en ese período (${bloqueoConflicto.fecha_desde} – ${bloqueoConflicto.fecha_hasta}).`
  }

  return null
}
