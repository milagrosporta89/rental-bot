'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MesPicker } from '@/components/ui/mes-picker'
import { EncabezadoOrdenable } from '@/components/ui/encabezado-ordenable'
import { toISO, mesLabel } from '@/lib/dates'
import { formatUSD } from '@/lib/utils'
import type { Ingreso, Reserva } from '@/lib/types'

type SortBy = 'fecha' | 'reserva' | 'quien_pago' | 'destinatario' | 'monto_ars' | 'monto_usd' | 'desglose' | 'metodo_pago'
type SortDir = 'asc' | 'desc'

interface Grupo {
  padre: Ingreso
  hijos: Ingreso[]
  montoUsd: number
  montoArs: number | null
  reserva: Reserva | null
}

// Mismo criterio que GastosTable.tsx / TablaComisionesCobradas.tsx
function metodoPago(ingreso: Ingreso): string {
  if (ingreso.quien_pago === 'Liquidación de comisión') return 'Liquidación de comisión'
  return ingreso.nro_operacion ? 'Transferencia' : 'Efectivo'
}

// El ingreso "padre" es el pago real; comisión y excedente son hijos del mismo pago (ver
// partirIngresoPorExcedente) — se agrupan acá para no mostrarlos como si fueran dos cobros
// distintos del huésped.
function agrupar(ingresos: Ingreso[], reservasPorId: Map<string, Reserva>): Grupo[] {
  const hijosPorPadre = new Map<string, Ingreso[]>()
  for (const i of ingresos) {
    if (!i.id_ingreso_origen) continue
    const lista = hijosPorPadre.get(i.id_ingreso_origen) ?? []
    lista.push(i)
    hijosPorPadre.set(i.id_ingreso_origen, lista)
  }
  return ingresos
    .filter(i => !i.id_ingreso_origen)
    .map(padre => {
      const hijos = hijosPorPadre.get(padre.id) ?? []
      const montoUsd = (padre.monto_usd ?? 0) + hijos.reduce((s, h) => s + (h.monto_usd ?? 0), 0)
      const montoArs = padre.monto_ars != null
        ? padre.monto_ars + hijos.reduce((s, h) => s + (h.monto_ars ?? 0), 0)
        : null
      return { padre, hijos, montoUsd, montoArs, reserva: padre.id_reserva ? reservasPorId.get(padre.id_reserva) ?? null : null }
    })
}

function desglose(hijos: Ingreso[]): string | null {
  if (hijos.length === 0) return null
  return hijos
    .map(h => `${h.resolucion_cancelacion === 'caja_chica' ? 'caja chica' : 'ajuste'}: ${formatUSD(h.monto_usd)}`)
    .join(' · ')
}

function reservaLabel(g: Grupo): string {
  return g.reserva ? `#${g.reserva.id} — ${g.reserva.nombre_pax}` : (g.padre.id_reserva ? `#${g.padre.id_reserva}` : '')
}

function comparar(a: Grupo, b: Grupo, sortBy: SortBy): number {
  switch (sortBy) {
    case 'reserva': return reservaLabel(a).localeCompare(reservaLabel(b), 'es')
    case 'quien_pago': return a.padre.quien_pago.localeCompare(b.padre.quien_pago, 'es')
    case 'destinatario': return (a.padre.nombre_destinatario ?? '').localeCompare(b.padre.nombre_destinatario ?? '', 'es')
    case 'monto_ars': return (a.montoArs ?? 0) - (b.montoArs ?? 0)
    case 'monto_usd': return a.montoUsd - b.montoUsd
    case 'desglose': return (desglose(a.hijos) ?? '').localeCompare(desglose(b.hijos) ?? '', 'es')
    case 'metodo_pago': return metodoPago(a.padre).localeCompare(metodoPago(b.padre), 'es')
    default: return toISO(a.padre.fecha).localeCompare(toISO(b.padre.fecha))
  }
}

function matchBusqueda(g: Grupo, q: string): boolean {
  if (!q) return true
  const ql = q.toLowerCase()
  return (
    (g.reserva?.nombre_pax ?? '').toLowerCase().includes(ql) ||
    (g.reserva?.casa ?? '').toLowerCase().includes(ql) ||
    (g.padre.id_reserva ?? '').toLowerCase().includes(ql) ||
    (g.padre.quien_pago ?? '').toLowerCase().includes(ql) ||
    (g.padre.nombre_destinatario ?? '').toLowerCase().includes(ql) ||
    g.padre.fecha.includes(q)
  )
}

