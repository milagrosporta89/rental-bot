'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function solicitarReset(formData: FormData): Promise<{ error?: string }> {
  const email = (formData.get('email') as string).trim()
  const headersList = await headers()
  const origin = headersList.get('origin') ?? `https://${headersList.get('host')}`

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  })
  // No distinguimos "email no existe" — respuesta genérica siempre
  if (error && error.message !== 'User not found') return { error: error.message }
  return {}
}
