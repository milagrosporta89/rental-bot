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

// Mismo lenguaje visual que el comprobante de pago de ingresos (web/src/lib/recibo.ts):
// filas de label/valor alineadas en la misma línea, sin logo ni generación de imagen —
// esto vive directo en la pantalla, no hace falta exportarlo a JPG.
export function ConfirmacionGasto({ resumen, onVolver, onConfirmar, loading, error }: Props) {
  const catLabel = CATEGORIA_GASTO_LABEL[resumen.categoria as CategoriaGasto] ?? resumen.categoria
  const tieneComprobante = Boolean(resumen.nro_operacion || resumen.comprobante_url)

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 text-center">
          <p className="text-sm font-semibold text-slate-800">Confirmar gasto</p>
          <p className="text-xs text-slate-400 mt-0.5">Revisá los datos antes de guardar</p>
        </div>
        <div className="px-5 py-2">
          <Fila label="Categoría" valor={catLabel} />
          <Fila label="Monto" valor={`${resumen.moneda} ${resumen.monto.toLocaleString('es-AR')}`} />
          <Fila label="Fecha" valor={resumen.fecha} />
          <Fila label="Pagado por" valor={resumen.pagadoPor} />
          {resumen.detalle && <Fila label="Detalle" valor={resumen.detalle} />}
          {tieneComprobante && (
            <>
              <Fila label="Destinatario" valor={resumen.nombre_destinatario || '—'} />
              <Fila label="Banco origen" valor={resumen.banco_origen || '—'} />
              <Fila label="N° operación" valor={resumen.nro_operacion || '—'} />
              {resumen.comprobante_url && (
                <Fila
                  label="Comprobante"
                  valor={<a href={resumen.comprobante_url} target="_blank" rel="noopener noreferrer" className="underline">Ver archivo</a>}
                  ultima
                />
              )}
            </>
          )}
        </div>
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

function Fila({ label, valor, ultima }: { label: string; valor: ReactNode; ultima?: boolean }) {
  return (
    <div className={`flex justify-between items-baseline gap-3 py-2.5 ${ultima ? '' : 'border-b border-slate-50'}`}>
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-semibold text-slate-800 text-right">{valor}</span>
    </div>
  )
}
