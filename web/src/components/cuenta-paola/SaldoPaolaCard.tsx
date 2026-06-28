import { formatUSD } from '@/lib/utils'

export function SaldoPaolaCard({ saldo }: { saldo: number }) {
  const aFavorDePaola = saldo >= 0

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-400 mb-1">Saldo de caja de Paola</p>
      <p className={`text-2xl font-semibold tabular-nums ${aFavorDePaola ? 'text-emerald-600' : 'text-amber-600'}`}>
        {formatUSD(Math.abs(saldo))}
      </p>
      <p className="text-xs text-slate-500 mt-1">
        {aFavorDePaola ? '✅ A favor de Paola' : '⚠️ El negocio le debe'}
      </p>
    </div>
  )
}
