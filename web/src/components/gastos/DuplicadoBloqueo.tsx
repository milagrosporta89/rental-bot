import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CATEGORIA_GASTO_LABEL, CategoriaGasto } from '@/lib/types'
import type { GastoDuplicado } from '@/app/actions/gastos'

interface Props {
  gastoExistente: GastoDuplicado
  onReintentar: () => void
}

export function DuplicadoBloqueo({ gastoExistente, onReintentar }: Props) {
  const catLabel = CATEGORIA_GASTO_LABEL[gastoExistente.categoria as CategoriaGasto] ?? gastoExistente.categoria

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-800">Este comprobante ya fue registrado</p>
        <p className="text-sm text-amber-700 mt-1">
          Ya existe un gasto con ese número de operación: {gastoExistente.fecha} · {catLabel} · {gastoExistente.monto} · pagado por {gastoExistente.pagado_por}.
        </p>
        <Button size="sm" variant="outline" onClick={onReintentar} className="mt-3 cursor-pointer">
          Subir otro comprobante
        </Button>
      </div>
    </div>
  )
}
