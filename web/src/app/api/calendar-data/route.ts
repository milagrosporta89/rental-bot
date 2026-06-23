import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()
  const [{ data: reservas, error: e1 }, { data: bloqueos, error: e2 }] = await Promise.all([
    supabase.from('reservas').select('*').or('estado_reserva.neq.cancelada,estado_reserva.is.null'),
    supabase.from('bloqueos').select('*'),
  ])
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
  return NextResponse.json({ reservas: reservas ?? [], bloqueos: bloqueos ?? [] })
}
