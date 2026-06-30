import type { Moneda } from '@/lib/utils'

interface Props {
  value: Moneda
  onChange: (m: Moneda) => void
}

export function MonedaToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 p-0.5 bg-slate-50 shrink-0">
      {(['USD', 'ARS'] as const).map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
            value === m ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  )
}
