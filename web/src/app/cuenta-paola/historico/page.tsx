'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronRight, Loader2, Search, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { historicoReservasLiquidadas, type FilaReconciliacion } from '@/lib/cuentaPaola'
import { toISO } from '@/lib/dates'
import type { Moneda } from '@/lib/utils'
import type { Gasto, Ingreso, MovimientoInterno, Reserva } from '@/lib/types'
import { TablaHistoricoComisiones } from '@/components/cuenta-paola/TablaHistoricoComisiones'
import { MonedaToggle } from '@/components/cuenta-paola/MonedaToggle'
import { FiltrosModal, filtrosAvanzadosVacios, contarFiltrosActivos, type FiltrosAvanzados } from '@/components/reservas/FiltrosModal'

interface DatosCuentaPaola {
  ingresos: Ingreso[]
  gastosPaola: Gasto[]
  movimientosInternos: MovimientoInterno[]
  reservas: Reserva[]
}

async function fetchDatos(): Promise<DatosCuentaPaola> {
  const r = await fetch('/api/cuenta-paola-data')
  const json = await r.json()
  if (!r.ok) throw new Error(json.error ?? 'Error al cargar los datos.')
  return json
}

function casaNum(casa: string): string {
  return casa.replace(/\D/g, '')
}

function matchBusqueda(fila: FilaReconciliacion, q: string): boolean {
  if (!q) return true
  const ql = q.toLowerCase()
  const num = casaNum(fila.reserva.casa)
  return (
    fila.reserva.nombre_pax.toLowerCase().includes(ql) ||
    `casa ${num}`.includes(ql) ||
    num === q ||
    fila.reserva.id === q
  )
}

export default function HistoricoComisionesPage() {
  const [datos, setDatos] = useState<DatosCuentaPaola | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [filtrosModalOpen, setFiltrosModalOpen] = useState(false)
  const [filtrosAvanzados, setFiltrosAvanzados] = useState<FiltrosAvanzados>(filtrosAvanzadosVacios())
  const [moneda, setMoneda] = useState<Moneda>('USD')

  useEffect(() => {
    fetchDatos().then(setDatos).catch(e => setError(e.message)).finally(() => setCargando(false))
  }, [])

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-400 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
      </div>
    )
  }

  if (error || !datos) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3 max-w-md">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">No se pudo cargar el histórico</p>
            <p className="text-sm text-amber-700 mt-1">{error || 'Error desconocido.'}</p>
          </div>
        </div>
      </div>
    )
  }

  const ingresosPaola = datos.ingresos.filter(i => i.nombre_destinatario === 'Paola')
  const filasHistorico = historicoReservasLiquidadas(datos.reservas, ingresosPaola)

  const filasFiltradas = filasHistorico.filter(fila => {
    if (!matchBusqueda(fila, q)) return false
    const { fechaDesde, fechaHasta, casas, plataformas } = filtrosAvanzados
    if (casas.size > 0 && !casas.has(casaNum(fila.reserva.casa))) return false
    if (plataformas.size > 0 && !plataformas.has(fila.reserva.plataforma)) return false
    if (fechaDesde && toISO(fila.reserva.fecha_salida) < fechaDesde) return false
    if (fechaHasta && toISO(fila.reserva.fecha_salida) > fechaHasta) return false
    return true
  })

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <nav className="flex items-center gap-1.5 text-xs text-slate-500">
          <Link href="/cuenta-paola" className="hover:text-slate-700 transition-colors">Comisiones y Caja chica</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 font-medium">Histórico de reservas cobradas</span>
        </nav>

        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-800">Histórico de reservas cobradas</h1>
          <MonedaToggle value={moneda} onChange={setMoneda} />
        </div>
        <p className="text-[11px] text-slate-400">
          Reservas ya liquidadas en cierres anteriores, todas sin conflictos — el % de comisión que Paola cobró en cada una.
        </p>

        <div className="flex items-end gap-2 sm:gap-5 pt-2">
          <div className="space-y-1 flex-1 sm:flex-initial">
            <Label className="text-xs text-slate-500">Buscar por nombre, casa o nº de reserva</Label>
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

        <div className="pt-2">
          <TablaHistoricoComisiones filas={filasFiltradas} moneda={moneda} />
        </div>
      </div>

      <FiltrosModal
        open={filtrosModalOpen}
        onClose={() => setFiltrosModalOpen(false)}
        value={filtrosAvanzados}
        onChange={setFiltrosAvanzados}
      />
    </div>
  )
}
