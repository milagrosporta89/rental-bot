import { formatUSD } from '@/lib/utils'

export function SaldoPaolaCard({ saldo }: { saldo: number }) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-400 mb-1">Pendiente de saldar con Paola</p>
      <p className={`text-2xl font-semibold tabular-nums ${saldo > 0 ? 'text-amber-600' : saldo < 0 ? 'text-indigo-600' : 'text-emerald-600'}`}>
        {formatUSD(Math.abs(saldo))}
      </p>
      <p className="text-xs text-slate-500 mt-1">
        {saldo > 0 ? '⚠️ El negocio le debe a Paola' : saldo < 0 ? '📌 Paola le debe al negocio' : '✅ Todo saldado'}
      </p>
    </div>
  )
}
