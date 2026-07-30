import { NextRequest, NextResponse } from 'next/server'
import { validarAuthBot, esTitularValido } from '@/lib/bot-auth'
import { crearGasto, type GastoPayload } from '@/app/actions/gastos'

export async function POST(req: NextRequest) {
  if (!validarAuthBot(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as GastoPayload & { registrado_por: string }
  if (!esTitularValido(body.registrado_por)) {
    return NextResponse.json({ error: `registrado_por inválido: ${body.registrado_por}` }, { status: 400 })
  }

  const { registrado_por, ...payload } = body
  try {
    await crearGasto(payload, registrado_por)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al crear el gasto'
    const msgLower = msg.toLowerCase()
    const esDuplicado = msgLower.includes('ya fue registrado') || msgLower.includes('ya existe un gasto')
    return NextResponse.json({ error: msg }, { status: esDuplicado ? 409 : 400 })
  }
}
