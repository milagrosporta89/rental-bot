import { NextRequest, NextResponse } from 'next/server'
import { validarAuthBot } from '@/lib/bot-auth'
import { createAdminClient } from '@/lib/supabase/admin'

const TITULARES_SALDO = ['Francisco', 'Milagros', 'Inés', 'Fernando'] as const

export async function GET(req: NextRequest) {
  if (!validarAuthBot(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()
  const [{ data: reservas, error: re }, { data: ingresos, error: ie }, { data: gastos, error: ge }] = await Promise.all([
    supabase.from('reservas').select('id, titular'),
    supabase.from('ingresos').select('id_reserva, monto_usd'),
    supabase.from('gastos').select('pagado_por, monto_usd'),
  ])
  if (re) return NextResponse.json({ error: re.message }, { status: 500 })
  if (ie) return NextResponse.json({ error: ie.message }, { status: 500 })
  if (ge) return NextResponse.json({ error: ge.message }, { status: 500 })

  const titularPorReserva = new Map((reservas ?? []).map(r => [r.id, r.titular]))

  const saldos = TITULARES_SALDO.map(titular => {
    const totalIngresos = (ingresos ?? [])
      .filter(i => i.id_reserva && titularPorReserva.get(i.id_reserva) === titular)
      .reduce((s, i) => s + (i.monto_usd ?? 0), 0)
    const totalGastos = (gastos ?? [])
      .filter(g => g.pagado_por === titular)
      .reduce((s, g) => s + (g.monto_usd ?? 0), 0)
    return { titular, saldo_usd: totalIngresos - totalGastos }
  })

  return NextResponse.json({ saldos })
}
