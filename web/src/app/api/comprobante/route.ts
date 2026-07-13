import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Mismo prompt que services/claude.ts del bot
const PROMPT = `Sos un asistente que extrae datos de comprobantes de transferencia bancaria argentinos.
Analizá el documento y extraé los siguientes datos en formato JSON exacto, sin texto adicional:
{
  "fecha": "DD/MM/YYYY",
  "monto": número sin puntos ni comas (ej: 85000),
  "moneda": "ARS" o "USD" según el símbolo o indicación en el comprobante. Si no hay indicación, usá "ARS",
  "nombreOrdenante": "nombre de quien hace la transferencia",
  "nombreDestinatario": "nombre de quien recibe la transferencia",
  "bancoOrigen": "banco desde donde se transfiere",
  "bancoDestino": "banco que recibe",
  "cbuDestino": "CBU o CVU destino, si aparece",
  "nroOperacion": "número de operación o transacción, si aparece"
}
Si algún dato no está visible, usá string vacío o 0 para monto.
Respondé SOLO con el JSON, sin markdown, sin explicaciones.`

type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'

// Bucket público 'comprobantes' (ver migración 009_storage_comprobantes.sql)
async function subirComprobante(
  base64: string,
  mediaType: MediaType,
  nombreArchivo: string,
): Promise<string> {
  const ahora = new Date()
  const mesAnio = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
  const ext = mediaType === 'application/pdf' ? 'pdf' : mediaType.split('/')[1]
  const rutaArchivo = `${mesAnio}/${nombreArchivo}.${ext}`

  const supabase = createAdminClient()
  const { error } = await supabase.storage
    .from('comprobantes')
    .upload(rutaArchivo, Buffer.from(base64, 'base64'), { contentType: mediaType, upsert: true })
  if (error) throw error

  return supabase.storage.from('comprobantes').getPublicUrl(rutaArchivo).data.publicUrl
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  // Tipo de comprobante (ingreso|gasto) determina el prefijo de archivo. Default 'ingreso' para no romper los callers existentes.
  const tipo = (form.get('tipo') as string) === 'gasto' ? 'gasto' : 'ingreso'

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mediaType = file.type as MediaType

  const archivoBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }

  // Extracción con Claude Vision (misma lógica que services/claude.ts)
  let datos = null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: [archivoBlock, { type: 'text', text: PROMPT }] }],
      }),
    })
    const data = await res.json() as { content: Array<{ type: string; text: string }> }
    const raw = data.content[0]?.text?.trim() ?? ''
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    datos = JSON.parse(jsonStr)
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el comprobante' }, { status: 422 })
  }

  if (!datos || datos.monto === 0) {
    return NextResponse.json({ error: 'Comprobante ilegible o sin monto' }, { status: 422 })
  }

  const fechaStr = (datos.fecha ?? '').replace(/\//g, '-') || String(Date.now())
  const nroOperacion = String(datos.nroOperacion || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_')
  const nombre = `${tipo}_${fechaStr}_${nroOperacion}`
  const url = await subirComprobante(base64, mediaType, nombre).catch(() => '')

  return NextResponse.json({ datos, url })
}
