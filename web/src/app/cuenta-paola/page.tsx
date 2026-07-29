'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, History, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { comisionesPorAdelantado, comisionSobreCobrado, fechaUltimoCierre, INICIO_CONTABILIDAD } from '@/lib/cuentaPaola'
import { toISO } from '@/lib/dates'
import type { Moneda } from '@/lib/utils'
import { CATEGORIA_GASTO_LABEL, type CategoriaGasto, type Gasto, type Ingreso, type MovimientoInterno, type Reserva } from '@/lib/types'
import { TotalCard } from '@/components/cuenta-paola/TotalCard'
import { MonedaToggle } from '@/components/cuenta-paola/MonedaToggle'
import { TablaMovimientoFinanciero, type ItemMovimientoFinanciero } from '@/components/cuenta-paola/TablaMovimientoFinanciero'
import { TablaComisionesCobradas } from '@/components/cuenta-paola/TablaComisionesCobradas'

interface DatosCuentaPaola {
  ingresosPaola: Ingreso[]
  gastosPaola: Gasto[]
  movimientosInternos: MovimientoInterno[]
  reservas: Reserva[]
  cancelacionesPendientes: Ingreso[]
}

async function fetchDatos(): Promise<DatosCuentaPaola> {
  const r = await fetch('/api/cuenta-paola-data')
  const json = await r.json()
  if (!r.ok) throw new Error(json.error ?? 'Error al cargar los datos.')
  return json
}

function desdeFecha(fecha: string): (item: { fecha: string }) => boolean {
  const desdeISO = fecha ? toISO(fecha) : null
  return item => !desdeISO || toISO(item.fecha) > desdeISO
}

// Corte fijo del mes de transición: el sistema de comisiones formal recién arranca en agosto
// (para reservas nuevas), así que julio se mide aparte "a mano" con este rango.
const FIN_JULIO = '2026-08-01'

