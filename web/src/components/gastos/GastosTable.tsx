'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Gasto, CategoriaGasto, CATEGORIA_GASTO_LABEL } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Search, Plus, SlidersHorizontal, ArrowUp, ArrowDown, ChevronsUpDown, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { toISO } from '@/lib/dates'
import { eliminarGasto } from '@/app/actions/gastos'
import { FiltrosModal, filtrosAvanzadosVacios, contarFiltrosActivos, type FiltrosAvanzadosGastos } from './FiltrosModal'

const supabase = createClient()
const PAGE_SIZE_OPTIONS = [10, 18, 25, 50]

type SortBy = 'fecha' | 'monto'
type SortDir = 'asc' | 'desc'

function categoriaLabel(c: string): string {
  return CATEGORIA_GASTO_LABEL[c as CategoriaGasto] ?? c
}

// Mismo criterio que PagosSection.tsx (ingresos): si tiene nro_operacion fue transferencia, si no, efectivo
function metodoPago(g: Gasto): string {
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

export function GastosTable() {
  const router = useRouter()
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(18)
  const [filtrosModalOpen, setFiltrosModalOpen] = useState(false)
  const [filtrosAvanzados, setFiltrosAvanzados] = useState<FiltrosAvanzadosGastos>(filtrosAvanzadosVacios())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState(false)

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

  useEffect(() => { setPage(0) }, [q, sortBy, sortDir, pageSize, filtrosAvanzados])

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
    .slice()
    .sort((a, b) => {
      const cmp = sortBy === 'monto'
        ? a.monto - b.monto
        : toISO(a.fecha).localeCompare(toISO(b.fecha))
      return sortDir === 'asc' ? cmp : -cmp
    })

  const totalPages = Math.max(1, Math.ceil(lista.length / pageSize))
  const pagina = lista.slice(page * pageSize, (page + 1) * pageSize)

  function toggleSort(by: SortBy) {
    if (sortBy === by) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(by)
      setSortDir(by === 'monto' ? 'desc' : 'desc')
    }
  }

  async function handleEliminar(id: string) {
    setEliminando(true)
    try {
      await eliminarGasto(id)
    } finally {
      setEliminando(false)
      setConfirmDeleteId(null)
    }
  }

  const gastoAEliminar = gastos.find(g => g.id === confirmDeleteId)
  const COLS = 7

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
        <div className="pb-4 flex items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Buscar por categoría, pagador o detalle</Label>
            <div className="relative w-72">
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
            className="relative flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filtros
            {contarFiltrosActivos(filtrosAvanzados) > 0 && (
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] font-semibold">
                {contarFiltrosActivos(filtrosAvanzados)}
              </span>
            )}
          </button>
        </div>

        <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">

          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-slate-100 z-10">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                    <button
                      onClick={() => toggleSort('fecha')}
                      aria-label={`Ordenar por fecha, ${sortBy === 'fecha' && sortDir === 'asc' ? 'descendente' : 'ascendente'}`}
                      className="flex items-center gap-1 -mx-1 px-1 rounded hover:text-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    >
                      Fecha
                      {sortBy === 'fecha'
                        ? (sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-slate-800" strokeWidth={2.5} /> : <ArrowDown className="w-3.5 h-3.5 text-slate-800" strokeWidth={2.5} />)
                        : <ChevronsUpDown className="w-3 h-3 text-slate-400" />}
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Categoría</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                    <button
                      onClick={() => toggleSort('monto')}
                      aria-label={`Ordenar por monto, ${sortBy === 'monto' && sortDir === 'asc' ? 'descendente' : 'ascendente'}`}
                      className="flex items-center gap-1 -mx-1 px-1 rounded hover:text-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    >
                      Monto
                      {sortBy === 'monto'
                        ? (sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-slate-800" strokeWidth={2.5} /> : <ArrowDown className="w-3.5 h-3.5 text-slate-800" strokeWidth={2.5} />)
                        : <ChevronsUpDown className="w-3 h-3 text-slate-400" />}
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Pagado por</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Detalle</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Método de pago</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {pagina.length === 0 ? (
                  <tr>
                    <td colSpan={COLS} className="py-16 text-center text-sm text-slate-400">
                      {q ? 'Sin resultados' : 'No hay gastos registrados todavía'}
                    </td>
                  </tr>
                ) : pagina.map(g => (
                  <tr key={g.id} className="border-b border-slate-100 transition-colors duration-150">
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap tabular-nums text-xs">{g.fecha}</td>
                    <td className="px-4 py-2.5 text-slate-700">{categoriaLabel(g.categoria)}</td>
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

          {/* Paginador */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-200 bg-slate-100 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                {lista.length === 0 ? '0 de 0' : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, lista.length)} de ${lista.length}`}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">Mostrar</span>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  aria-label="Cantidad de registros por página"
                  className="h-7 w-16 text-xs bg-white border border-slate-200 rounded-md"
                >
                  {PAGE_SIZE_OPTIONS.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                aria-label="Página anterior"
                className="flex items-center justify-center w-8 h-8 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-600 font-medium px-1 whitespace-nowrap tabular-nums" aria-live="polite">
                Página {page + 1} de {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                aria-label="Página siguiente"
                className="flex items-center justify-center w-8 h-8 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>
      </div>

      <FiltrosModal
        open={filtrosModalOpen}
        onClose={() => setFiltrosModalOpen(false)}
        value={filtrosAvanzados}
        onChange={setFiltrosAvanzados}
      />

      <Dialog open={confirmDeleteId !== null} onOpenChange={open => !open && setConfirmDeleteId(null)}>
        <DialogContent className="max-w-sm">
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
