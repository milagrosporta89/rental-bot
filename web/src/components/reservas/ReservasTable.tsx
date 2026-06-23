'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Reserva, CASA_COLORES } from '@/lib/types'
import { ReservaModal } from '@/components/modals/ReservaModal'
import { Input } from '@/components/ui/input'
import { Search, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { toISO } from '@/lib/dates'

const supabase = createClient()
const PAGE_SIZE = 20

type Tab = 'proximas' | 'terminadas'
type SortDir = 'asc' | 'desc'

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
    (r.estado_reserva ?? 'confirmada').toLowerCase().startsWith(ql) ||
    r.fecha_entrada.includes(q) ||
    (r.telefono ?? '').replace(/\D/g, '').includes(q)
  )
}

function usd(n: number | null | undefined): string {
  if (n == null) return '—'
  return `USD ${Math.round(n).toLocaleString('es-AR')}`
}

const ESTADO_BADGE: Record<string, string> = {
  confirmada: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  tentativa:  'bg-amber-50 text-amber-700 border border-amber-200',
  cancelada:  'bg-slate-100 text-slate-400 border border-slate-200',
}

const ESTADO_LABEL: Record<string, string> = {
  confirmada: 'Confirmada',
  tentativa:  'Tentativa',
  cancelada:  'Cancelada',
}

const PAGO_DOT: Record<string, string> = {
  debe:    'bg-red-400',
  parcial: 'bg-amber-400',
  pagado:  'bg-emerald-400',
}

const PAGO_LABEL: Record<string, string> = {
  debe: 'Sin pago', parcial: 'Seña', pagado: 'Pagado',
}

function WAIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  )
}

export function ReservasTable() {
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [modalReserva, setModalReserva] = useState<Reserva | null>(null)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>('proximas')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(0)

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

  // Resetear página cuando cambia filtro, tab o sort
  useEffect(() => { setPage(0) }, [q, tab, sortDir])

  const hoyISO = new Date().toISOString().slice(0, 10)
  const filtradas = reservas.filter(r => matchFiltro(r, q))
  const proximas   = filtradas.filter(r => toISO(r.fecha_salida) >= hoyISO)
  const terminadas = filtradas.filter(r => toISO(r.fecha_salida) <  hoyISO)

  const lista = (tab === 'proximas' ? proximas : terminadas)
    .slice()
    .sort((a, b) => {
      const cmp = toISO(a.fecha_entrada).localeCompare(toISO(b.fecha_entrada))
      return sortDir === 'asc' ? cmp : -cmp
    })

  const totalPages = Math.ceil(lista.length / PAGE_SIZE)
  const pagina = lista.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function switchTab(t: Tab) {
    setTab(t)
    setSortDir(t === 'proximas' ? 'asc' : 'desc')
  }

  function toggleSort() {
    setSortDir(d => d === 'asc' ? 'desc' : 'asc')
  }

  const COLS = 9

  return (
    <div className="flex flex-col h-full">

      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-4 flex-wrap">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nombre, casa, estado…"
            className="pl-8 text-sm h-8"
          />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          {(['proximas', 'terminadas'] as Tab[]).map(t => {
            const count = t === 'proximas' ? proximas.length : terminadas.length
            const active = tab === t
            return (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors duration-150 cursor-pointer ${
                  active
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'proximas' ? 'Próximas' : 'Terminadas'}
                <span className={`ml-1.5 text-xs ${active ? 'text-slate-400' : 'text-slate-400'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-slate-100">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 whitespace-nowrap">Titular</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 whitespace-nowrap">Casa</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 whitespace-nowrap">
                <button
                  onClick={toggleSort}
                  className="flex items-center gap-1 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  Fechas
                  {sortDir === 'asc'
                    ? <ArrowUp className="w-3 h-3" />
                    : <ArrowDown className="w-3 h-3" />}
                </button>
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-slate-400 whitespace-nowrap">Noches</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400 whitespace-nowrap">Total</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400 whitespace-nowrap">Saldo</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 whitespace-nowrap">Estado</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 whitespace-nowrap">Pago</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 whitespace-nowrap">WA</th>
            </tr>
          </thead>
          <tbody>
            {pagina.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="py-16 text-center text-sm text-slate-400">
                  {q ? 'Sin resultados' : tab === 'proximas' ? 'No hay reservas próximas' : 'No hay reservas terminadas'}
                </td>
              </tr>
            ) : pagina.map(r => {
              const num = casaNum(r.casa)
              const color = CASA_COLORES[num] ?? '#94a3b8'
              const estado = r.estado_reserva ?? 'confirmada'
              const waNum = r.telefono?.replace(/\D/g, '')
              const saldoPendiente = (r.saldo_usd ?? 0) > 0

              return (
                <tr
                  key={r.id}
                  onClick={() => setModalReserva(r)}
                  className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors duration-150"
                >
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.nombre_pax}</td>

                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
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

                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 text-xs">
                    {usd(r.monto_total_usd)}
                  </td>

                  <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                    <span className={saldoPendiente ? 'text-red-500 font-medium' : 'text-slate-400'}>
                      {usd(r.saldo_usd)}
                    </span>
                  </td>

                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ESTADO_BADGE[estado] ?? ESTADO_BADGE.confirmada}`}>
                      {ESTADO_LABEL[estado] ?? estado}
                    </span>
                  </td>

                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${PAGO_DOT[r.estado_pago] ?? 'bg-slate-300'}`} />
                      <span className="text-slate-600 text-xs">{PAGO_LABEL[r.estado_pago] ?? r.estado_pago}</span>
                    </div>
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-white shrink-0">
          <span className="text-xs text-slate-400">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, lista.length)} de {lista.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-7 h-7 rounded text-xs cursor-pointer transition-colors ${
                  i === page
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {modalReserva && (
        <ReservaModal
          mode="edit"
          reserva={modalReserva}
          reservas={reservas}
          onClose={() => setModalReserva(null)}
          onSaved={() => { setModalReserva(null); }}
        />
      )}
    </div>
  )
}
