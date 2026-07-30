import { NextRequest, NextResponse } from 'next/server'
import { validarAuthBot } from '@/lib/bot-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  if (!validarAuthBot(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const buscar = req.nextUrl.searchParams.get('buscar')
  const pendientes = req.nextUrl.searchParams.get('pendientes')

  const supabase = createAdminClient()
  let query = supabase
    .from('reservas')
    .select('id, nombre_pax, casa, fecha_entrada, fecha_salida, saldo_usd, estado_pago')
    .neq('estado_reserva', 'cancelada')

  if (pendientes) {
    query = query.neq('estado_pago', 'pagado')
  }
  if (buscar) {
    query = query.or(`nombre_pax.ilike.%${buscar}%,id.eq.${buscar}`)
  }

  const { data, error } = await query.order('fecha_entrada', { ascending: false }).limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reservas: data ?? [] })
}
