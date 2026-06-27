import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CategoriaSelect } from './CategoriaSelect'
import { PagadoPorSelect } from './PagadoPorSelect'

export interface GastoFormState {
  categoria: string
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
  form: GastoFormState
  fromComprobante: boolean
  ro: (field: keyof GastoFormState) => boolean
  onChange: (k: keyof GastoFormState, v: string) => void
  onSubmit: () => void
  onVolver?: () => void
  error?: string
}

export function FormularioGasto({ form, fromComprobante, ro, onChange, onSubmit, onVolver, error }: Props) {
  // pagado_por queda readonly solo si vino inferido del comprobante (no se infiere todavía vía OCR de gastos,
  // así que por ahora siempre es editable en el camino de comprobante)
  // TODO: confirmar con Mili — el OCR hoy no infiere pagado_por; cuando lo haga, pasar ro('pagadoPor') a PagadoPorSelect
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-4">
      <div className="col-span-1 md:col-span-2">
        <CategoriaSelect
          value={form.categoria}
          onChange={v => onChange('categoria', v)}
        />
      </div>

      <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-x-3 gap-y-4 md:contents">
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Monto *</Label>
          <div className={`flex h-9 items-center rounded-md border border-input bg-background px-3 gap-1.5 ${ro('monto') ? 'opacity-60' : 'focus-within:ring-1 focus-within:ring-ring'}`}>
            <span className="text-sm text-slate-600 shrink-0 select-none">
              {form.moneda === 'USD' ? 'USD' : '$'}
            </span>
            <input
              type="number" min={0} step={0.01}
              value={form.monto}
              readOnly={ro('monto')}
              onChange={e => !ro('monto') && onChange('monto', e.target.value)}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
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
      </div>

      <div className="col-span-1 space-y-1">
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

      {fromComprobante && (
        <>
          <div className="col-span-1 space-y-1">
            <Label className="text-xs text-slate-500">Destinatario</Label>
            <Input value={form.nombre_destinatario} readOnly className="text-sm bg-slate-50 text-slate-500 cursor-default" />
          </div>
          <div className="col-span-1 space-y-1">
            <Label className="text-xs text-slate-500">Banco origen</Label>
            <Input value={form.banco_origen} readOnly className="text-sm bg-slate-50 text-slate-500 cursor-default" />
          </div>
          <div className="col-span-1 space-y-1">
            <Label className="text-xs text-slate-500">N° operación</Label>
            <Input value={form.nro_operacion} readOnly className="text-sm bg-slate-50 text-slate-500 cursor-default" />
          </div>
        </>
      )}

      <div className="col-span-1 md:col-span-2 space-y-1">
        <Label className="text-xs text-slate-500">Detalle</Label>
        <Input value={form.detalle} onChange={e => onChange('detalle', e.target.value)} className="text-sm" />
      </div>

      {error && <p className="col-span-1 md:col-span-2 text-xs text-red-500">{error}</p>}

      <div className={`col-span-1 md:col-span-2 flex ${onVolver ? 'justify-between' : 'justify-end'}`}>
        {onVolver && (
          <Button size="sm" variant="outline" onClick={onVolver} className="cursor-pointer">
            Volver
          </Button>
        )}
        <Button size="sm" onClick={onSubmit} className="cursor-pointer">
          Continuar
        </Button>
      </div>
    </div>
  )
}
