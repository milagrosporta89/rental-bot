'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputPassword } from '@/components/ui/input-password'
import { login } from './actions'

export function LoginForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError('')
    const res = await login(formData)
    if (res?.error) {
      setError(res.error)
      setLoading(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Email</Label>
        <Input name="email" type="email" required className="text-sm" autoComplete="email" />
      </div>
      <InputPassword name="password" label="Contraseña" autoComplete="current-password" />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full cursor-pointer">
        {loading ? 'Ingresando…' : 'Ingresar'}
      </Button>
      <Link href="/forgot-password" className="block text-xs text-slate-400 hover:text-slate-600 text-center">
        ¿Olvidaste tu contraseña?
      </Link>
    </form>
  )
}
