'use client'

import { useRef } from 'react'
import { Calendar } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CATEGORIA_GASTO_LABEL, CategoriaGasto, TITULARES_PAGADOR } from '@/lib/types'

export interface FiltrosAvanzadosGastos {
  fechaDesde: string
  fechaHasta: string
  categorias: Set<string>
  pagadoPor: Set<string>
}

export function filtrosAvanzadosVacios(): FiltrosAvanzadosGastos {
  return { fechaDesde: '', fechaHasta: '', categorias: new Set(), pagadoPor: new Set() }
}

export function contarFiltrosActivos(f: FiltrosAvanzadosGastos): number {
  return f.categorias.size + f.pagadoPor.size + (f.fechaDesde || f.fechaHasta ? 1 : 0)
}

const CATEGORIAS = (Object.keys(CATEGORIA_GASTO_LABEL) as CategoriaGasto[])
  .sort((a, b) => CATEGORIA_GASTO_LABEL[a].localeCompare(CATEGORIA_GASTO_LABEL[b], 'es'))

interface Props {
  open: boolean
  onClose: () => void
  value: FiltrosAvanzadosGastos
  onChange: (v: FiltrosAvanzadosGastos) => void
}

export function FiltrosModal({ open, onClose, value, onChange }: Props) {
  const desdeRef = useRef<HTMLInputElement>(null)
  const hastaRef = useRef<HTMLInputElement>(null)

  function toggleSet(key: 'categorias' | 'pagadoPor', v: string) {
    const next = new Set(value[key])
    next.has(v) ? next.delete(v) : next.add(v)
    onChange({ ...value, [key]: next })
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
            <Label className="text-xs text-slate-500">Categoría</Label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIAS.map(c => (
                <label key={c} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value.categorias.has(c)}
                    onChange={() => toggleSet('categorias', c)}
                    className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
                  />
                  {CATEGORIA_GASTO_LABEL[c]}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-slate-500">Pagado por</Label>
            <div className="grid grid-cols-2 gap-2">
              {TITULARES_PAGADOR.map(t => (
                <label key={t} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value.pagadoPor.has(t)}
                    onChange={() => toggleSet('pagadoPor', t)}
                    className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
                  />
                  {t}
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
