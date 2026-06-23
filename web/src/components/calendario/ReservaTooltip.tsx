'use client'

import { useEffect, useRef } from 'react'
import { Reserva } from '@/lib/types'

const ESTADO_PAGO_CONFIG = {
  pagado:  { color: '#10b981', texto: 'Pagado' },
  parcial: { color: '#f59e0b', texto: 'Seña pagada — saldo pendiente' },
  debe:    { color: '#ef4444', texto: 'Sin pago registrado' },
}

interface Props {
  reserva: Reserva
  x: number
  y: number
  onClose: () => void
  onVerDetalle: (r: Reserva) => void
}

export function ReservaTooltip({ reserva, x, y, onClose, onVerDetalle }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const ep = ESTADO_PAGO_CONFIG[reserva.estado_pago]

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Ajustar para que no se salga de la pantalla
  const left = Math.min(x - 120, window.innerWidth - 260)

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'fixed', top: y, left: Math.max(8, left), zIndex: 50 }}
      className="w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm"
    >
      <p className="font-medium text-slate-800">{reserva.nombre_pax}</p>
      <p className="text-slate-400 text-xs mt-0.5">
        Casa {reserva.casa} · {reserva.cantidad_noches}n · {reserva.cantidad_pax} pax
      </p>
      <div className="flex items-center gap-1.5 mt-2">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: ep.color }}
        />
        <span className="text-slate-600 text-xs">{ep.texto}</span>
      </div>
      <button
        onClick={() => onVerDetalle(reserva)}
        className="mt-3 w-full text-xs text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 rounded px-2 py-1.5 transition-colors duration-150 cursor-pointer"
      >
        Ver detalle
      </button>
    </div>
  )
}
