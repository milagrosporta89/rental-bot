import { createClient } from './supabase/server'

/** Nombre del titular logueado (guardado en user_metadata.titular al crear su cuenta), o su email si no está seteado */
export async function registradoPorActual(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return (user?.user_metadata?.titular as string | undefined) ?? user?.email ?? 'Desconocido'
}
