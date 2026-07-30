'use client'

import { useState } from 'react'
import { crearGasto, editarGasto } from '@/app/actions/gastos'
import type { GastoPayload } from '@/app/actions/gastos'

export function useGastoSubmit() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(payload: GastoPayload, editId?: string): Promise<boolean> {
    setLoading(true)
    setError('')
    try {
      if (editId) await editarGasto(editId, payload)
      else await crearGasto(payload)
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
