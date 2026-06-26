import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CATEGORIA_GASTO_LABEL, CategoriaGasto } from '@/lib/types'

export interface ResumenGasto {
  categoria: string
  monto: number
  moneda: 'ARS' | 'USD'
  fecha: string // DD/MM/YYYY
  pagadoPor: string
  detalle: string
  nombre_destinatario: string
  banco_origen: string
  nro_operacion: string
  comprobante_url: string
}

interface Props {
  resumen: ResumenGasto
  onVolver: () => void
  onConfirmar: () => void
  loading: boolean
  error?: string
}

export function ConfirmacionGasto({ resumen, onVolver, onConfirmar, loading, error }: Props) {
  const catLabel = CATEGORIA_GASTO_LABEL[resumen.categoria as CategoriaGasto] ?? resumen.categoria
  const tieneComprobante = Boolean(resumen.nro_operacion || resumen.comprobante_url)

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 space-y-1.5 text-sm">
        <Fila label="Categoría" valor={catLabel} />
        <Fila label="Monto" valor={`${resumen.moneda} ${resumen.monto}`} />
        <Fila label="Fecha" valor={resumen.fecha} />
        <Fila label="Pagado por" valor={resumen.pagadoPor} />
        {resumen.detalle && <Fila label="Detalle" valor={resumen.detalle} />}
        {tieneComprobante && (
          <>
            <Fila label="Destinatario" valor={resumen.nombre_destinatario} />
            <Fila label="Banco origen" valor={resumen.banco_origen} />
            <Fila label="N° operación" valor={resumen.nro_operacion} />
            {resumen.comprobante_url && (
              <Fila
                label="Comprobante"
                valor={<a href={resumen.comprobante_url} target="_blank" rel="noopener noreferrer" className="underline">Ver archivo</a>}
              />
            )}
          </>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-between">
        <Button size="sm" variant="outline" onClick={onVolver} disabled={loading} className="cursor-pointer">
          Volver
        </Button>
        <Button size="sm" onClick={onConfirmar} disabled={loading} className="cursor-pointer">
          {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
          Confirmar gasto
        </Button>
      </div>
    </div>
  )
}

function Fila({ label, valor }: { label: string; valor: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-700 text-right">{valor}</span>
    </div>
  )
}
