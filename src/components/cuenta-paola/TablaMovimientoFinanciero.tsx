import { formatUSD } from '@/lib/utils'

export interface ItemMovimientoFinanciero {
  id: string
  fecha: string
  monto: number
  monto_ars: number | null
  monto_usd: number | null
  moneda: string
  detalle: string | null
  categoria: string
}

interface Props {
  titulo?: string
  bajada?: string
  items: ItemMovimientoFinanciero[]
  vacioMensaje: string
}

const COLS = 5

export function TablaMovimientoFinanciero({ titulo, bajada, items, vacioMensaje }: Props) {
  const total = items.reduce((s, i) => s + (i.monto_usd ?? 0), 0)
  const totalPesos = items.reduce((s, i) => s + (i.monto_ars ?? 0), 0)

  return (
    <div>
      {titulo && <h2 className="text-sm font-medium text-slate-700 mb-1">{titulo}</h2>}
      {bajada && <p className="text-[11px] text-slate-400 mb-2">{bajada}</p>}
      <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-100">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Fecha</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Categoría</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Monto en $</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Monto USD</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={COLS} className="py-12 text-center text-sm text-slate-400">{vacioMensaje}</td>
                </tr>
              ) : items.map(item => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap tabular-nums text-xs">{item.fecha}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs whitespace-nowrap">{item.categoria}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-800 font-medium text-xs whitespace-nowrap">
                    {item.monto_ars != null ? `$ ${item.monto_ars.toLocaleString('es-AR')}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 text-xs whitespace-nowrap">{formatUSD(item.monto_usd)}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs max-w-xs truncate">{item.detalle || '—'}</td>
                </tr>
              ))}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                  <td className="px-4 py-2.5 text-slate-700 text-xs" colSpan={2}>Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-800 text-xs whitespace-nowrap">$ {totalPesos.toLocaleString('es-AR')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-800 text-xs whitespace-nowrap">{formatUSD(total)}</td>
                  <td className="px-4 py-2.5"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
