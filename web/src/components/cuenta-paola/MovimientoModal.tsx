'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toDDMMYYYY } from '@/lib/dates'
import { crearMovimientoInterno } from '@/app/actions/movimientosInternos'
import type { SentidoMovimiento } from '@/lib/types'
import { FormularioMovimientoInterno, type MovimientoFormState } from './FormularioMovimientoInterno'

interface Props {
  open: boolean
  prefill?: { monto: number; sentido: SentidoMovimiento; detalle?: string }
  onClose: () => void
  onSaved: () => void
}

const FORM_INICIAL: MovimientoFormState = {
  fecha: new Date().toISOString().slice(0, 10),
  monto: '',
  moneda: 'ARS',
  cotizacion: '',
  sentido: '',
  detalle: '',
}

/**
 * El padre (CuentaPaolaPage) le pasa un `key` que cambia cada vez que se abre el modal,
 * forzando un remount — así el formulario arranca limpio/con el prefill correcto sin
 * necesidad de resetear estado síncronamente desde un efecto.
 */
export function MovimientoModal({ open, prefill, onClose, onSaved }: Props) {
  const [form, setForm] = useState<MovimientoFormState>(() => ({
    ...FORM_INICIAL,
    monto: prefill ? prefill.monto.toFixed(2) : '',
    sentido: prefill?.sentido ?? '',
    detalle: prefill?.detalle ?? '',
  }))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    fetch('/api/cotizacion')
      .then(r => r.json())
      .then((d: { cotizacion: number }) => {
        if (d.cotizacion > 0) setForm(prev => ({ ...prev, cotizacion: String(Math.round(d.cotizacion)) }))
      })
      .catch(() => {})
  }, [open])

  function onChange(k: keyof MovimientoFormState, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
    setError('')
  }

  async function handleSubmit() {
    const montoNum = parseFloat(form.monto) || 0
    const cotizNum = parseFloat(form.cotizacion) || 0
    if (!form.fecha) { setError('La fecha es obligatoria.'); return }
    if (!montoNum || montoNum <= 0) { setError('El monto debe ser mayor a 0.'); return }
    if (!form.sentido) { setError('Elegí el sentido del movimiento.'); return }

    const monto_usd = form.moneda === 'USD' ? montoNum : (cotizNum > 0 ? +(montoNum / cotizNum).toFixed(2) : null)
    const monto_ars = form.moneda === 'ARS' ? montoNum : (cotizNum > 0 ? +(montoNum * cotizNum).toFixed(2) : null)

    setLoading(true)
    try {
      await crearMovimientoInterno({
        fecha: toDDMMYYYY(form.fecha),
        monto: montoNum,
        moneda: form.moneda,
        cotizacion: cotizNum,
        monto_ars,
        monto_usd,
        sentido: form.sentido,
        detalle: form.detalle.trim() || null,
        comprobante_url: null,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar. Podés reintentar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar movimiento</DialogTitle>
        </DialogHeader>

        <FormularioMovimientoInterno form={form} onChange={onChange} error={error} />

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
