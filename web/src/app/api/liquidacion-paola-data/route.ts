import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()
  const [
    { data: ingresos, error: ie },
    { data: gastosBolsillo, error: ge },
    { data: gastosComision, error: ce },
    { data: reservas, error: re },
  ] = await Promise.all([
    supabase.from('ingresos').select('*').eq('nombre_destinatario', 'Paola'),
    supabase.from('gastos').select('*').eq('pagado_por', 'Paola'),
    supabase.from('gastos').select('*').eq('categoria', 'comision'),
    supabase.from('reservas').select('*'),
  ])
  if (ie) return NextResponse.json({ error: ie.message }, { status: 500 })
  if (ge) return NextResponse.json({ error: ge.message }, { status: 500 })
  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 })
  if (re) return NextResponse.json({ error: re.message }, { status: 500 })

  return NextResponse.json({
    ingresosPaola: ingresos ?? [],
    gastosPaolaBolsillo: gastosBolsillo ?? [],
    gastosComision: gastosComision ?? [],
    reservas: reservas ?? [],
  })
}
