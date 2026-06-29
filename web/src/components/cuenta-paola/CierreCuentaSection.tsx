'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { formatUSD } from '@/lib/utils'
import { toISO, hoy } from '@/lib/dates'
import { fechaUltimoCierre, gastosPendientesDeReembolso, reconciliacionDesdeUltimoCierre } from '@/lib/cuentaPaola'
import { crearMovimientoInterno } from '@/app/actions/movimientosInternos'
import type { Gasto, Ingreso, MovimientoInterno, Reserva } from '@/lib/types'
import { TablaReconciliacionComision } from './TablaReconciliacionComision'
import { ListaMovimientoFinanciero } from './ListaMovimientoFinanciero'

interface Props {
  reservas: Reserva[]
  ingresosPaola: Ingreso[]
  gastosPaola: Gasto[]
  movimientosInternos: MovimientoInterno[]
  onCerrado: () => void
}

function desde(fecha: string | null): string {
  return fecha ? `desde el ${fecha}` : '(histórico completo, todavía no hubo ningún cierre)'
}

export function CierreCuentaSection({ reservas, ingresosPaola, gastosPaola, movimientosInternos, onCerrado }: Props) {
  const [confirmando, setConfirmando] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fechaCierreComision = fechaUltimoCierre(movimientosInternos, 'cierre_comision')
  const fechaCierreReembolso = fechaUltimoCierre(movimientosInternos, 'reembolso_gastos')

  const filasComision = reconciliacionDesdeUltimoCierre(
    reservas, ingresosPaola, fechaCierreComision ? toISO(fechaCierreComision) : null
  )
  const totalComision = filasComision.reduce((s, f) => s + f.diferencia, 0)

  const gastosPendientes = gastosPendientesDeReembolso(
    gastosPaola, fechaCierreReembolso ? toISO(fechaCierreReembolso) : null
  )
  const totalReembolso = gastosPendientes.reduce((s, g) => s + (g.monto_usd ?? 0), 0)

  const totalGeneral = totalComision + totalReembolso
  const hayAlgoQueCerrar = totalComision !== 0 || totalReembolso > 0

  async function confirmarCierre() {
    setLoading(true)
    setError('')
    const fecha = hoy()
    try {
      if (totalComision !== 0) {
        await crearMovimientoInterno({
          fecha,
          monto: Math.abs(totalComision),
          moneda: 'USD',
          cotizacion: 0,
          monto_ars: null,
          monto_usd: Math.abs(totalComision),
          sentido: totalComision > 0 ? 'a_favor_paola' : 'a_favor_negocio',
          tipo: 'cierre_comision',
          detalle: `Cierre de comisión pendiente ${desde(fechaCierreComision)}`,
          comprobante_url: null,
        })
      }
      if (totalReembolso > 0) {
        await crearMovimientoInterno({
          fecha,
          monto: totalReembolso,
          moneda: 'USD',
          cotizacion: 0,
          monto_ars: null,
          monto_usd: totalReembolso,
          sentido: 'a_favor_paola',
          tipo: 'reembolso_gastos',
          detalle: `Reembolso de gastos pendientes ${desde(fechaCierreReembolso)}`,
          comprobante_url: null,
        })
      }
      setConfirmando(false)
      onCerrado()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cerrar. Podés reintentar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-slate-700 mb-2">
          Comisión pendiente — {desde(fechaCierreComision)}
        </h2>
        <TablaReconciliacionComision filas={filasComision} />
      </div>

      <div>
        <h2 className="text-sm font-medium text-slate-700 mb-2">
          Gastos pendientes de reembolso — {desde(fechaCierreReembolso)}
        </h2>
        <ListaMovimientoFinanciero
          items={gastosPendientes.map(g => ({ id: g.id, fecha: g.fecha, monto: g.monto, monto_usd: g.monto_usd, moneda: g.moneda, detalle: g.detalle }))}
          vacioMensaje="Sin gastos pendientes de reembolso."
        />
      </div>

      <div className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
        <div>
          <p className="text-xs text-slate-400">Total a transferir (comisión + reembolso)</p>
          <p className={`text-sm font-medium tabular-nums ${totalGeneral > 0 ? 'text-amber-600' : totalGeneral < 0 ? 'text-indigo-600' : 'text-slate-500'}`}>
            {formatUSD(totalGeneral)}
          </p>
        </div>
        {hayAlgoQueCerrar && (
          <Button size="sm" variant="outline" onClick={() => setConfirmando(true)}>
            Cerrar cuenta
          </Button>
        )}
      </div>

      <Dialog open={confirmando} onOpenChange={o => !o && setConfirmando(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar cierre de cuenta</DialogTitle>
            <DialogDescription>
              Comisión pendiente: {formatUSD(totalComision)}<br />
              Reembolso de gastos: {formatUSD(totalReembolso)}<br />
              <strong>Total: {formatUSD(totalGeneral)}</strong>
              <br /><br />
              Esto registra los movimientos correspondientes — hacé la transferencia real antes o después de confirmar acá. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmando(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button size="sm" onClick={confirmarCierre} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
              Confirmar cierre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
