import { AlertTriangle } from 'lucide-react'
import { CATEGORIA_GASTO_LABEL, CategoriaGasto } from '@/lib/types'
import type { GastoDuplicado } from '@/app/actions/gastos'

interface Props {
  gastoExistente: GastoDuplicado
}

// Advertencia inline dentro de la misma pantalla de carga (no una pantalla aparte):
// navegar a otra pantalla para avisar un duplicado es un paso de más. El botón de
// quitar el comprobante ya está arriba, en el propio ComprobanteDropzone.
export function DuplicadoBloqueo({ gastoExistente }: Props) {
  const catLabel = CATEGORIA_GASTO_LABEL[gastoExistente.categoria as CategoriaGasto] ?? gastoExistente.categoria

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2.5">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-xs text-amber-700">
        Este comprobante ya fue registrado: {gastoExistente.fecha} · {catLabel} · {gastoExistente.monto} · pagado por {gastoExistente.pagado_por}.
        Quitá el archivo (×) arriba para subir otro.
      </p>
    </div>
  )
}
