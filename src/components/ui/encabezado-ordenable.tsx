'use client'

import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'

interface Props<T extends string> {
  label: string
  by: T
  sortBy: T
  sortDir: 'asc' | 'desc'
  onSort: (by: T) => void
  align?: 'left' | 'right'
}

export function EncabezadoOrdenable<T extends string>({ label, by, sortBy, sortDir, onSort, align = 'left' }: Props<T>) {
  return (
    <th className={`px-4 py-2.5 text-xs font-semibold text-slate-600 whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => onSort(by)}
        aria-label={`Ordenar por ${label.toLowerCase()}, ${sortBy === by && sortDir === 'asc' ? 'descendente' : 'ascendente'}`}
        className={`flex items-center gap-1 -mx-1 px-1 rounded hover:text-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${align === 'right' ? 'ml-auto flex-row-reverse' : ''}`}
      >
        {label}
        {sortBy === by
          ? (sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-slate-800" strokeWidth={2.5} /> : <ArrowDown className="w-3.5 h-3.5 text-slate-800" strokeWidth={2.5} />)
          : <ChevronsUpDown className="w-3 h-3 text-slate-400" />}
      </button>
    </th>
  )
}
