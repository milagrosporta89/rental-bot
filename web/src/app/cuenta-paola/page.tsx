'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saldoPendienteTotal, fechaUltimoCierre, comisionesPorAdelantado } from '@/lib/cuentaPaola'
import { toISO } from '@/lib/dates'
import type { Gasto, Ingreso, MovimientoInterno, Reserva } from '@/lib/types'
import { SaldoPaolaCard } from '@/components/cuenta-paola/SaldoPaolaCard'
import { TablaMovimientoFinanciero } from '@/components/cuenta-paola/TablaMovimientoFinanciero'
import { TablaComisionesCobradas } from '@/components/cuenta-paola/TablaComisionesCobradas'
import { MovimientoModal } from '@/components/cuenta-paola/MovimientoModal'
import { CierreCuentaSection } from '@/components/cuenta-paola/CierreCuentaSection'
import { CancelacionesPendientesSection } from '@/components/cuenta-paola/CancelacionesPendientesSection'

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

export default function CuentaPaolaPage() {
  const [datos, setDatos] = useState<DatosCuentaPaola | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalKey, setModalKey] = useState(0)

  useEffect(() => {
    fetchDatos().then(setDatos).catch(e => setError(e.message)).finally(() => setCargando(false))
  }, [])

  const recargar = useCallback(() => {
    setCargando(true)
    setError('')
    fetchDatos().then(setDatos).catch(e => setError(e.message)).finally(() => setCargando(false))
  }, [])

  function abrirModalLibre() {
    setModalKey(k => k + 1)
    setModalOpen(true)
  }

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

  // "Comisiones cobradas" y "Gastos pagados por Paola" muestran lo acumulado desde el último
  // cierre de cada tipo — mismo criterio que usa CierreCuentaSection, así no hay dos nociones
  // distintas de "qué es lo pendiente" en la misma pantalla. El saldo principal usa exactamente
  // la misma cuenta (comisión pendiente + gastos pendientes), nunca el acumulado de toda la vida.
  const saldo = saldoPendienteTotal(datos.reservas, datos.ingresosPaola, datos.gastosPaola, datos.movimientosInternos)
  const fechaCierreComision = fechaUltimoCierre(datos.movimientosInternos, 'cierre_comision')
  const fechaCierreReembolso = fechaUltimoCierre(datos.movimientosInternos, 'reembolso_gastos')
  const gastosPaolaPendientes = fechaCierreReembolso ? datos.gastosPaola.filter(desdeFecha(fechaCierreReembolso)) : datos.gastosPaola

  // Comisiones cobradas por adelantado de reservas que todavía no terminaron — quedan "en
  // stand-by" hasta que la reserva concluya, así que se muestran aparte de las que ya se
  // pueden cerrar (esas sí entran en "desde el último cierre").
  const adelantadas = comisionesPorAdelantado(datos.ingresosPaola, datos.reservas)
  const idsAdelantadas = new Set(adelantadas.map(i => i.id))
  const comisionesDesdeUltimoCierre = fechaCierreComision ? datos.ingresosPaola.filter(desdeFecha(fechaCierreComision)) : datos.ingresosPaola
  const comisionesListasParaCerrar = comisionesDesdeUltimoCierre.filter(i => !idsAdelantadas.has(i.id))

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-800">Cuenta de Paola</h1>
          <Button size="sm" onClick={abrirModalLibre}>
            Registrar movimiento
          </Button>
        </div>

        <SaldoPaolaCard saldo={saldo} />

        <div>
          <h2 className="text-sm font-medium text-slate-700 mb-2">Comisiones cobradas — listas para cerrar</h2>
          <TablaComisionesCobradas
            ingresos={comisionesListasParaCerrar}
            reservas={datos.reservas}
            vacioMensaje="Sin comisiones listas para cerrar desde el último cierre."
          />
        </div>

        <div>
          <h2 className="text-sm font-medium text-slate-700 mb-2">Comisiones cobradas por adelantado — la reserva todavía no terminó</h2>
          <TablaComisionesCobradas
            ingresos={adelantadas}
            reservas={datos.reservas}
            vacioMensaje="Sin comisiones cobradas por adelantado."
          />
        </div>

        <TablaMovimientoFinanciero
          titulo="Gastos pagados por Paola — desde el último cierre"
          items={gastosPaolaPendientes.map(g => ({ id: g.id, fecha: g.fecha, monto: g.monto, monto_usd: g.monto_usd, moneda: g.moneda, detalle: g.detalle }))}
          vacioMensaje="Sin gastos pagados por Paola desde el último cierre."
        />

        <TablaMovimientoFinanciero
          titulo="Movimientos de ajuste"
          items={datos.movimientosInternos.map(m => ({ id: m.id, fecha: m.fecha, monto: m.monto, monto_usd: m.monto_usd, moneda: m.moneda, detalle: m.detalle }))}
          vacioMensaje="Sin movimientos registrados todavía."
        />

        <CierreCuentaSection
          reservas={datos.reservas}
          ingresosPaola={datos.ingresosPaola}
          gastosPaola={datos.gastosPaola}
          movimientosInternos={datos.movimientosInternos}
          onCerrado={recargar}
        />

        <CancelacionesPendientesSection
          items={datos.cancelacionesPendientes}
          reservas={datos.reservas}
          onResuelto={recargar}
        />
      </div>

      <MovimientoModal
        key={modalKey}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); recargar() }}
      />
    </div>
  )
}
