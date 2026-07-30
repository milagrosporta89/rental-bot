import { NextRequest, NextResponse } from 'next/server'
import { validarAuthBot, esTitularValido } from '@/lib/bot-auth'
import { registrarPago, type IngresoPayload } from '@/app/actions/ingresos'

export async function POST(req: NextRequest) {
  if (!validarAuthBot(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as IngresoPayload & { registrado_por: string }
  if (!esTitularValido(body.registrado_por)) {
    return NextResponse.json({ error: `registrado_por inválido: ${body.registrado_por}` }, { status: 400 })
  }
  if (!body.id_reserva) {
    return NextResponse.json({ error: 'id_reserva es obligatorio' }, { status: 400 })
  }

  const { registrado_por, id_reserva, ...payload } = body
  try {
    await registrarPago(id_reserva, { ...payload, id_reserva }, registrado_por)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al registrar el ingreso'
    const esDuplicado = msg.includes('ya fue registrado')
    return NextResponse.json({ error: msg }, { status: esDuplicado ? 409 : 400 })
  }
}
