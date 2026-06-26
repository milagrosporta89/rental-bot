'use client'

import { Reserva, ESTADO_VISUAL_LABEL, ESTADO_VISUAL_COLOR } from '@/lib/types'
import { estadoVisual } from '@/lib/dates'
import { formatUSD } from '@/lib/utils'

interface Props {
  reserva: Reserva
  x: number
  y: number
}

export function ReservaTooltip({ reserva, x, y }: Props) {
  const estado = estadoVisual(reserva.estado_reserva, reserva.fecha_entrada, reserva.fecha_salida)
  const pagado = reserva.monto_total_usd - reserva.saldo_usd
  const left = Math.min(Math.max(8, x - 112), window.innerWidth - 232)

  return (
    <div
      style={{ position: 'fixed', top: y, left, zIndex: 50 }}
      className="w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm pointer-events-none"
    >
      <p className="font-medium text-slate-800">{reserva.nombre_pax}</p>
      <p className={`text-xs mt-1 ${ESTADO_VISUAL_COLOR[estado] ?? 'text-slate-500'}`}>
        {ESTADO_VISUAL_LABEL[estado] ?? estado}
      </p>
      <p className="text-slate-500 text-xs mt-1">
        {reserva.cantidad_pax} huéspedes · {reserva.cantidad_noches} noches
      </p>
      <p className="text-slate-500 text-xs mt-1">
        Pagado: {formatUSD(pagado)}
      </p>
    </div>
  )
}
