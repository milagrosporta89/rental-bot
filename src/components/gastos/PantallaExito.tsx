import { CheckCircle2 } from 'lucide-react'

interface Props {
  mensaje?: string
}

export function PantallaExito({ mensaje = 'Gasto registrado correctamente' }: Props) {
  return (
    <div className="flex flex-col items-center text-center py-10 gap-3">
      <CheckCircle2 className="w-12 h-12 text-emerald-500" />
      <p className="text-base font-semibold text-slate-800">{mensaje}</p>
      <p className="text-sm text-slate-400">Ya figura en la tabla de gastos.</p>
    </div>
  )
}
