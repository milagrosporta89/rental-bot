import { formatUSD } from '@/lib/utils'
import { PLATAFORMA_LABEL, type Plataforma } from '@/lib/types'
import type { FilaReconciliacion } from '@/lib/cuentaPaola'

export function TablaReconciliacionComision({ filas }: { filas: FilaReconciliacion[] }) {
  if (filas.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-6">Sin reservas con checkout en este mes.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-400 border-b border-slate-200">
            <th className="text-left py-2 font-medium">Reserva</th>
            <th className="text-left py-2 font-medium">Plataforma</th>
            <th className="text-right py-2 font-medium">Devengado</th>
            <th className="text-right py-2 font-medium">Cobrado</th>
            <th className="text-right py-2 font-medium">Diferencia</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {filas.map(({ reserva, devengado, cobrado, diferencia }) => (
            <tr key={reserva.id}>
              <td className="py-2 text-slate-700">#{reserva.id} · {reserva.nombre_pax}</td>
              <td className="py-2 text-slate-500">{PLATAFORMA_LABEL[reserva.plataforma as Plataforma] ?? reserva.plataforma}</td>
              <td className="py-2 text-right tabular-nums text-slate-700">{formatUSD(devengado)}</td>
              <td className="py-2 text-right tabular-nums text-slate-700">{formatUSD(cobrado)}</td>
              <td className={`py-2 text-right tabular-nums font-medium ${diferencia > 0 ? 'text-amber-600' : diferencia < 0 ? 'text-indigo-600' : 'text-slate-400'}`}>
                {formatUSD(diferencia)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
