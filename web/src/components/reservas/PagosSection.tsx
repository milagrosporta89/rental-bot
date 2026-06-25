'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, Pencil, Trash2 } from 'lucide-react'
import { Ingreso } from '@/lib/types'
import { eliminarIngreso } from '@/app/actions/ingresos'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TrasladarPagoModal } from '@/components/reservas/TrasladarPagoModal'

const tipoLabel: Record<string, string> = { adelanto: 'Adelanto', saldo: 'Saldo' }

export function PagosSection({ pagos, reservaId, cancelada = false }: { pagos: Ingreso[]; reservaId: string; cancelada?: boolean }) {
  const router = useRouter()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [trasladarId, setTrasladarId] = useState<string | null>(null)
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
              <div className="flex items-center gap-1 shrink-0">
                {cancelada && (
                  <button
                    onClick={() => setTrasladarId(p.id)}
                    className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer transition-colors"
                    aria-label="Trasladar a otra reserva"
                    title="Trasladar a otra reserva"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => router.push(`/reservas/${reservaId}/pago?edit=${p.id}`)}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
                  aria-label="Editar pago"
                  title="Editar pago"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setConfirmDeleteId(p.id)}
                  className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors"
                  aria-label="Eliminar pago"
                  title="Eliminar pago"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
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
    </>
  )
}
