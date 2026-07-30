'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MESES_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

interface Props {
  label: string
  currentYear: number
  minYear: number
  maxYear: number
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  isMonthEnabled: (year: number, monthIndex0: number) => boolean
  isMonthActive: (year: number, monthIndex0: number) => boolean
  onSelectMonth: (year: number, monthIndex0: number) => void
}

export function MesPicker({
  label, currentYear, minYear, maxYear, canPrev, canNext, onPrev, onNext,
  isMonthEnabled, isMonthActive, onSelectMonth,
}: Props) {
  const [open, setOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(currentYear)

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="Mes anterior"
        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div className="relative">
        <button
          onClick={() => { setOpen(o => !o); setPickerYear(currentYear) }}
          className="text-sm font-medium text-slate-700 min-w-[130px] text-center px-2 py-1 rounded hover:bg-slate-100 cursor-pointer"
        >
          {label}
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-50 w-52">
              <div className="flex items-center justify-between mb-2 px-1">
                <button
                  onClick={() => setPickerYear(y => y - 1)}
                  disabled={pickerYear <= minYear}
                  aria-label="Año anterior"
                  className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-sm font-medium text-slate-700">{pickerYear}</span>
                <button
                  onClick={() => setPickerYear(y => y + 1)}
                  disabled={pickerYear >= maxYear}
                  aria-label="Año siguiente"
                  className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {MESES_ABBR.map((m, i) => {
                  const habilitado = isMonthEnabled(pickerYear, i)
                  const active = isMonthActive(pickerYear, i)
                  return (
                    <button
                      key={m}
                      disabled={!habilitado}
                      onClick={() => { onSelectMonth(pickerYear, i); setOpen(false) }}
                      className={`text-xs py-1.5 rounded-lg cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${active ? 'bg-indigo-600 text-white font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      {m}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <button
        onClick={onNext}
        disabled={!canNext}
        aria-label="Mes siguiente"
        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
