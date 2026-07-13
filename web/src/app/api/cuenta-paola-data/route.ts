import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { esDeContabilidadNueva } from '@/lib/cuentaPaola'
import type { Reserva } from '@/lib/types'

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

  const reservasPorId = new Map((reservas ?? []).map((r: Reserva) => [r.id, r]))

  const ingresosFiltrados = (ingresos ?? []).filter(i => esDeContabilidadNueva(i.fecha, i.id_reserva, reservasPorId))
  const gastosFiltrados = (gastos ?? []).filter(g => esDeContabilidadNueva(g.fecha, g.id_reserva, reservasPorId))
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
