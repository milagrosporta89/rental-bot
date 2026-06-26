'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Bloqueo, MotivoBloqueo } from '@/lib/types'
import { toISO, toDDMMYYYY } from '@/lib/dates'
import { crearBloqueo, editarBloqueo } from '@/app/actions/bloqueos'

interface Props {
  bloqueo?: Bloqueo
  casa?: string
  fechaDesde?: string
  fechaHasta?: string
  onClose: () => void
  onSaved: () => void
}

export function BloqueoModal({ bloqueo, casa, fechaDesde, fechaHasta, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    casa: bloqueo?.casa ?? casa ?? '1',
    fecha_desde: bloqueo?.fecha_desde ?? fechaDesde ?? '',
    fecha_hasta: bloqueo?.fecha_hasta ?? fechaHasta ?? '',
    motivo: bloqueo?.motivo ?? ('limpieza' as MotivoBloqueo),
    notas: bloqueo?.notas ?? '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
    setError('')
  }

  async function handleSubmit() {
    if (!form.fecha_desde || !form.fecha_hasta) return setError('Las fechas son obligatorias.')

    setLoading(true)
    try {
      const payload = {
        casa: form.casa,
        fecha_desde: form.fecha_desde,
        fecha_hasta: form.fecha_hasta,
        motivo: form.motivo,
        notas: form.notas.trim() || null,
      }
      bloqueo ? await editarBloqueo(bloqueo.id, payload) : await crearBloqueo(payload)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-slate-700 font-medium">{bloqueo ? 'Editar bloqueo' : 'Bloquear fechas'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-slate-500">Casa</Label>
            <Select value={form.casa} onValueChange={(v) => set('casa', v)}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['1','2','3','4','5'].map((n) => (
                  <SelectItem key={n} value={n}>Casa {n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Desde</Label>
            <Input
              type="date"
              value={form.fecha_desde ? toISO(form.fecha_desde) : ''}
              onChange={(e) => set('fecha_desde', toDDMMYYYY(e.target.value))}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Hasta</Label>
            <Input
              type="date"
              value={form.fecha_hasta ? toISO(form.fecha_hasta) : ''}
              onChange={(e) => set('fecha_hasta', toDDMMYYYY(e.target.value))}
              className="text-sm"
            />
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-slate-500">Motivo</Label>
            <Select value={form.motivo} onValueChange={(v) => set('motivo', v as MotivoBloqueo)}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="limpieza">Limpieza</SelectItem>
                <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                <SelectItem value="uso_personal">Uso personal</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-slate-500">Notas</Label>
            <Textarea
              value={form.notas}
              onChange={(e) => set('notas', e.target.value)}
              placeholder="Opcional"
              rows={2}
              className="text-sm resize-none"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-500 cursor-pointer">
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading} className="cursor-pointer">
            {loading ? 'Guardando…' : bloqueo ? 'Guardar' : 'Bloquear'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
