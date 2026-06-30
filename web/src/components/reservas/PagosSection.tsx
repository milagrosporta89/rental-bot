'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical } from 'lucide-react'
import { Ingreso, Reserva } from '@/lib/types'
import { eliminarIngreso } from '@/app/actions/ingresos'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { TrasladarPagoModal } from '@/components/reservas/TrasladarPagoModal'
import { ReciboModal } from '@/components/reservas/ReciboModal'

const tipoLabel: Record<string, string> = { adelanto: 'Adelanto', saldo: 'Saldo' }

export function PagosSection({ pagos, reservaId, reserva, cancelada = false }: { pagos: Ingreso[]; reservaId: string; reserva: Reserva; cancelada?: boolean }) {
  const router = useRouter()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [trasladarId, setTrasladarId] = useState<string | null>(null)
  const [reciboId, setReciboId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleDelete(id: string) {
    setLoading(true)
    try {
      await eliminarIngreso(id, reservaId)
      router.refresh()
    } finally {
      setLoading(false)
      setConfirmDeleteId(null)
    }
  }

  const pagoAEliminar = pagos.find(p => p.id === confirmDeleteId)
  const pagoRecibo = pagos.find(p => p.id === reciboId)

  if (pagos.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-6">Sin pagos registrados</p>
  }

  return (
    <>
      <div className="divide-y divide-slate-50">
        {pagos.map(p => {
          const metodo = p.nro_operacion ? 'Transferencia' : 'Efectivo'

          return (
            <div key={p.id} className="py-3 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-700 tabular-nums">
                    {p.moneda} {p.monto?.toLocaleString('es-AR')}
                  </span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-500">{tipoLabel[p.tipo_movimiento] ?? p.tipo_movimiento}</span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-500">{metodo}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {p.fecha}
                  {p.quien_pago && (
                    <>
                      {' · '}
                      {p.nombre_destinatario
                        ? `${p.quien_pago} pagó a ${p.nombre_destinatario}`
                        : p.quien_pago}
                    </>
                  )}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer transition-colors shrink-0"
                    aria-label="Más acciones"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setReciboId(p.id)}>
                    Ver recibo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push(`/reservas/${reservaId}/pago?edit=${p.id}`)}>
                    Editar
                  </DropdownMenuItem>
                  {cancelada && (
                    <DropdownMenuItem onClick={() => setTrasladarId(p.id)}>
                      Trasladar a otra reserva
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setConfirmDeleteId(p.id)}>
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}
      </div>

      <Dialog open={confirmDeleteId !== null} onOpenChange={open => !open && setConfirmDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar pago</DialogTitle>
            <DialogDescription>
              {pagoAEliminar && (
                <>
                  {pagoAEliminar.moneda} {pagoAEliminar.monto?.toLocaleString('es-AR')}
                  {pagoAEliminar.quien_pago ? ` · ${pagoAEliminar.quien_pago}` : ''}
                  {' · '}{pagoAEliminar.fecha}
                  <br />
                </>
              )}
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={loading}
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {trasladarId && (
        <TrasladarPagoModal
          ingresoId={trasladarId}
          reservaOrigenId={reservaId}
          onClose={() => setTrasladarId(null)}
          onSaved={() => { setTrasladarId(null); router.refresh() }}
        />
      )}

      {pagoRecibo && (
        <ReciboModal
          pago={pagoRecibo}
          reserva={reserva}
          onClose={() => setReciboId(null)}
        />
      )}
    </>
  )
}
