'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Reserva, CASA_COLORES, PLATAFORMA_LABEL, ESTADO_VISUAL_BADGE, ESTADO_VISUAL_LABEL } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, SlidersHorizontal, ArrowUp, ArrowDown, ChevronsUpDown, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { toISO, estadoVisual, esTerminada, esEnCurso } from '@/lib/dates'
import { formatUSD as usd } from '@/lib/utils'
import { FiltrosModal, filtrosAvanzadosVacios, contarFiltrosActivos, type FiltrosAvanzados } from './FiltrosModal'

const supabase = createClient()
const PAGE_SIZE_OPTIONS = [10, 18, 25, 50]
const FILTROS_STORAGE_KEY = 'reservas-filtros-estado'

type Filtro = 'proximas' | 'en_curso' | 'terminadas' | 'canceladas'
type SortBy = 'fecha' | 'casa' | 'plataforma'
type SortDir = 'asc' | 'desc'

interface FiltrosPersistidos {
  q: string
  filtros: Filtro[]
  sortBy: SortBy
  sortDir: SortDir
  page: number
  pageSize: number
  filtrosAvanzados: { fechaDesde: string; fechaHasta: string; casas: string[]; plataformas: string[] }
}

function casaNum(casa: string): string {
  return casa.replace(/\D/g, '')
}

function normalizar(r: Record<string, unknown>): Reserva {
  const base = r as unknown as Reserva
  return { ...base, estado_reserva: base.estado_reserva ?? 'confirmada' }
}

function matchFiltro(r: Reserva, q: string): boolean {
  if (!q) return true
  const ql = q.toLowerCase()
  const num = casaNum(r.casa)
  return (
    r.nombre_pax.toLowerCase().includes(ql) ||
    r.titular.toLowerCase().includes(ql) ||
    `casa ${num}`.includes(ql) ||
    num === q ||
    r.id === q ||
    (r.estado_reserva ?? 'confirmada').toLowerCase().startsWith(ql) ||
    r.fecha_entrada.includes(q) ||
    (r.telefono ?? '').replace(/\D/g, '').includes(q)
  )
}

function WAIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  )
}

