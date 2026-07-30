import { formatMonto, type Moneda } from '@/lib/utils'

interface Props {
  titulo: string
  saldo: number
  saldoArs: number
  destacada?: boolean
  moneda: Moneda
}

export function SaldoPaolaCard({ titulo, saldo, saldoArs, destacada, moneda }: Props) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-400 mb-1">{titulo}</p>
      <p className={`${destacada ? 'text-2xl' : 'text-xl'} font-semibold tabular-nums ${saldo > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
        {formatMonto(Math.abs(saldo), Math.abs(saldoArs), moneda)}
      </p>
      <p className="text-xs text-slate-500 mt-1">
        {saldo > 0 ? '⚠️ El negocio le debe a Paola' : saldo < 0 ? '📌 Paola le debe al negocio' : '✅ Todo saldado'}
      </p>
    </div>
  )
}
