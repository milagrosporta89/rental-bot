import { formatUSD } from '@/lib/utils'
import { PLATAFORMA_LABEL, type Plataforma } from '@/lib/types'
import type { FilaReconciliacion } from '@/lib/cuentaPaola'

const COLS = 5

export function TablaReconciliacionComision({ filas }: { filas: FilaReconciliacion[] }) {
  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-100">
            <tr className="border-b border-slate-200">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Reserva</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Plataforma</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Le corresponde</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Cobrado</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="py-12 text-center text-sm text-slate-400">
                  Sin diferencias pendientes — lo cobrado coincide con lo que correspondía.
                </td>
              </tr>
            ) : filas.map(({ reserva, devengado, cobrado, diferencia }) => (
              <tr key={reserva.id} className="border-b border-slate-100">
                <td className="px-4 py-2.5 text-slate-700 text-xs">#{reserva.id} · {reserva.nombre_pax}</td>
                <td className="px-4 py-2.5 text-slate-600 text-xs">{PLATAFORMA_LABEL[reserva.plataforma as Plataforma] ?? reserva.plataforma}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 text-xs whitespace-nowrap">{formatUSD(devengado)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 text-xs whitespace-nowrap">{formatUSD(cobrado)}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium text-xs whitespace-nowrap ${diferencia > 0 ? 'text-amber-600' : diferencia < 0 ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {formatUSD(diferencia)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
