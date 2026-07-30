import { NextRequest, NextResponse } from 'next/server'
import { validarAuthBot } from '@/lib/bot-auth'
import { extraerYSubirComprobante, type MediaType } from '@/lib/comprobante'

export async function POST(req: NextRequest) {
  if (!validarAuthBot(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const tipo = (form.get('tipo') as string) === 'gasto' ? 'gasto' : 'ingreso'
  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mediaType = file.type as MediaType

  try {
    const { datos, url } = await extraerYSubirComprobante(base64, mediaType, tipo)
    return NextResponse.json({ datos, url })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 422 })
  }
}