export function IngresosTable() {
  const [ingresos, setIngresos] = useState<Ingreso[]>([])
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState('')
  const [mes, setMes] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    fetch('/api/ingresos-data')
      .then(r => r.json())
      .then(({ ingresos, reservas }: { ingresos: Ingreso[]; reservas: Reserva[] }) => {
        setIngresos(ingresos)
        setReservas(reservas)
      })
      .finally(() => setCargando(false))
  }, [])

  const reservasPorId = useMemo(() => new Map(reservas.map(r => [r.id, r])), [reservas])
  const grupos = useMemo(() => agrupar(ingresos, reservasPorId), [ingresos, reservasPorId])

  const filtradosPorBusqueda = grupos.filter(g => matchBusqueda(g, q))

  const mesesDisponibles = Array.from(new Set(filtradosPorBusqueda.map(g => toISO(g.padre.fecha).slice(0, 7)))).sort().reverse()

  const mesEfectivo = mesesDisponibles.includes(mes) ? mes : (mesesDisponibles[0] ?? '')
  const idxMes = mesesDisponibles.indexOf(mesEfectivo)
  const anios = mesesDisponibles.map(k => Number(k.slice(0, 4)))
  const minYear = anios.length > 0 ? Math.min(...anios) : new Date().getFullYear()
  const maxYear = anios.length > 0 ? Math.max(...anios) : new Date().getFullYear()

  const itemsMes = filtradosPorBusqueda
    .filter(g => toISO(g.padre.fecha).slice(0, 7) === mesEfectivo)
    .sort((a, b) => {
      const cmp = comparar(a, b, sortBy)
      return sortDir === 'asc' ? cmp : -cmp
    })

  function toggleSort(by: SortBy) {
    if (sortBy === by) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(by)
      setSortDir('desc')
    }
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-400 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
      </div>
    )
  }

  const totalMesUsd = itemsMes.reduce((s, g) => s + g.montoUsd, 0)
  const hayArs = itemsMes.some(g => g.montoArs != null)
  const totalMesArs = itemsMes.reduce((s, g) => s + (g.montoArs ?? 0), 0)
  const resumenTotales = [
    hayArs ? `$ ${totalMesArs.toLocaleString('es-AR')}` : null,
    formatUSD(totalMesUsd),
  ].filter(Boolean).join(' · ')

  return (
    <div className="h-full overflow-y-auto px-8 py-4 pb-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-slate-800">Ingresos</h1>
        </div>

        <div className="pb-4 flex items-end justify-between gap-2 sm:gap-3 flex-wrap">
          <div className="space-y-1 flex-1 sm:flex-initial">
            <Label className="text-xs text-slate-500">Buscar por reserva, casa o quién pagó</Label>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <Input value={q} onChange={e => setQ(e.target.value)} className="pl-8 text-sm h-8" />
            </div>
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
            {q ? 'Sin resultados' : 'No hay ingresos registrados todavía'}
          </div>
        ) : (
          <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-100">
                  <tr className="border-b border-slate-200">
                    <EncabezadoOrdenable label="Fecha" by="fecha" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <EncabezadoOrdenable label="Reserva" by="reserva" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <EncabezadoOrdenable label="Quién pagó" by="quien_pago" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <EncabezadoOrdenable label="Destinatario" by="destinatario" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <EncabezadoOrdenable label="Monto en $" by="monto_ars" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} align="right" />
                    <EncabezadoOrdenable label="Monto USD" by="monto_usd" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} align="right" />
                    <EncabezadoOrdenable label="Desglose" by="desglose" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <EncabezadoOrdenable label="Método de pago" by="metodo_pago" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {itemsMes.map(g => (
                    <tr key={g.padre.id} className="border-b border-slate-100">
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap tabular-nums text-xs">{g.padre.fecha}</td>
                      <td className="px-4 py-2.5 text-slate-700 text-xs whitespace-nowrap">
                        {reservaLabel(g) || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{g.padre.quien_pago}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{g.padre.nombre_destinatario || '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-800 font-medium text-xs whitespace-nowrap">
                        {g.montoArs != null ? `$ ${g.montoArs.toLocaleString('es-AR')}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 text-xs whitespace-nowrap">{formatUSD(g.montoUsd)}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs max-w-xs truncate">{desglose(g.hijos) ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{metodoPago(g.padre)}</td>
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
    </div>
  )
}
