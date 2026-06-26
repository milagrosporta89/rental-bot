'use client'

type View = 'month' | 'week'

export function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="flex items-center rounded-md border border-slate-200 overflow-hidden">
      {(['month', 'week'] as View[]).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1 text-xs transition-colors duration-150 cursor-pointer ${
            view === v
              ? 'bg-slate-100 text-slate-700 font-medium'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
          }`}
        >
          {v === 'month' ? 'Mes' : 'Semana'}
        </button>
      ))}
    </div>
  )
}
