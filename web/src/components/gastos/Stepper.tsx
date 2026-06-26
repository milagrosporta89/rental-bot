import { Check } from 'lucide-react'

const PASOS = [
  { n: 1, label: 'Carga' },
  { n: 2, label: 'Confirmación' },
  { n: 3, label: 'Listo' },
]

export function Stepper({ actual }: { actual: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center">
      {PASOS.map((p, i) => (
        <div key={p.n} className="flex items-center flex-1 last:flex-none">
          <div className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                p.n < actual ? 'bg-indigo-600 text-white'
                : p.n === actual ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-400'
              }`}
            >
              {p.n < actual ? <Check className="w-3.5 h-3.5" /> : p.n}
            </div>
            <span className={`text-xs font-medium whitespace-nowrap ${p.n === actual ? 'text-slate-800' : 'text-slate-400'}`}>
              {p.label}
            </span>
          </div>
          {i < PASOS.length - 1 && <div className="flex-1 h-px bg-slate-200 mx-3" />}
        </div>
      ))}
    </div>
  )
}
