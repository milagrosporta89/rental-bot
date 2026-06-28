'use client'

import { useRef, useState } from 'react'
import { parse, format, isValid } from 'date-fns'
import { Calendar } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Bloqueo, MotivoBloqueo } from '@/lib/types'
import { toISO, toDDMMYYYY } from '@/lib/dates'
import { crearBloqueo, editarBloqueo, eliminarBloqueo } from '@/app/actions/bloqueos'

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
  const [confirmEliminar, setConfirmEliminar] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const desdeRef = useRef<HTMLInputElement>(null)
  const hastaRef = useRef<HTMLInputElement>(null)

  const minHasta = (() => {
    const d = parse(form.fecha_desde, 'dd/MM/yyyy', new Date())
    if (!isValid(d)) return ''
    return format(d, 'yyyy-MM-dd')
  })()

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

  async function handleEliminar() {
    if (!bloqueo) return
    setEliminando(true)
    try {
      await eliminarBloqueo(bloqueo.id)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar. Intentá de nuevo.')
      setConfirmEliminar(false)
    } finally {
      setEliminando(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-slate-700 font-medium">{bloqueo ? 'Editar bloqueo' : 'Bloquear fechas'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 md:gap-y-4 pt-2">
          <div className="col-span-1 md:col-span-2 space-y-1">
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

          <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-x-4 gap-y-2 md:gap-y-4 md:contents">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Desde</Label>
              <div
                className="flex h-10 items-center rounded-md border border-input bg-background px-3 gap-2 cursor-pointer focus-within:ring-1 focus-within:ring-ring"
                onClick={() => desdeRef.current?.showPicker()}
              >
                <input
                  ref={desdeRef}
                  type="date"
                  value={form.fecha_desde ? toISO(form.fecha_desde) : ''}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  onChange={(e) => {
                    const nuevaDesde = toDDMMYYYY(e.target.value)
                    const desdeD = parse(nuevaDesde, 'dd/MM/yyyy', new Date())
                    const hastaD = parse(form.fecha_hasta, 'dd/MM/yyyy', new Date())
                    setForm((f) => ({
                      ...f,
                      fecha_desde: nuevaDesde,
                      fecha_hasta: isValid(hastaD) && hastaD >= desdeD ? f.fecha_hasta : nuevaDesde,
                    }))
                    setError('')
                  }}
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm [&::-webkit-calendar-picker-indicator]:hidden"
                />
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Hasta</Label>
              <div
                className="flex h-10 items-center rounded-md border border-input bg-background px-3 gap-2 cursor-pointer focus-within:ring-1 focus-within:ring-ring"
                onClick={() => {
                  if (hastaRef.current) {
                    hastaRef.current.min = minHasta
                    hastaRef.current.showPicker()
                  }
                }}
              >
                <input
                  ref={hastaRef}
                  type="date"
                  value={form.fecha_hasta ? toISO(form.fecha_hasta) : ''}
                  min={minHasta}
                  onChange={(e) => set('fecha_hasta', toDDMMYYYY(e.target.value))}
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm [&::-webkit-calendar-picker-indicator]:hidden"
                />
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </div>
            </div>
          </div>

          <div className="col-span-1 md:col-span-2 space-y-1">
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

          <div className="col-span-1 md:col-span-2 space-y-1">
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

        <div className="flex flex-col sm:flex-row sm:justify-end gap-2 mt-4">
          {bloqueo ? (
            <Button variant="ghost" size="sm" onClick={() => setConfirmEliminar(true)} className="w-full sm:w-auto text-slate-500 cursor-pointer">
              Eliminar
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onClose} className="w-full sm:w-auto text-slate-500 cursor-pointer">
              Cancelar
            </Button>
          )}
          <Button size="sm" onClick={handleSubmit} disabled={loading} className="w-full sm:w-auto cursor-pointer">
            {loading ? 'Guardando…' : bloqueo ? 'Guardar' : 'Bloquear'}
          </Button>
        </div>
      </DialogContent>

      {bloqueo && (
        <Dialog open={confirmEliminar} onOpenChange={setConfirmEliminar}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Eliminar bloqueo</DialogTitle>
              <DialogDescription>
                Casa {bloqueo.casa} · {bloqueo.fecha_desde} – {bloqueo.fecha_hasta}
                <br />
                Esta acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setConfirmEliminar(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" size="sm" disabled={eliminando} onClick={handleEliminar}>
                Eliminar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  )
}
