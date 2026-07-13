import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { esDeContabilidadNueva } from '@/lib/cuentaPaola'
import { toISO } from '@/lib/dates'
import type { Reserva } from '@/lib/types'

export async function GET() {
  const supabase = createAdminClient()
  const [{ data: ingresos, error: ie }, { data: reservas, error: re }] = await Promise.all([
    supabase.from('ingresos').select('*'),
    supabase.from('reservas').select('*'),
  ])
  if (ie) return NextResponse.json({ error: ie.message }, { status: 500 })
  if (re) return NextResponse.json({ error: re.message }, { status: 500 })

  const reservasPorId = new Map((reservas ?? []).map((r: Reserva) => [r.id, r]))
  // Meses migrados sin reserva ya habilitados a mano: la Cuenta Paola no los toca (cruza ingresos
  // solo por id_reserva), así que mostrarlos acá no afecta esa reconciliación — se habilitan mes a
  // mes, no se extienden solos.
  const MESES_MIGRADOS_HABILITADOS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']
  const esDeMesMigradoHabilitado = (fecha: string) => MESES_MIGRADOS_HABILITADOS.includes(toISO(fecha).slice(0, 7))
  const ingresosFiltrados = (ingresos ?? []).filter(i =>
    esDeContabilidadNueva(i.fecha, i.id_reserva, reservasPorId) || esDeMesMigradoHabilitado(i.fecha)
  )

  return NextResponse.json({ ingresos: ingresosFiltrados, reservas: reservas ?? [] })
}
