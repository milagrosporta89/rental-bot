'use client'

import { useRef } from 'react'
import { Calendar } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export interface FiltrosAvanzadosIngresos {
  fechaDesde: string
  fechaHasta: string
  destinatarios: Set<string>
}

export function filtrosAvanzadosVacios(): FiltrosAvanzadosIngresos {
  return { fechaDesde: '', fechaHasta: '', destinatarios: new Set() }
}

export function contarFiltrosActivos(f: FiltrosAvanzadosIngresos): number {
  return f.destinatarios.size + (f.fechaDesde || f.fechaHasta ? 1 : 0)
}

interface Props {
  open: boolean
  onClose: () => void
  value: FiltrosAvanzadosIngresos
  onChange: (v: FiltrosAvanzadosIngresos) => void
  destinatarios: string[]
}

export function FiltrosModal({ open, onClose, value, onChange, destinatarios }: Props) {
  const desdeRef = useRef<HTMLInputElement>(null)
  const hastaRef = useRef<HTMLInputElement>(null)

  function toggleDestinatario(v: string) {
    const next = new Set(value.destinatarios)
    next.has(v) ? next.delete(v) : next.add(v)
    onChange({ ...value, destinatarios: next })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-slate-700 font-medium">Filtros</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1 max-h-[60dvh] overflow-y-auto">
          <div className="space-y-2">
            <Label className="text-xs text-slate-500">Rango de fechas</Label>
            <div className="grid grid-cols-2 gap-2">
              <div
                className="flex h-10 items-center rounded-md border border-input bg-background px-3 gap-2 cursor-pointer focus-within:ring-1 focus-within:ring-ring"
                onClick={() => desdeRef.current?.showPicker()}
              >
                <input
                  ref={desdeRef}
                  type="date"
                  value={value.fechaDesde}
                  onChange={e => onChange({ ...value, fechaDesde: e.target.value })}
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm text-slate-700 [&::-webkit-calendar-picker-indicator]:hidden"
                />
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </div>
              <div
                className="flex h-10 items-center rounded-md border border-input bg-background px-3 gap-2 cursor-pointer focus-within:ring-1 focus-within:ring-ring"
                onClick={() => hastaRef.current?.showPicker()}
              >
                <input
                  ref={hastaRef}
                  type="date"
                  value={value.fechaHasta}
                  onChange={e => onChange({ ...value, fechaHasta: e.target.value })}
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm text-slate-700 [&::-webkit-calendar-picker-indicator]:hidden"
                />
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-slate-500">Destinatario</Label>
            <div className="grid grid-cols-2 gap-2">
              {destinatarios.map(d => (
                <label key={d} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value.destinatarios.has(d)}
                    onChange={() => toggleDestinatario(d)}
                    className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between gap-2 mt-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(filtrosAvanzadosVacios())}
            className="w-full sm:w-auto text-slate-500 cursor-pointer"
          >
            Limpiar filtros
          </Button>
          <Button size="sm" onClick={onClose} className="w-full sm:w-auto cursor-pointer">
            Aceptar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
