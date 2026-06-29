import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SENTIDO_MOVIMIENTO_LABEL, SentidoMovimiento, TIPO_MOVIMIENTO_LABEL, TipoMovimientoInterno, TITULARES_PAGADOR } from '@/lib/types'

export interface MovimientoFormState {
  fecha: string // YYYY-MM-DD
  monto: string
  moneda: 'ARS' | 'USD'
  cotizacion: string
  sentido: SentidoMovimiento | ''
  tipo: TipoMovimientoInterno | ''
  cuentaOrigen: string
  detalle: string
}

// caja_chica tiene su propio flujo dedicado (US-06, "Marcar como caja chica") — no se ofrece
// como opción manual acá para no duplicar el camino.
const TIPOS_SELECCIONABLES: TipoMovimientoInterno[] = ['cierre_comision', 'reembolso_gastos', 'ajuste_libre']

interface Props {
  form: MovimientoFormState
  onChange: (k: keyof MovimientoFormState, v: string) => void
  error?: string
}

export function FormularioMovimientoInterno({ form, onChange, error }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2 md:gap-y-4">
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Fecha *</Label>
        <Input type="date" value={form.fecha} onChange={e => onChange('fecha', e.target.value)} className="text-sm" />
      </div>

      <div className="space-y-1 md:col-span-2">
        <Label className="text-xs text-slate-500">Concepto *</Label>
        <Select value={form.tipo} onValueChange={v => onChange('tipo', v)}>
          <SelectTrigger className="text-sm"><SelectValue placeholder="¿Qué representa este movimiento?" /></SelectTrigger>
          <SelectContent>
            {TIPOS_SELECCIONABLES.map(t => <SelectItem key={t} value={t}>{TIPO_MOVIMIENTO_LABEL[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Sentido *</Label>
        <Select value={form.sentido} onValueChange={v => onChange('sentido', v)}>
          <SelectTrigger className="text-sm"><SelectValue placeholder="Elegí el sentido" /></SelectTrigger>
          <SelectContent>
            {(Object.entries(SENTIDO_MOVIMIENTO_LABEL) as [SentidoMovimiento, string][]).map(([v, label]) => (
              <SelectItem key={v} value={v}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Cuenta de origen/destino *</Label>
        <Select value={form.cuentaOrigen} onValueChange={v => onChange('cuentaOrigen', v)}>
          <SelectTrigger className="text-sm"><SelectValue placeholder="¿De/para qué cuenta?" /></SelectTrigger>
          <SelectContent>
            {TITULARES_PAGADOR.filter(t => t !== 'Paola').map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Monto *</Label>
        <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 gap-1.5 focus-within:ring-1 focus-within:ring-ring">
          <span className="text-sm text-slate-600 shrink-0 select-none">{form.moneda === 'USD' ? 'USD' : '$'}</span>
          <input
            type="number" min={0} step={0.01}
            value={form.monto}
            onChange={e => onChange('monto', e.target.value)}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Moneda *</Label>
        <Select value={form.moneda} onValueChange={v => onChange('moneda', v)}>
          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ARS">Pesos (ARS)</SelectItem>
            <SelectItem value="USD">Dólares (USD)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Cotización ARS/USD *</Label>
        <Input type="number" min={0} value={form.cotizacion} onChange={e => onChange('cotizacion', e.target.value)} className="text-sm" />
      </div>

      <div className="space-y-1 md:col-span-2">
        <Label className="text-xs text-slate-500">Detalle</Label>
        <Input value={form.detalle} onChange={e => onChange('detalle', e.target.value)} className="text-sm" />
      </div>

      {/* TODO: confirmar con Mili si hace falta subir comprobante acá — el campo comprobante_url
          existe en la tabla, pero /api/comprobante hoy solo sirve para ingresos/gastos con OCR,
          no para un ajuste manual sin comprobante de transferencia bancaria típico. */}

      {error && <p className="md:col-span-2 text-xs text-red-500">{error}</p>}
    </div>
  )
}
