import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PantallaExito({ onContinuar }: { onContinuar: () => void }) {
  return (
    <div className="flex flex-col items-center text-center py-10 gap-3">
      <CheckCircle2 className="w-12 h-12 text-emerald-500" />
      <p className="text-base font-semibold text-slate-800">Gasto registrado correctamente</p>
      <p className="text-sm text-slate-400">Ya figura en la tabla de gastos.</p>
      <Button onClick={onContinuar} className="cursor-pointer mt-3">
        Continuar
      </Button>
    </div>
  )
}
