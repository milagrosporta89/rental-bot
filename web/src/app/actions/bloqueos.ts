'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { registradoPorActual } from '@/lib/auth'

export interface BloqueoPayload {
  casa: string
  fecha_desde: string
  fecha_hasta: string
  motivo: string
  notas: string | null
}

export async function crearBloqueo(payload: BloqueoPayload): Promise<void> {
  const registrado_por = await registradoPorActual()
  const supabase = createAdminClient()
  const { error } = await supabase.from('bloqueos').insert({
    ...payload,
    id: `BLQ-${Date.now()}`,
    registrado_por,
  })
  if (error) throw new Error(error.message)
}

export async function editarBloqueo(id: string, payload: BloqueoPayload): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('bloqueos').update(payload).eq('id', id)
  if (error) throw new Error(error.message)
}
