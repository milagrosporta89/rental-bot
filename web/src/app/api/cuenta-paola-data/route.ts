import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { toISO } from '@/lib/dates'
import type { Reserva } from '@/lib/types'

// Solo entran a la contabilidad registros de julio 2026 en adelante.
// Los gastos e ingresos anteriores existen en prod (datos migrados del sistema artesanal)
// y se conservan para cruces de rentabilidad a fin de año, pero no deben mezclarse con
// la cuenta corriente nueva de Paola.
const INICIO_CONTABILIDAD = '2026-07-01'

export async function GET() {
  const supabase = createAdminClient()
  const [
    { data: ingresos, error: ie },
    { data: gastos, error: ge },
    { data: movimientos, error: me },
    { data: reservas, error: re },
  ] = await Promise.all([
    supabase.from('ingresos').select('*').eq('nombre_destinatario', 'Paola'),
    supabase.from('gastos').select('*').eq('pagado_por', 'Paola'),
    supabase.from('movimientos_internos').select('*'),
    supabase.from('reservas').select('*'),
  ])
  if (ie) return NextResponse.json({ error: ie.message }, { status: 500 })
  if (ge) return NextResponse.json({ error: ge.message }, { status: 500 })
  if (me) return NextResponse.json({ error: me.message }, { status: 500 })
  if (re) return NextResponse.json({ error: re.message }, { status: 500 })

  const ingresosFiltrados = (ingresos ?? []).filter(i => toISO(i.fecha) >= INICIO_CONTABILIDAD)
  const gastosFiltrados = (gastos ?? []).filter(g => toISO(g.fecha) >= INICIO_CONTABILIDAD)

  const reservasPorId = new Map((reservas ?? []).map((r: Reserva) => [r.id, r]))
  const cancelacionesPendientes = ingresosFiltrados.filter(i => {
    if (i.resolucion_cancelacion) return false
    const reserva = i.id_reserva ? reservasPorId.get(i.id_reserva) : null
    return reserva?.estado_reserva === 'cancelada'
  })

  return NextResponse.json({
    ingresosPaola: ingresosFiltrados,
    gastosPaola: gastosFiltrados,
    movimientosInternos: movimientos ?? [],
    reservas: reservas ?? [],
    cancelacionesPendientes,
  })
}
