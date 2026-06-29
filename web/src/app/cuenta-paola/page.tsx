'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { calcularSaldoPaola } from '@/lib/cuentaPaola'
import type { Gasto, Ingreso, MovimientoInterno, Reserva, SentidoMovimiento } from '@/lib/types'
import { SaldoPaolaCard } from '@/components/cuenta-paola/SaldoPaolaCard'
import { ListaMovimientoFinanciero } from '@/components/cuenta-paola/ListaMovimientoFinanciero'
import { MovimientoModal } from '@/components/cuenta-paola/MovimientoModal'
import { CierreMensualSection } from '@/components/cuenta-paola/CierreMensualSection'
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

export default function CuentaPaolaPage() {
  const [datos, setDatos] = useState<DatosCuentaPaola | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<{ open: boolean; prefill?: { monto: number; sentido: SentidoMovimiento; detalle?: string } }>({ open: false })
  const [modalKey, setModalKey] = useState(0)

  useEffect(() => {
    fetchDatos().then(setDatos).catch(e => setError(e.message)).finally(() => setCargando(false))
  }, [])

  const recargar = useCallback(() => {
    setCargando(true)
    setError('')
    fetchDatos().then(setDatos).catch(e => setError(e.message)).finally(() => setCargando(false))
  }, [])

  function abrirModal(prefill?: { monto: number; sentido: SentidoMovimiento; detalle?: string }) {
    setModalKey(k => k + 1)
    setModal({ open: true, prefill })
  }

  function cerrarMesConTotal(total: number, mes: string) {
    // diferencia > 0 → devengado > cobrado → Paola cobró de menos → el negocio le debe (a_favor_paola)
    const sentido: SentidoMovimiento = total > 0 ? 'a_favor_paola' : 'a_favor_negocio'
    // El mes queda en el detalle para que se note en "Movimientos de ajuste" si este mes ya se cerró antes —
    // no hay un mecanismo de "mes cerrado" todavía, ver qa-output.json.
    abrirModal({ monto: Math.abs(total), sentido, detalle: `Cierre mensual de comisión — ${mes}` })
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

  const saldo = calcularSaldoPaola(datos.ingresosPaola, datos.gastosPaola, datos.movimientosInternos)
  const reservasPorId = new Map(datos.reservas.map(r => [r.id, r]))

  function detalleComision(ingreso: Ingreso): string | null {
    const reserva = ingreso.id_reserva ? reservasPorId.get(ingreso.id_reserva) : undefined
    if (!reserva) return ingreso.detalle
    return `Reserva #${reserva.id} — ${reserva.nombre_pax}`
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-800">Cuenta de Paola</h1>
          <Button size="sm" onClick={() => abrirModal()}>
            Registrar movimiento
          </Button>
        </div>

        <SaldoPaolaCard saldo={saldo} />

        <ListaMovimientoFinanciero
          titulo="Comisiones cobradas"
          items={datos.ingresosPaola.map(i => ({ id: i.id, fecha: i.fecha, monto: i.monto, monto_usd: i.monto_usd, moneda: i.moneda, detalle: detalleComision(i) }))}
          vacioMensaje="Sin comisiones cobradas todavía."
        />

        <ListaMovimientoFinanciero
          titulo="Gastos pagados por Paola"
          items={datos.gastosPaola.map(g => ({ id: g.id, fecha: g.fecha, monto: g.monto, monto_usd: g.monto_usd, moneda: g.moneda, detalle: g.detalle }))}
          vacioMensaje="Sin gastos pagados por Paola todavía."
        />

        <ListaMovimientoFinanciero
          titulo="Movimientos de ajuste"
          items={datos.movimientosInternos.map(m => ({ id: m.id, fecha: m.fecha, monto: m.monto, monto_usd: m.monto_usd, moneda: m.moneda, detalle: m.detalle }))}
          vacioMensaje="Sin movimientos registrados todavía."
        />

        <CierreMensualSection
          reservas={datos.reservas}
          ingresosPaola={datos.ingresosPaola}
          onCerrarMes={cerrarMesConTotal}
        />

        <CancelacionesPendientesSection
          items={datos.cancelacionesPendientes}
          reservas={datos.reservas}
          onResuelto={recargar}
        />
      </div>

      <MovimientoModal
        key={modalKey}
        open={modal.open}
        prefill={modal.prefill}
        onClose={() => setModal(m => ({ ...m, open: false }))}
        onSaved={() => { setModal(m => ({ ...m, open: false })); recargar() }}
      />
    </div>
  )
}
