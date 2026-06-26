'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Reserva } from '@/lib/types'
import { esTerminada } from '@/lib/dates'
import { trasladarPago } from '@/app/actions/ingresos'

interface Props {
  ingresoId: string
  reservaOrigenId: string
  onClose: () => void
  onSaved: () => void
}

export function TrasladarPagoModal({ ingresoId, reservaOrigenId, onClose, onSaved }: Props) {
  const [q, setQ] = useState('')
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [seleccionada, setSeleccionada] = useState<Reserva | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/calendar-data')
      .then(r => r.json())
      .then(({ reservas }: { reservas: Reserva[] }) => {
        setReservas(reservas.filter(r =>
          r.id !== reservaOrigenId && r.estado_reserva !== 'cancelada' && !esTerminada(r.fecha_salida)
        ))
      })
  }, [reservaOrigenId])

  const filtradas = reservas
    .filter(r => {
      if (!q) return true
      const ql = q.toLowerCase()
      return r.nombre_pax.toLowerCase().includes(ql) || r.casa.toLowerCase().includes(ql) || r.id.includes(q)
    })
    .slice(0, 30)

  async function confirmar() {
    if (!seleccionada) return
    setLoading(true)
    setError('')
    try {
      await trasladarPago(ingresoId, seleccionada.id)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al trasladar el pago.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-slate-700 font-medium">Trasladar pago a otra reserva</DialogTitle>
        </DialogHeader>

        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar por nombre, casa o #id…"
          className="text-sm"
          autoFocus
        />

        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
          {filtradas.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Sin resultados</p>
          ) : filtradas.map(r => (
            <button
              key={r.id}
              onClick={() => setSeleccionada(r)}
              className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors ${
                seleccionada?.id === r.id ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-600'
              }`}
            >
              {r.nombre_pax}{' '}
              <span className="text-xs text-slate-400">· Casa {r.casa.replace(/\D/g, '')} · {r.fecha_entrada}</span>
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-500 cursor-pointer">
            Cancelar
          </Button>
          <Button size="sm" onClick={confirmar} disabled={!seleccionada || loading} className="cursor-pointer">
            {loading ? 'Trasladando…' : 'Trasladar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
