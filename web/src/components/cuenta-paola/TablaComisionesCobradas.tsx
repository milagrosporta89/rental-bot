import { formatUSD } from '@/lib/utils'
import { PLATAFORMA_LABEL, type Ingreso, type Plataforma, type Reserva } from '@/lib/types'

interface Props {
  ingresos: Ingreso[]
  reservas: Reserva[]
  vacioMensaje?: string
}

// Mismo criterio que GastosTable.tsx / PagosSection.tsx: si tiene nro_operacion fue transferencia, si no, efectivo
function metodoPago(ingreso: Ingreso): string {
  return ingreso.nro_operacion ? 'Transferencia' : 'Efectivo'
}

const COLS = 7

export function TablaComisionesCobradas({ ingresos, reservas, vacioMensaje = 'Sin comisiones cobradas.' }: Props) {
  const reservasPorId = new Map(reservas.map(r => [r.id, r]))
  const totalCobrado = ingresos.reduce((s, i) => s + (i.monto_usd ?? 0), 0)
  const totalReservas = ingresos.reduce((s, i) => {
    const reserva = i.id_reserva ? reservasPorId.get(i.id_reserva) : undefined
    return s + (reserva?.monto_total_usd ?? 0)
  }, 0)
  const porcentajeTotal = totalReservas > 0 ? (totalCobrado / totalReservas) * 100 : 0

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-100">
            <tr className="border-b border-slate-200">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Fecha</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Reserva</th>
              <th className="px-2 py-2.5 text-left text-xs font-semibold text-slate-600">Plataforma</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Monto reserva</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Cobrado</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">% cobrado</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Método de pago</th>
            </tr>
          </thead>
          <tbody>
            {ingresos.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="py-12 text-center text-sm text-slate-400">
                  {vacioMensaje}
                </td>
              </tr>
            ) : ingresos.map(ingreso => {
              const reserva = ingreso.id_reserva ? reservasPorId.get(ingreso.id_reserva) : undefined
              const pct = reserva && reserva.monto_total_usd > 0
                ? ((ingreso.monto_usd ?? 0) / reserva.monto_total_usd) * 100
                : null
              return (
                <tr key={ingreso.id} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap tabular-nums text-xs">{ingreso.fecha}</td>
                  <td className="px-4 py-2.5 text-slate-700 text-xs whitespace-nowrap">{reserva ? `#${reserva.id} — ${reserva.nombre_pax}` : 'Sin reserva asociada'}</td>
                  <td className="px-2 py-2.5 text-slate-600 text-xs">{reserva ? (PLATAFORMA_LABEL[reserva.plataforma as Plataforma] ?? reserva.plataforma) : '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 text-xs whitespace-nowrap">{reserva ? formatUSD(reserva.monto_total_usd) : '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-800 font-medium text-xs whitespace-nowrap">{formatUSD(ingreso.monto_usd)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 text-xs whitespace-nowrap">{pct != null ? `${pct.toFixed(1)}%` : '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{metodoPago(ingreso)}</td>
                </tr>
              )
            })}
          </tbody>
          {ingresos.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                <td className="px-4 py-2.5 text-slate-700 text-xs" colSpan={4}>Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-800 text-xs whitespace-nowrap">{formatUSD(totalCobrado)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 text-xs whitespace-nowrap">{porcentajeTotal.toFixed(1)}%</td>
                <td className="px-4 py-2.5"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
