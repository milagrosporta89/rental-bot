import { formatUSD } from '@/lib/utils'
import type { Ingreso, Reserva } from '@/lib/types'

interface Props {
  ingresos: Ingreso[]
  reservas: Reserva[]
}

function metodoPago(ingreso: Ingreso): string {
  return ingreso.nro_operacion ? 'Transferencia' : 'Efectivo'
}

export function TablaComisionesCobradas({ ingresos, reservas }: Props) {
  if (ingresos.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-6">Sin comisiones cobradas este mes.</p>
  }

  const reservasPorId = new Map(reservas.map(r => [r.id, r]))
  const totalCobrado = ingresos.reduce((s, i) => s + (i.monto_usd ?? 0), 0)
  const totalReservas = ingresos.reduce((s, i) => {
    const reserva = i.id_reserva ? reservasPorId.get(i.id_reserva) : undefined
    return s + (reserva?.monto_total_usd ?? 0)
  }, 0)
  const porcentajeTotal = totalReservas > 0 ? (totalCobrado / totalReservas) * 100 : 0

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-400 border-b border-slate-200">
            <th className="text-left py-2 font-medium">Fecha</th>
            <th className="text-left py-2 font-medium">Reserva</th>
            <th className="text-right py-2 font-medium">Monto reserva</th>
            <th className="text-right py-2 font-medium">Cobrado</th>
            <th className="text-right py-2 font-medium">% cobrado</th>
            <th className="text-left py-2 font-medium">Método</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {ingresos.map(ingreso => {
            const reserva = ingreso.id_reserva ? reservasPorId.get(ingreso.id_reserva) : undefined
            const pct = reserva && reserva.monto_total_usd > 0
              ? ((ingreso.monto_usd ?? 0) / reserva.monto_total_usd) * 100
              : null
            return (
              <tr key={ingreso.id}>
                <td className="py-2 text-slate-500">{ingreso.fecha}</td>
                <td className="py-2 text-slate-700">{reserva ? `#${reserva.id} — ${reserva.nombre_pax}` : 'Sin reserva asociada'}</td>
                <td className="py-2 text-right tabular-nums text-slate-600">{reserva ? formatUSD(reserva.monto_total_usd) : '—'}</td>
                <td className="py-2 text-right tabular-nums text-slate-800 font-medium">{formatUSD(ingreso.monto_usd)}</td>
                <td className="py-2 text-right tabular-nums text-slate-600">{pct != null ? `${pct.toFixed(1)}%` : '—'}</td>
                <td className="py-2 text-slate-500">{metodoPago(ingreso)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-medium">
            <td className="py-2 text-slate-700" colSpan={3}>Total</td>
            <td className="py-2 text-right tabular-nums text-slate-800">{formatUSD(totalCobrado)}</td>
            <td className="py-2 text-right tabular-nums text-slate-600">{porcentajeTotal.toFixed(1)}%</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
