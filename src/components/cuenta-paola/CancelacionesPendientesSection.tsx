'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { formatUSD } from '@/lib/utils'
import { marcarResolucionCancelacion } from '@/app/actions/ingresos'
import type { Ingreso, Reserva, ResolucionCancelacion } from '@/lib/types'

interface Props {
  items: Ingreso[]
  reservas: Reserva[]
  onResuelto: () => void
}

const COLS = 4

export function CancelacionesPendientesSection({ items, reservas, onResuelto }: Props) {
  const [pendiente, setPendiente] = useState<{ ingreso: Ingreso; resolucion: ResolucionCancelacion } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function reservaDe(ingreso: Ingreso): Reserva | undefined {
    return reservas.find(r => r.id === ingreso.id_reserva)
  }

  async function confirmar() {
    if (!pendiente) return
    setLoading(true)
    setError('')
    try {
      await marcarResolucionCancelacion(pendiente.ingreso.id, pendiente.resolucion)
      setPendiente(null)
      onResuelto()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al clasificar. Podés reintentar.')
    } finally {
      setLoading(false)
    }
  }

  const total = items.reduce((s, i) => s + (i.monto_usd ?? 0), 0)

  return (
    <div>
      <h2 className="text-sm font-medium text-slate-700 mb-1">Cobros de reservas canceladas — pendiente de clasificar</h2>
      <p className="text-[11px] text-slate-400 mb-2">
        Comisión cobrada en reservas que después se cancelaron — hay que decidir si queda como comisión de Paola o se usa para saldar caja chica.
      </p>
      <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-100">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Fecha</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Reserva</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Monto</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Clasificar</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={COLS} className="py-12 text-center text-sm text-slate-400">Sin cobros pendientes de clasificar.</td>
                </tr>
              ) : items.map(ingreso => {
                const reserva = reservaDe(ingreso)
                return (
                  <tr key={ingreso.id} className="border-b border-slate-100">
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap tabular-nums text-xs">{ingreso.fecha}</td>
                    <td className="px-4 py-2.5 text-slate-700 text-xs">{reserva ? `#${reserva.id} — ${reserva.nombre_pax}` : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-800 font-medium text-xs whitespace-nowrap">{formatUSD(ingreso.monto_usd)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setPendiente({ ingreso, resolucion: 'comision' })}>
                          Comisión
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setPendiente({ ingreso, resolucion: 'caja_chica' })}>
                          Caja chica
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                  <td className="px-4 py-2.5 text-slate-700 text-xs" colSpan={2}>Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-800 text-xs whitespace-nowrap">{formatUSD(total)}</td>
                  <td className="px-4 py-2.5"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <Dialog open={pendiente !== null} onOpenChange={open => !open && setPendiente(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {pendiente?.resolucion === 'comision' ? 'Marcar como comisión' : 'Marcar como caja chica'}
            </DialogTitle>
            <DialogDescription>
              {pendiente?.resolucion === 'comision'
                ? 'Esta plata queda definitivamente como comisión de Paola, sin ningún otro ajuste.'
                : 'Se registra un movimiento a favor del negocio por este monto — resta de lo que se le debe a Paola por caja chica.'}
              {' '}Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPendiente(null)} disabled={loading}>
              Cancelar
            </Button>
            <Button size="sm" onClick={confirmar} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
