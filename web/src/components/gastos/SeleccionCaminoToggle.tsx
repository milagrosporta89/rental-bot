export type Camino = 'manual' | 'comprobante' | ''

interface Props {
  camino: Camino
  onSelect: (camino: Camino) => void
}

export function SeleccionCaminoToggle({ camino, onSelect }: Props) {
  const opciones: { value: Camino; label: string }[] = [
    { value: 'manual', label: 'Carga manual' },
    { value: 'comprobante', label: 'Subir comprobante' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {opciones.map(o => (
        <button
          key={o.value}
          onClick={() => onSelect(o.value)}
          className={`rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors cursor-pointer ${
            camino === o.value
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
