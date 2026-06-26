import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CategoriaSelect } from './CategoriaSelect'
import { PagadoPorSelect } from './PagadoPorSelect'
import type { Camino } from './SeleccionCaminoToggle'

export interface GastoFormState {
  categoria: string
  categoriaOtro: string
  monto: string
  moneda: 'ARS' | 'USD'
  fecha: string // YYYY-MM-DD (input date)
  pagadoPor: string
  pagadoPorOtro: string
  nombre_destinatario: string
  banco_origen: string
  nro_operacion: string
  detalle: string
}

interface Props {
  camino: Camino
  form: GastoFormState
  fromComprobante: boolean
  ro: (field: keyof GastoFormState) => boolean
  onChange: (k: keyof GastoFormState, v: string) => void
  onSubmit: () => void
  error?: string
}

export function FormularioGasto({ camino, form, fromComprobante, ro, onChange, onSubmit, error }: Props) {
  // pagado_por queda readonly solo si vino inferido del comprobante (no se infiere todavía vía OCR de gastos,
  // así que por ahora siempre es editable en el camino de comprobante)
  // TODO: confirmar con Mili — el OCR hoy no infiere pagado_por; cuando lo haga, pasar ro('pagadoPor') a PagadoPorSelect
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4">
      <div className="col-span-2">
        <CategoriaSelect
          value={form.categoria}
          otroValue={form.categoriaOtro}
          onChange={v => onChange('categoria', v)}
          onChangeOtro={v => onChange('categoriaOtro', v)}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Monto *</Label>
        <Input
          type="number" min={0} step={0.01}
          value={form.monto}
          readOnly={ro('monto')}
          onChange={e => !ro('monto') && onChange('monto', e.target.value)}
          className={`text-sm ${ro('monto') ? 'bg-slate-50 text-slate-500 cursor-default' : ''}`}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Moneda *</Label>
        <Select value={form.moneda} disabled={ro('moneda')} onValueChange={v => onChange('moneda', v)}>
          <SelectTrigger className={`text-sm ${ro('moneda') ? 'bg-slate-50 text-slate-500' : ''}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ARS">Pesos (ARS)</SelectItem>
            <SelectItem value="USD">Dólares (USD)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Fecha *</Label>
        <Input
          type="date"
          value={form.fecha}
          onChange={e => onChange('fecha', e.target.value)}
          className="text-sm"
        />
      </div>

      <PagadoPorSelect
        value={form.pagadoPor}
        otroValue={form.pagadoPorOtro}
        onChange={v => onChange('pagadoPor', v)}
        onChangeOtro={v => onChange('pagadoPorOtro', v)}
      />

      {(camino === 'comprobante' || fromComprobante) && (
        <>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Destinatario</Label>
            <Input value={form.nombre_destinatario} readOnly className="text-sm bg-slate-50 text-slate-500 cursor-default" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Banco origen</Label>
            <Input value={form.banco_origen} readOnly className="text-sm bg-slate-50 text-slate-500 cursor-default" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">N° operación</Label>
            <Input value={form.nro_operacion} readOnly className="text-sm bg-slate-50 text-slate-500 cursor-default" />
          </div>
        </>
      )}

      <div className="col-span-2 space-y-1">
        <Label className="text-xs text-slate-500">Detalle</Label>
        <Input value={form.detalle} onChange={e => onChange('detalle', e.target.value)} className="text-sm" />
      </div>

      {error && <p className="col-span-2 text-xs text-red-500">{error}</p>}

      <div className="col-span-2 flex justify-end">
        <Button size="sm" onClick={onSubmit} className="cursor-pointer">
          Continuar
        </Button>
      </div>
    </div>
  )
}
