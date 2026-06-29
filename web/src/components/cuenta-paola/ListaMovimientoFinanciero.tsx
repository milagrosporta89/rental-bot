import { formatUSD } from '@/lib/utils'

export interface ItemMovimientoFinanciero {
  id: string
  fecha: string
  monto: number
  monto_usd: number | null
  moneda: string
  detalle: string | null
}

interface Props {
  titulo?: string
  items: ItemMovimientoFinanciero[]
  vacioMensaje: string
}

export function ListaMovimientoFinanciero({ titulo, items, vacioMensaje }: Props) {
  return (
    <div>
      {titulo && <h2 className="text-sm font-medium text-slate-700 mb-2">{titulo}</h2>}
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">{vacioMensaje}</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {items.map(item => (
            <div key={item.id} className="py-3 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-700 tabular-nums">
                    {item.moneda} {item.monto?.toLocaleString('es-AR')}
                  </span>
                  {item.monto_usd != null && (
                    <>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-500 tabular-nums">{formatUSD(item.monto_usd)}</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {item.fecha}{item.detalle ? ` · ${item.detalle}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
