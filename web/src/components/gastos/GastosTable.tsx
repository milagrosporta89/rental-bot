'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Gasto, CategoriaGasto, CATEGORIA_GASTO_LABEL } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { MesPicker } from '@/components/ui/mes-picker'
import { EncabezadoOrdenable } from '@/components/ui/encabezado-ordenable'
import { Search, Plus, SlidersHorizontal, Pencil, Trash2 } from 'lucide-react'
import { toISO, mesLabel } from '@/lib/dates'
import { eliminarGasto } from '@/app/actions/gastos'
import { FiltrosModal, filtrosAvanzadosVacios, contarFiltrosActivos, type FiltrosAvanzadosGastos } from './FiltrosModal'

const supabase = createClient()

type SortBy = 'fecha' | 'categoria' | 'monto' | 'pagado_por' | 'detalle' | 'metodo_pago'
type SortDir = 'asc' | 'desc'

function categoriaLabel(c: string): string {
  return CATEGORIA_GASTO_LABEL[c as CategoriaGasto] ?? c
}

// Mismo criterio que PagosSection.tsx (ingresos): si tiene nro_operacion fue transferencia, si no, efectivo.
// Excepto los gastos de comisión que crea la liquidación (espejo o red de seguridad) — no son ni
// una cosa ni la otra, son una distribución interna, así que se marcan aparte.
function metodoPago(g: Gasto): string {
  if (g.banco_origen === 'Liquidación de comisión') return 'Liquidación de comisión'
  return g.nro_operacion ? 'Transferencia' : 'Efectivo'
}

function matchBusqueda(g: Gasto, q: string): boolean {
  if (!q) return true
  const ql = q.toLowerCase()
  return (
    categoriaLabel(g.categoria).toLowerCase().includes(ql) ||
    g.pagado_por.toLowerCase().includes(ql) ||
    (g.detalle ?? '').toLowerCase().includes(ql) ||
    g.fecha.includes(q)
  )
}

function comparar(a: Gasto, b: Gasto, sortBy: SortBy): number {
  switch (sortBy) {
    case 'monto': return a.monto - b.monto
    case 'categoria': return categoriaLabel(a.categoria).localeCompare(categoriaLabel(b.categoria), 'es')
    case 'pagado_por': return a.pagado_por.localeCompare(b.pagado_por, 'es')
    case 'detalle': return (a.detalle ?? '').localeCompare(b.detalle ?? '', 'es')
    case 'metodo_pago': return metodoPago(a).localeCompare(metodoPago(b), 'es')
    default: return toISO(a.fecha).localeCompare(toISO(b.fecha))
  }
}