export default function CuentaPaolaPage() {
  const [datos, setDatos] = useState<DatosCuentaPaola | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
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
            <p className="text-sm font-medium text-amber-800">No se pudo cargar la cuenta de Paola</p>
            <p className="text-sm text-amber-700 mt-1">{error || 'Error desconocido.'}</p>
          </div>
        </div>
      </div>
    )
  }

  const reservasPorId = new Map(datos.reservas.map(r => [r.id, r]))
  const fechaCierreReembolso = fechaUltimoCierre(datos.movimientosInternos, 'reembolso_gastos')
  const gastosPaolaPendientes = fechaCierreReembolso ? datos.gastosPaola.filter(desdeFecha(fechaCierreReembolso)) : datos.gastosPaola
  const movimientosCajaChica = datos.movimientosInternos.filter(m => m.tipo === 'caja_chica')

  // Una sola cuenta corriente de caja chica: lo que Paola le debe al negocio (excedente cobrado
  // de más, cobros de reservas canceladas) en positivo, lo que el negocio le debe a ella (gastos
  // que pagó de su bolsillo, o caja chica ya usada a su favor) en negativo.
  const filasCajaChica: ItemMovimientoFinanciero[] = [
    ...gastosPaolaPendientes.map(g => ({
      id: g.id,
      fecha: g.fecha,
      monto: -(g.monto ?? 0),
      monto_ars: g.monto_ars != null ? -g.monto_ars : null,
      monto_usd: g.monto_usd != null ? -g.monto_usd : null,
      moneda: g.moneda,
      detalle: g.detalle,
      categoria: CATEGORIA_GASTO_LABEL[g.categoria as CategoriaGasto] ?? g.categoria,
    })),
    ...movimientosCajaChica.map(m => ({
      id: m.id,
      fecha: m.fecha,
      monto: m.sentido === 'a_favor_negocio' ? m.monto : -m.monto,
      monto_ars: m.monto_ars != null ? (m.sentido === 'a_favor_negocio' ? m.monto_ars : -m.monto_ars) : null,
      monto_usd: m.monto_usd != null ? (m.sentido === 'a_favor_negocio' ? m.monto_usd : -m.monto_usd) : null,
      moneda: m.moneda,
      detalle: m.detalle,
      categoria: 'Caja chica',
    })),
  ].sort((a, b) => toISO(a.fecha).localeCompare(toISO(b.fecha)))

  // Total recibido por Paola: todo lo que cobró, sin distinción de plataforma ni de si la reserva
  // ya terminó — el listado "Cobros recibidos por Paola en julio" de más abajo es exactamente esto.
  const totalRecibido = datos.ingresosPaola.reduce((s, i) => s + (i.monto_usd ?? 0), 0)
  const totalRecibidoArs = datos.ingresosPaola.reduce((s, i) => s + (i.monto_ars ?? 0), 0)

  // Comisión "provisoria" (10%/15% de lo cobrado, no de lo devengado) — el sistema formal de
  // comisiones todavía no está activo, ver comisionSobreCobrado.
  const comisionDirectas = comisionSobreCobrado(datos.ingresosPaola, reservasPorId, 'monto_usd', 'directo')
  const comisionDirectasArs = comisionSobreCobrado(datos.ingresosPaola, reservasPorId, 'monto_ars', 'directo')
  const comisionAirbnb = comisionSobreCobrado(datos.ingresosPaola, reservasPorId, 'monto_usd', 'airbnb')
  const comisionAirbnbArs = comisionSobreCobrado(datos.ingresosPaola, reservasPorId, 'monto_ars', 'airbnb')
  const comisionesTotal = comisionDirectas + comisionAirbnb
  const comisionesTotalArs = comisionDirectasArs + comisionAirbnbArs

  const totalGastosPaola = datos.gastosPaola.reduce((s, g) => s + (g.monto_usd ?? 0), 0)
  const totalGastosPaolaArs = datos.gastosPaola.reduce((s, g) => s + (g.monto_ars ?? 0), 0)

  // Misma comisión provisoria, pero acotada al calendario de julio (no al total acumulado desde
  // el corte de contabilidad, que sigue creciendo en los meses siguientes).
  const ingresosJulio = datos.ingresosPaola.filter(i => {
    const iso = toISO(i.fecha)
    return iso >= INICIO_CONTABILIDAD && iso < FIN_JULIO
  })
  const totalAPagarJulio = comisionSobreCobrado(ingresosJulio, reservasPorId, 'monto_usd')
  const totalAPagarJulioArs = comisionSobreCobrado(ingresosJulio, reservasPorId, 'monto_ars')

  // Reservas que todavía no terminaron — lo ya cobrado por adelantado de esas reservas.
  const ingresosPorVenir = comisionesPorAdelantado(datos.ingresosPaola, datos.reservas)
  const totalAPagarPorVenir = comisionSobreCobrado(ingresosPorVenir, reservasPorId, 'monto_usd')
  const totalAPagarPorVenirArs = comisionSobreCobrado(ingresosPorVenir, reservasPorId, 'monto_ars')

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-800">Comisiones y Caja chica</h1>
          <div className="flex items-center gap-2">
            <MonedaToggle value={moneda} onChange={setMoneda} />
            <Button size="sm" variant="outline" asChild>
              <Link href="/cuenta-paola/historico">
                <History className="w-3.5 h-3.5" /> Histórico de reservas cobradas
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <TotalCard titulo="Total recibido por Paola" monto={totalRecibido} montoArs={totalRecibidoArs} moneda={moneda} />
          <TotalCard
            titulo="Total comisiones"
            monto={comisionesTotal}
            montoArs={comisionesTotalArs}
            moneda={moneda}
            detalle={[
              { label: 'Directas', monto: comisionDirectas, montoArs: comisionDirectasArs },
              { label: 'Airbnb', monto: comisionAirbnb, montoArs: comisionAirbnbArs },
            ]}
          />
          <TotalCard titulo="Total de gastos hechos por Paola" monto={totalGastosPaola} montoArs={totalGastosPaolaArs} moneda={moneda} />
          <TotalCard titulo="Total a pagar por julio" monto={totalAPagarJulio} montoArs={totalAPagarJulioArs} moneda={moneda} />
          <TotalCard titulo="Total a pagar por reservas por venir" monto={totalAPagarPorVenir} montoArs={totalAPagarPorVenirArs} moneda={moneda} />
        </div>

        <div>
          <h2 className="text-sm font-medium text-slate-700 mb-1">Cobros recibidos por Paola en julio</h2>
          <TablaComisionesCobradas
            ingresos={datos.ingresosPaola}
            reservas={datos.reservas}
            vacioMensaje="Sin cobros registrados en julio."
            moneda={moneda}
          />
        </div>

        <div>
          <h2 className="text-sm font-medium text-slate-700 mb-1">Caja chica</h2>
          <p className="text-[11px] text-slate-400 mb-2">
            En positivo, lo que Paola le debe al negocio (excedente cobrado de más, cobros de reservas canceladas). En negativo, lo que el negocio le debe a ella (gastos que pagó de su bolsillo, o caja chica ya usada a su favor). El total es el saldo de caja chica.
          </p>
          <TablaMovimientoFinanciero
            items={filasCajaChica}
            vacioMensaje="Sin movimientos de caja chica todavía."
          />
        </div>
      </div>
    </div>
  )
}
