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

  if (items.length === 0) {
    return (
      <div>
        <h2 className="text-sm font-medium text-slate-700 mb-2">Cobros de reservas canceladas — pendiente de clasificar</h2>
        <p className="text-sm text-slate-400 text-center py-6">Sin cobros pendientes de clasificar.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-sm font-medium text-slate-700 mb-2">Cobros de reservas canceladas — pendiente de clasificar</h2>
      <div className="divide-y divide-slate-50">
        {items.map(ingreso => {
          const reserva = reservaDe(ingreso)
          return (
            <div key={ingreso.id} className="py-3 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-slate-700 tabular-nums">
                  {ingreso.moneda} {ingreso.monto?.toLocaleString('es-AR')}
                  {ingreso.monto_usd != null ? ` · ${formatUSD(ingreso.monto_usd)}` : ''}
                </span>
                <p className="text-xs text-slate-400 mt-0.5">
                  {ingreso.fecha}{reserva ? ` · reserva #${reserva.id} (${reserva.nombre_pax}, cancelada)` : ''}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setPendiente({ ingreso, resolucion: 'comision' })}>
                  Comisión
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPendiente({ ingreso, resolucion: 'caja_chica' })}>
                  Caja chica
                </Button>
              </div>
            </div>
          )
        })}
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
