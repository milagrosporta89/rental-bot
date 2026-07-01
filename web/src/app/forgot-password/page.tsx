'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { solicitarReset } from './actions'

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError('')
    const res = await solicitarReset(formData)
    if (res?.error) {
      setError(res.error)
      setLoading(false)
    } else {
      setEnviado(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Restablecer contraseña</h1>
          <p className="text-sm text-slate-500 mt-1">
            Ingresá tu email y te mandamos un link para crear una nueva contraseña.
          </p>
        </div>

        {enviado ? (
          <div className="space-y-4">
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              Si el email está registrado, ya te mandamos el link. Revisá tu bandeja de entrada.
            </p>
            <Link href="/login" className="block text-sm text-slate-500 hover:text-slate-700 text-center">
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Email</Label>
              <Input name="email" type="email" required className="text-sm" autoComplete="email" autoFocus />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Enviando…' : 'Enviar link'}
            </Button>
            <Link href="/login" className="block text-sm text-slate-500 hover:text-slate-700 text-center">
              Volver al inicio de sesión
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
