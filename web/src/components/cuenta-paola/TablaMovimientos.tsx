import { formatUSD } from '@/lib/utils'
import type { MovimientoInterno } from '@/lib/types'

interface Props {
  items: MovimientoInterno[]
  vacioMensaje: string
}

const COLS = 4

export function TablaMovimientos({ items, vacioMensaje }: Props) {
  const total = items.reduce((s, m) => s + (m.monto_usd ?? m.monto), 0)

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-100">
            <tr className="border-b border-slate-200">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Fecha</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Cuenta</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Monto</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="py-12 text-center text-sm text-slate-400">{vacioMensaje}</td>
              </tr>
            ) : items.map(m => (
              <tr key={m.id} className="border-b border-slate-100">
                <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap tabular-nums text-xs">{m.fecha}</td>
                <td className="px-4 py-2.5 text-slate-600 text-xs">{m.cuenta_origen || '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-800 font-medium text-xs whitespace-nowrap">{formatUSD(m.monto_usd ?? m.monto)}</td>
                <td className="px-4 py-2.5 text-slate-500 text-xs max-w-xs truncate">{m.detalle || '—'}</td>
              </tr>
            ))}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                <td className="px-4 py-2.5 text-slate-700 text-xs" colSpan={2}>Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-800 text-xs whitespace-nowrap">{formatUSD(total)}</td>
                <td className="px-4 py-2.5"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
