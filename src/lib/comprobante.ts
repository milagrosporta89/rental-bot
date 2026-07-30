import { createAdminClient } from '@/lib/supabase/admin'

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

export type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'

export interface DatosComprobanteOCR {
  fecha: string
  monto: number
  moneda: string
  nombreOrdenante: string
  nombreDestinatario: string
  bancoOrigen: string
  bancoDestino: string
  cbuDestino: string
  nroOperacion: string
}

async function subirComprobante(base64: string, mediaType: MediaType, nombreArchivo: string): Promise<string> {
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

/** OCR (Claude Vision) + subida a Supabase Storage. Usado tanto por /api/comprobante (web) como /api/bot/comprobante (bot). */
export async function extraerYSubirComprobante(
  base64: string,
  mediaType: MediaType,
  tipo: 'gasto' | 'ingreso'
): Promise<{ datos: DatosComprobanteOCR; url: string }> {
  const archivoBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }

  let datos: DatosComprobanteOCR
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
    throw new Error('No se pudo leer el comprobante')
  }

  if (!datos || datos.monto === 0) {
    throw new Error('Comprobante ilegible o sin monto')
  }

  const fechaStr = (datos.fecha ?? '').replace(/\//g, '-') || String(Date.now())
  const nroOperacion = String(datos.nroOperacion || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_')
  const nombre = `${tipo}_${fechaStr}_${nroOperacion}`
  const url = await subirComprobante(base64, mediaType, nombre).catch(() => '')

  return { datos, url }
}
