'use client'

import { useState } from 'react'
import { crearGasto } from '@/app/actions/gastos'
import type { GastoPayload } from '@/app/actions/gastos'

export function useGastoSubmit() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(payload: GastoPayload): Promise<boolean> {
    setLoading(true)
    setError('')
    try {
      await crearGasto(payload)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar. Podés reintentar.')
      return false
    } finally {
      setLoading(false)
    }
  }

  return { submit, loading, error }
}
