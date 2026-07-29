import { formatMonto, type Moneda } from '@/lib/utils'

interface DetalleItem {
  label: string
  monto: number
  montoArs: number
}

interface Props {
  titulo: string
  monto: number
  montoArs: number
  moneda: Moneda
  detalle?: DetalleItem[]
}

export function TotalCard({ titulo, monto, montoArs, moneda, detalle }: Props) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-400 mb-1">{titulo}</p>
      <p className="text-xl font-semibold tabular-nums text-slate-800">{formatMonto(monto, montoArs, moneda)}</p>
      {detalle && detalle.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-200 space-y-0.5">
          {detalle.map(d => (
            <p key={d.label} className="text-xs text-slate-500 flex justify-between gap-2">
              <span>{d.label}</span>
              <span className="tabular-nums">{formatMonto(d.monto, d.montoArs, moneda)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