export function ReservasTable() {
  const router = useRouter()
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [q, setQ] = useState('')
  const [filtros, setFiltros] = useState<Set<Filtro>>(new Set(['proximas', 'en_curso']))
  const [sortBy, setSortBy] = useState<SortBy>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(18)
  const [filtrosModalOpen, setFiltrosModalOpen] = useState(false)
  const [filtrosAvanzados, setFiltrosAvanzados] = useState<FiltrosAvanzados>(filtrosAvanzadosVacios())
  const chipsRef = useRef<HTMLDivElement>(null)
  const [chipsScroll, setChipsScroll] = useState({ left: false, right: false })

  const actualizarChipsScroll = useCallback(() => {
    const el = chipsRef.current
    if (!el) return
    setChipsScroll({
      left: el.scrollLeft > 2,
      right: el.scrollLeft < el.scrollWidth - el.clientWidth - 2,
    })
  }, [])

  useEffect(() => {
    actualizarChipsScroll()
    const el = chipsRef.current
    if (!el) return
    el.addEventListener('scroll', actualizarChipsScroll, { passive: true })
    const ro = new ResizeObserver(actualizarChipsScroll)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', actualizarChipsScroll); ro.disconnect() }
  }, [actualizarChipsScroll])

  function scrollChips(dir: 'left' | 'right') {
    chipsRef.current?.scrollBy({ left: dir === 'left' ? -120 : 120, behavior: 'smooth' })
  }

  const cargar = useCallback(async () => {
    const res = await fetch('/api/calendar-data')
    if (!res.ok) return
    const { reservas: data } = await res.json() as { reservas: Record<string, unknown>[] }
    setReservas(data.map(normalizar))
  }, [])

  useEffect(() => {
    cargar()
    const ch = supabase
      .channel('reservas-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas' }, cargar)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [cargar])

  // Restaura la selección de filtros/orden/página al volver de ver el detalle de una reserva
  // (sessionStorage, no la URL: alcanza con que sobreviva la navegación de ida y vuelta).
  useEffect(() => {
    const raw = sessionStorage.getItem(FILTROS_STORAGE_KEY)
    if (!raw) return
    try {
      const saved: FiltrosPersistidos = JSON.parse(raw)
      setQ(saved.q)
      setFiltros(new Set(saved.filtros))
      setSortBy(saved.sortBy)
      setSortDir(saved.sortDir)
      setPageSize(saved.pageSize)
      setFiltrosAvanzados({
        fechaDesde: saved.filtrosAvanzados.fechaDesde,
        fechaHasta: saved.filtrosAvanzados.fechaHasta,
        casas: new Set(saved.filtrosAvanzados.casas),
        plataformas: new Set(saved.filtrosAvanzados.plataformas),
      })
      setPage(saved.page)
    } catch {
      sessionStorage.removeItem(FILTROS_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    const data: FiltrosPersistidos = {
      q,
      filtros: Array.from(filtros),
      sortBy,
      sortDir,
      page,
      pageSize,
      filtrosAvanzados: {
        fechaDesde: filtrosAvanzados.fechaDesde,
        fechaHasta: filtrosAvanzados.fechaHasta,
        casas: Array.from(filtrosAvanzados.casas),
        plataformas: Array.from(filtrosAvanzados.plataformas),
      },
    }
    sessionStorage.setItem(FILTROS_STORAGE_KEY, JSON.stringify(data))
  }, [q, filtros, sortBy, sortDir, page, pageSize, filtrosAvanzados])

  // El reseteo de página solo debe dispararse por un cambio de filtro hecho por el usuario, no
  // por la restauración inicial del efecto de arriba (que ya trae su propia página guardada).
  const saltearResetDePaginaRef = useRef(true)
  useEffect(() => {
    if (saltearResetDePaginaRef.current) {
      saltearResetDePaginaRef.current = false
      return
    }
    setPage(0)
  }, [q, filtros, filtrosAvanzados, sortBy, sortDir, pageSize])

  const porBusqueda = reservas.filter(r => matchFiltro(r, q))

  const lista = porBusqueda
    .filter(r => {
      if (filtros.size === 0) return true
      if (r.estado_reserva === 'cancelada') return filtros.has('canceladas')
      if (esTerminada(r.fecha_salida)) return filtros.has('terminadas')
      if (esEnCurso(r.fecha_entrada, r.fecha_salida)) return filtros.has('en_curso')
      return filtros.has('proximas')
    })
    .filter(r => {
      const { fechaDesde, fechaHasta, casas, plataformas } = filtrosAvanzados
      if (casas.size > 0 && !casas.has(casaNum(r.casa))) return false
      if (plataformas.size > 0 && !plataformas.has(r.plataforma)) return false
      if (fechaDesde && toISO(r.fecha_salida) < fechaDesde) return false
      if (fechaHasta && toISO(r.fecha_entrada) > fechaHasta) return false
      return true
    })
    .slice()
    .sort((a, b) => {
      const cmp = sortBy === 'casa'
        ? Number(casaNum(a.casa)) - Number(casaNum(b.casa))
        : sortBy === 'plataforma'
          ? (PLATAFORMA_LABEL[a.plataforma] ?? a.plataforma).localeCompare(PLATAFORMA_LABEL[b.plataforma] ?? b.plataforma)
          : toISO(a.fecha_entrada).localeCompare(toISO(b.fecha_entrada))
      return sortDir === 'asc' ? cmp : -cmp
    })

  const totalPages = Math.max(1, Math.ceil(lista.length / pageSize))
  const pagina = lista.slice(page * pageSize, (page + 1) * pageSize)

  function toggleFiltro(f: Filtro) {
    setFiltros(prev => {
      const next = new Set(prev)
      next.has(f) ? next.delete(f) : next.add(f)
      return next
    })
  }

  function toggleSort(by: SortBy) {
    if (sortBy === by) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(by)
      setSortDir('asc')
    }
  }

  const COLS = 10

  return (
    <>
    <div className="h-full overflow-y-auto px-8 py-4 pb-8">
    <div className="max-w-6xl mx-auto">

      <h1 className="text-lg font-semibold text-slate-800 mb-4">Resumen de reservas</h1>

      {/* Toolbar */}
      <div className="pb-5 space-y-3.5">
        <div className="flex items-end gap-2 sm:gap-5">
          <div className="space-y-1 flex-1 sm:flex-initial">
            <Label className="text-xs text-slate-500">Buscar por nombre, casa, nº de reserva o estado</Label>
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

        {/* Chips de filtro */}
        <div className="space-y-1.5">
          <span className="block text-xs text-slate-500">Filtros rápidos:</span>
          <div className="relative">
            {chipsScroll.left && (
              <button
                onClick={() => scrollChips('left')}
                aria-label="Ver filtros anteriores"
                className="absolute left-0 top-0 bottom-0 z-10 flex items-center pr-4 pl-0.5 bg-gradient-to-r from-white via-white to-transparent cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
            )}
            <div ref={chipsRef} className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {([
                { id: 'en_curso',   label: 'En curso' },
                { id: 'proximas',   label: 'Próximas' },
                { id: 'terminadas', label: 'Terminadas' },
                { id: 'canceladas', label: 'Canceladas' },
              ] as { id: Filtro; label: string }[]).map(({ id, label }) => {
                const active = filtros.has(id)
                return (
                  <button
                    key={id}
                    onClick={() => toggleFiltro(id)}
                    aria-pressed={active}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      active
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }`}
                  >
                    {label}
                    {active && <Check className="w-3 h-3" />}
                  </button>
                )
              })}
            </div>
            {chipsScroll.right && (
              <button
                onClick={() => scrollChips('right')}
                aria-label="Ver más filtros"
                className="absolute right-0 top-0 bottom-0 z-10 flex items-center pl-4 pr-0.5 bg-gradient-to-l from-white via-white to-transparent cursor-pointer"
              >
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-slate-100 z-10">
            <tr className="border-b border-slate-200">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Nº</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Titular</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                <button
                  onClick={() => toggleSort('casa')}
                  aria-label={`Ordenar por casa, ${sortBy === 'casa' && sortDir === 'asc' ? 'descendente' : 'ascendente'}`}
                  className="flex items-center gap-1 -mx-1 px-1 rounded hover:text-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  Casa
                  {sortBy === 'casa'
                    ? (sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-slate-800" strokeWidth={2.5} /> : <ArrowDown className="w-3.5 h-3.5 text-slate-800" strokeWidth={2.5} />)
                    : <ChevronsUpDown className="w-3 h-3 text-slate-400" />}
                </button>
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                <button
                  onClick={() => toggleSort('fecha')}
                  aria-label={`Ordenar por fecha, ${sortBy === 'fecha' && sortDir === 'asc' ? 'descendente' : 'ascendente'}`}
                  className="flex items-center gap-1 -mx-1 px-1 rounded hover:text-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  Fechas
                  {sortBy === 'fecha'
                    ? (sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-slate-800" strokeWidth={2.5} /> : <ArrowDown className="w-3.5 h-3.5 text-slate-800" strokeWidth={2.5} />)
                    : <ChevronsUpDown className="w-3 h-3 text-slate-400" />}
                </button>
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Noches</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Total</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Saldo</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                <button
                  onClick={() => toggleSort('plataforma')}
                  aria-label={`Ordenar por plataforma, ${sortBy === 'plataforma' && sortDir === 'asc' ? 'descendente' : 'ascendente'}`}
                  className="flex items-center gap-1 -mx-1 px-1 rounded hover:text-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  Plataforma
                  {sortBy === 'plataforma'
                    ? (sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-slate-800" strokeWidth={2.5} /> : <ArrowDown className="w-3.5 h-3.5 text-slate-800" strokeWidth={2.5} />)
                    : <ChevronsUpDown className="w-3 h-3 text-slate-400" />}
                </button>
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Estado</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">WA</th>
            </tr>
          </thead>
          <tbody>
            {pagina.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="py-16 text-center text-sm text-slate-400">
                  {q ? 'Sin resultados' : 'No hay reservas para los filtros seleccionados'}
                </td>
              </tr>
            ) : pagina.map(r => {
              const num = casaNum(r.casa)
              const color = CASA_COLORES[num] ?? '#94a3b8'
              const estado = estadoVisual(r.estado_reserva, r.fecha_entrada, r.fecha_salida)
              const waNum = r.telefono?.replace(/\D/g, '')
              const saldoPendiente = (r.saldo_usd ?? 0) > 0

              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/reservas/${r.id}`)}
                  className="border-b border-slate-100 hover:bg-slate-100 cursor-pointer transition-colors duration-150"
                >
                  <td className="px-4 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">#{r.id}</td>

                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.nombre_pax}</td>

                  <td className="px-4 py-2.5 min-w-[72px]">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
                      style={{ backgroundColor: `${color}20`, color }}
                    >
                      Casa {num}
                    </span>
                  </td>

                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap tabular-nums text-xs">
                    {r.fecha_entrada} → {r.fecha_salida}
                  </td>

                  <td className="px-4 py-2.5 text-center text-slate-600 tabular-nums">
                    {r.cantidad_noches}
                  </td>

                  <td className="px-4 py-2.5 text-left tabular-nums text-slate-700 text-xs whitespace-nowrap">
                    {usd(r.monto_total_usd)}
                  </td>

                  <td className="px-4 py-2.5 text-left tabular-nums text-xs whitespace-nowrap">
                    <span className={saldoPendiente ? 'text-red-500 font-medium' : 'text-slate-400'}>
                      {usd(r.saldo_usd)}
                    </span>
                  </td>

                  <td className="px-4 py-2.5 text-slate-600 text-xs">
                    {PLATAFORMA_LABEL[r.plataforma] ?? r.plataforma}
                  </td>

                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ESTADO_VISUAL_BADGE[estado] ?? ESTADO_VISUAL_BADGE.confirmada}`}>
                      {ESTADO_VISUAL_LABEL[estado] ?? estado}
                    </span>
                  </td>

                  <td className="px-4 py-2.5">
                    {waNum ? (
                      <a
                        href={`https://wa.me/${waNum}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        aria-label={`WhatsApp a ${r.nombre_pax}`}
                        className="inline-flex items-center justify-center w-7 h-7 rounded text-emerald-600 hover:bg-emerald-50 transition-colors duration-150 cursor-pointer"
                      >
                        <WAIcon />
                      </a>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Paginador */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-200 bg-slate-100 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Mostrar</span>
          <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
            <SelectTrigger aria-label="Cantidad de registros por página" className="h-7 w-16 text-xs bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map(n => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            {page + 1} de {totalPages}
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
    </div>

    <FiltrosModal
      open={filtrosModalOpen}
      onClose={() => setFiltrosModalOpen(false)}
      value={filtrosAvanzados}
      onChange={setFiltrosAvanzados}
    />
    </>
  )
}
