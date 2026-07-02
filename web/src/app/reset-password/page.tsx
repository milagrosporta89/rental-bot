'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [listo, setListo] = useState(false)
  const [errorCodigo, setErrorCodigo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    // createBrowserClient ya intercambia el ?code= automáticamente (detectSessionInUrl: true).
    // Solo hay que escuchar el evento PASSWORD_RECOVERY que dispara cuando lo resuelve.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setListo(true)
    })

    // Si después de 5 segundos no llegó el evento, el link no era válido.
    const timeout = setTimeout(() => {
      setErrorCodigo('El link no es válido o ya fue usado. Pedí uno nuevo.')
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  // Cancelar el timeout de error si el evento llegó antes
  useEffect(() => {
    if (listo) setErrorCodigo('')
  }, [listo])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const nueva = (form.elements.namedItem('password') as HTMLInputElement).value
    const confirmar = (form.elements.namedItem('confirmar') as HTMLInputElement).value

    if (nueva !== confirmar) { setError('Las contraseñas no coinciden.'); return }
    if (nueva.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }

    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: nueva })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setExito(true)
      setTimeout(() => router.push('/'), 2000)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-xl font-semibold text-slate-800">Nueva contraseña</h1>

        {!listo && !errorCodigo && (
          <p className="text-sm text-slate-400">Verificando el link…</p>
        )}

        {errorCodigo && (
          <div className="space-y-4">
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {errorCodigo}
            </p>
            <Link href="/forgot-password" className="block text-sm text-slate-500 hover:text-slate-700 text-center">
              Pedir un nuevo link
            </Link>
          </div>
        )}

        {listo && !exito && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Nueva contraseña</Label>
              <Input name="password" type="password" required className="text-sm" autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Confirmar contraseña</Label>
              <Input name="confirmar" type="password" required className="text-sm" />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Guardando…' : 'Guardar contraseña'}
            </Button>
          </form>
        )}

        {exito && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            ¡Contraseña actualizada! Redirigiendo…
          </p>
        )}
      </div>
    </div>
  )
}
