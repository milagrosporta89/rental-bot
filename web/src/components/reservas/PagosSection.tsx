'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical } from 'lucide-react'
import { Ingreso, Reserva } from '@/lib/types'
import { eliminarIngreso } from '@/app/actions/ingresos'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TrasladarPagoModal } from '@/components/reservas/TrasladarPagoModal'
import { ReciboModal } from '@/components/reservas/ReciboModal'

const tipoLabel: Record<string, string> = { adelanto: 'Adelanto', saldo: 'Saldo' }

export function PagosSection({ pagos, reservaId, reserva, cancelada = false }: { pagos: Ingreso[]; reservaId: string; reserva: Reserva; cancelada?: boolean }) {
  const router = useRouter()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [trasladarId, setTrasladarId] = useState<string | null>(null)
  const [reciboId, setReciboId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
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
              <div className="relative shrink-0">
                <button
                  onClick={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}
                  className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer transition-colors"
                  aria-label="Más acciones"
                  aria-haspopup="menu"
                  aria-expanded={openMenuId === p.id}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {openMenuId === p.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
                    <div
                      role="menu"
                      className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50"
                    >
                      <button
                        role="menuitem"
                        onClick={() => { setOpenMenuId(null); setReciboId(p.id) }}
                        className="w-full text-left px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        Ver recibo
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => { setOpenMenuId(null); router.push(`/reservas/${reservaId}/pago?edit=${p.id}`) }}
                        className="w-full text-left px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        Editar
                      </button>
                      {cancelada && (
                        <button
                          role="menuitem"
                          onClick={() => { setOpenMenuId(null); setTrasladarId(p.id) }}
                          className="w-full text-left px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
                        >
                          Trasladar a otra reserva
                        </button>
                      )}
                      <div className="my-1 border-t border-slate-100" />
                      <button
                        role="menuitem"
                        onClick={() => { setOpenMenuId(null); setConfirmDeleteId(p.id) }}
                        className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 cursor-pointer"
                      >
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Dialog open={confirmDeleteId !== null} onOpenChange={open => !open && setConfirmDeleteId(null)}>
        <DialogContent className="max-w-sm">
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
