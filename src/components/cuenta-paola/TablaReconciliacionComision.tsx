import { formatMonto, type Moneda } from '@/lib/utils'
import { PLATAFORMA_LABEL, type Plataforma } from '@/lib/types'
import type { FilaReconciliacion } from '@/lib/cuentaPaola'

const COLS = 7

interface Props {
  filas: FilaReconciliacion[]
  moneda: Moneda
}

export function TablaReconciliacionComision({ filas, moneda }: Props) {
  const totalMonto = filas.reduce((s, f) => s + f.reserva.monto_total_usd, 0)
  const totalMontoArs = filas.reduce((s, f) => s + f.reserva.monto_total_usd * f.reserva.cotizacion, 0)
  const totalDevengado = filas.reduce((s, f) => s + f.devengado, 0)
  const totalDevengadoArs = filas.reduce((s, f) => s + f.devengadoArs, 0)
  const totalCobrado = filas.reduce((s, f) => s + f.cobrado, 0)
  const totalCobradoArs = filas.reduce((s, f) => s + f.cobradoArs, 0)
  const totalDiferencia = filas.reduce((s, f) => s + f.diferencia, 0)
  const totalDiferenciaArs = filas.reduce((s, f) => s + f.diferenciaArs, 0)

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-100">
            <tr className="border-b border-slate-200">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Fecha</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Reserva</th>
              <th className="px-2 py-2.5 text-left text-xs font-semibold text-slate-600">Plataforma</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Monto</th>
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
            ) : filas.map(fila => {
              const { reserva, devengado, cobrado, diferencia, devengadoArs, cobradoArs, diferenciaArs } = fila
              return (
                <tr key={reserva.id} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap tabular-nums text-xs">{reserva.fecha_salida}</td>
                  <td className="px-4 py-2.5 text-slate-700 text-xs whitespace-nowrap">#{reserva.id} · {reserva.nombre_pax}</td>
                  <td className="px-2 py-2.5 text-slate-600 text-xs">{PLATAFORMA_LABEL[reserva.plataforma as Plataforma] ?? reserva.plataforma}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 text-xs whitespace-nowrap">{formatMonto(reserva.monto_total_usd, reserva.monto_total_usd * reserva.cotizacion, moneda)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 text-xs whitespace-nowrap">{formatMonto(devengado, devengadoArs, moneda)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 text-xs whitespace-nowrap">{formatMonto(cobrado, cobradoArs, moneda)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium text-xs whitespace-nowrap ${diferencia > 0 ? 'text-red-500' : diferencia < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {formatMonto(diferencia, diferenciaArs, moneda)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                <td className="px-4 py-2.5 text-slate-700 text-xs" colSpan={3}>Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-800 text-xs whitespace-nowrap">{formatMonto(totalMonto, totalMontoArs, moneda)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-800 text-xs whitespace-nowrap">{formatMonto(totalDevengado, totalDevengadoArs, moneda)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-800 text-xs whitespace-nowrap">{formatMonto(totalCobrado, totalCobradoArs, moneda)}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums text-xs whitespace-nowrap ${totalDiferencia > 0 ? 'text-red-500' : totalDiferencia < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {formatMonto(totalDiferencia, totalDiferenciaArs, moneda)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
