'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CASA_LABELS, PLATAFORMA_LABEL } from '@/lib/types'

export interface FiltrosAvanzados {
  fechaDesde: string
  fechaHasta: string
  casas: Set<string>
  plataformas: Set<string>
}

export function filtrosAvanzadosVacios(): FiltrosAvanzados {
  return { fechaDesde: '', fechaHasta: '', casas: new Set(), plataformas: new Set() }
}

export function contarFiltrosActivos(f: FiltrosAvanzados): number {
  return f.casas.size + f.plataformas.size + (f.fechaDesde || f.fechaHasta ? 1 : 0)
}

interface Props {
  open: boolean
  onClose: () => void
  value: FiltrosAvanzados
  onChange: (v: FiltrosAvanzados) => void
}

const CASAS = ['1', '2', '3', '4', '5']
const PLATAFORMAS = ['directo', 'airbnb']

export function FiltrosModal({ open, onClose, value, onChange }: Props) {
  function toggleSet(key: 'casas' | 'plataformas', v: string) {
    const next = new Set(value[key])
    next.has(v) ? next.delete(v) : next.add(v)
    onChange({ ...value, [key]: next })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-slate-700 font-medium">Filtros</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          <div className="space-y-2">
            <Label className="text-xs text-slate-500">Rango de fechas</Label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={value.fechaDesde}
                onChange={e => onChange({ ...value, fechaDesde: e.target.value })}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-slate-700"
              />
              <input
                type="date"
                value={value.fechaHasta}
                onChange={e => onChange({ ...value, fechaHasta: e.target.value })}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-slate-700"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-slate-500">Casa</Label>
            <div className="grid grid-cols-2 gap-2">
              {CASAS.map(c => (
                <label key={c} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value.casas.has(c)}
                    onChange={() => toggleSet('casas', c)}
                    className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
                  />
                  {CASA_LABELS[c]}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-slate-500">Plataforma</Label>
            <div className="grid grid-cols-2 gap-2">
              {PLATAFORMAS.map(p => (
                <label key={p} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value.plataformas.has(p)}
                    onChange={() => toggleSet('plataformas', p)}
                    className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
                  />
                  {PLATAFORMA_LABEL[p]}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-between gap-2 mt-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(filtrosAvanzadosVacios())}
            className="text-slate-500 cursor-pointer"
          >
            Limpiar filtros
          </Button>
          <Button size="sm" onClick={onClose} className="cursor-pointer">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