export function GastosTable() {
  const router = useRouter()
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filtrosModalOpen, setFiltrosModalOpen] = useState(false)
  const [filtrosAvanzados, setFiltrosAvanzados] = useState<FiltrosAvanzadosGastos>(filtrosAvanzadosVacios())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [mes, setMes] = useState('')

  const cargar = useCallback(async () => {
    const res = await fetch('/api/gastos-data')
    if (!res.ok) return
    const { gastos: data } = await res.json() as { gastos: Gasto[] }
    setGastos(data)
  }, [])

  useEffect(() => {
    cargar()
    const ch = supabase
      .channel('gastos-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos' }, cargar)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [cargar])

  const lista = gastos
    .filter(g => matchBusqueda(g, q))
    .filter(g => {
      const { fechaDesde, fechaHasta, categorias, pagadoPor } = filtrosAvanzados
      if (categorias.size > 0 && !categorias.has(g.categoria)) return false
      if (pagadoPor.size > 0 && !pagadoPor.has(g.pagado_por)) return false
      const fechaISO = toISO(g.fecha)
      if (fechaDesde && fechaISO < fechaDesde) return false
      if (fechaHasta && fechaISO > fechaHasta) return false
      return true
    })

  const mesesDisponibles = useMemo(() => {
    const set = new Set(lista.map(g => toISO(g.fecha).slice(0, 7)))
    return Array.from(set).sort().reverse()
  }, [lista])

  const mesEfectivo = mesesDisponibles.includes(mes) ? mes : (mesesDisponibles[0] ?? '')
  const idxMes = mesesDisponibles.indexOf(mesEfectivo)
  const anios = mesesDisponibles.map(k => Number(k.slice(0, 4)))
  const minYear = anios.length > 0 ? Math.min(...anios) : new Date().getFullYear()
  const maxYear = anios.length > 0 ? Math.max(...anios) : new Date().getFullYear()

  const itemsMes = useMemo(() => {
    return lista
      .filter(g => toISO(g.fecha).slice(0, 7) === mesEfectivo)
      .sort((a, b) => {
        const cmp = comparar(a, b, sortBy)
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [lista, mesEfectivo, sortBy, sortDir])

  function toggleSort(by: SortBy) {
    if (sortBy === by) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(by)
      setSortDir('desc')
    }
  }

  async function handleEliminar(id: string) {
    setEliminando(true)
    try {
      await eliminarGasto(id)
      setGastos(prev => prev.filter(g => g.id !== id))
    } finally {
      setEliminando(false)
      setConfirmDeleteId(null)
    }
  }

  const gastoAEliminar = gastos.find(g => g.id === confirmDeleteId)

  const hayArs = itemsMes.some(g => g.monto_ars != null)
  const hayUsd = itemsMes.some(g => g.monto_usd != null)
  const totalArs = itemsMes.reduce((s, g) => s + (g.monto_ars ?? 0), 0)
  const totalUsd = itemsMes.reduce((s, g) => s + (g.monto_usd ?? 0), 0)
  const resumenTotales = !hayArs && !hayUsd
    ? '—'
    : [
        hayArs ? `$ ${totalArs.toLocaleString('es-AR')}` : null,
        hayUsd ? `USD ${totalUsd.toLocaleString('es-AR')}` : null,
      ].filter(Boolean).join(' · ')

  return (
    <div className="h-full overflow-y-auto px-8 py-4 pb-8">
      <div className="max-w-5xl mx-auto">

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-slate-800">Gastos</h1>
          <Link
            href="/gastos/nuevo"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors duration-150 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo gasto
          </Link>
        </div>

        {/* Toolbar */}
        <div className="pb-4 flex items-end justify-between gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-end gap-2 sm:gap-3">
            <div className="space-y-1 flex-1 sm:flex-initial">
              <Label className="text-xs text-slate-500">Buscar por categoría, pagador o detalle</Label>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <Input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  className="pl-8 text-sm h-8"
                />
              </div>
            </div>

            <button
              onClick={() => setFiltrosModalOpen(true)}
              aria-label="Filtros"
              title="Filtros"
              className="relative flex items-center justify-center h-8 w-8 shrink-0 rounded-md border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {contarFiltrosActivos(filtrosAvanzados) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] font-semibold">
                  {contarFiltrosActivos(filtrosAvanzados)}
                </span>
              )}
            </button>
          </div>

          {mesesDisponibles.length > 0 && (
            <MesPicker
              label={mesLabel(mesEfectivo)}
              currentYear={Number(mesEfectivo.slice(0, 4))}
              minYear={minYear}
              maxYear={maxYear}
              canPrev={idxMes < mesesDisponibles.length - 1}
              canNext={idxMes > 0}
              onPrev={() => setMes(mesesDisponibles[idxMes + 1])}
              onNext={() => setMes(mesesDisponibles[idxMes - 1])}
              isMonthEnabled={(year, i) => mesesDisponibles.includes(`${year}-${String(i + 1).padStart(2, '0')}`)}
              isMonthActive={(year, i) => mesEfectivo === `${year}-${String(i + 1).padStart(2, '0')}`}
              onSelectMonth={(year, i) => setMes(`${year}-${String(i + 1).padStart(2, '0')}`)}
            />
          )}
        </div>

        {mesesDisponibles.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400 bg-white border border-slate-200 rounded-xl">
            {q || contarFiltrosActivos(filtrosAvanzados) > 0 ? 'Sin resultados' : 'No hay gastos registrados todavía'}
          </div>
        ) : (
          <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-100">
                  <tr className="border-b border-slate-200">
                    <EncabezadoOrdenable label="Fecha" by="fecha" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <EncabezadoOrdenable label="Categoría" by="categoria" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <EncabezadoOrdenable label="Monto" by="monto" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <EncabezadoOrdenable label="Pagado por" by="pagado_por" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <EncabezadoOrdenable label="Detalle" by="detalle" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <EncabezadoOrdenable label="Método de pago" by="metodo_pago" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {itemsMes.map(g => (
                    <tr key={g.id} className="border-b border-slate-100 transition-colors duration-150">
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap tabular-nums text-xs">{g.fecha}</td>
                      <td className="px-4 py-2.5 text-slate-700 text-xs">{categoriaLabel(g.categoria)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-800 font-medium text-xs whitespace-nowrap">
                        {g.moneda === 'USD' ? 'USD' : '$'} {g.monto.toLocaleString('es-AR')}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{g.pagado_por}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs max-w-xs truncate">{g.detalle || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{metodoPago(g)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => router.push(`/gastos/nuevo?edit=${g.id}`)}
                            aria-label="Editar gasto"
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(g.id)}
                            aria-label="Eliminar gasto"
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-3 px-4 py-2.5 border-t border-slate-200 bg-slate-50">
              <span className="text-xs font-medium text-slate-500">Total del mes</span>
              <span className="text-xs font-semibold text-slate-800 tabular-nums">{resumenTotales}</span>
            </div>
          </div>
        )}
      </div>

      <FiltrosModal
        open={filtrosModalOpen}
        onClose={() => setFiltrosModalOpen(false)}
        value={filtrosAvanzados}
        onChange={setFiltrosAvanzados}
      />

      <Dialog open={confirmDeleteId !== null} onOpenChange={open => !open && setConfirmDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar gasto</DialogTitle>
            <DialogDescription>
              {gastoAEliminar && (
                <>
                  {categoriaLabel(gastoAEliminar.categoria)} · {gastoAEliminar.moneda === 'USD' ? 'USD' : '$'} {gastoAEliminar.monto.toLocaleString('es-AR')}
                  {' · '}{gastoAEliminar.pagado_por}
                  <br />
                </>
              )}
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={eliminando}
              onClick={() => confirmDeleteId && handleEliminar(confirmDeleteId)}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
