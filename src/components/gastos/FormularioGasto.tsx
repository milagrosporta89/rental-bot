'use client'

import { useRef } from 'react'
import { Calendar } from 'lucide-react'
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
  /** id de la reserva que originó este gasto (solo viene seteado desde el gatillo de comisión, US-04) */
  id_reserva: string
}

interface Props {
  form: GastoFormState
  fromComprobante: boolean
  ro: (field: keyof GastoFormState) => boolean
  onChange: (k: keyof GastoFormState, v: string) => void
  error?: string
}

export function FormularioGasto({ form, fromComprobante, ro, onChange, error }: Props) {
  // pagado_por queda readonly solo si vino inferido del comprobante (no se infiere todavía vía OCR de gastos,
  // así que por ahora siempre es editable en el camino de comprobante)
  // TODO: confirmar con Mili — el OCR hoy no infiere pagado_por; cuando lo haga, pasar ro('pagadoPor') a PagadoPorSelect
  const fechaRef = useRef<HTMLInputElement>(null)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2 md:gap-y-4">
      <div className="col-span-1 md:col-span-2">
        <CategoriaSelect
          value={form.categoria}
          onChange={v => onChange('categoria', v)}
        />
      </div>

      <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-x-3 gap-y-2 md:gap-y-4 md:contents">
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Monto *</Label>
          <div className={`flex h-10 items-center rounded-md border border-input bg-background px-3 gap-1.5 ${ro('monto') ? 'opacity-60' : 'focus-within:ring-1 focus-within:ring-ring'}`}>
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

      <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-x-3 gap-y-2 md:gap-y-4 md:contents">
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Fecha *</Label>
          <div
            className="flex h-10 items-center rounded-md border border-input bg-background px-3 gap-2 cursor-pointer focus-within:ring-1 focus-within:ring-ring"
            onClick={() => fechaRef.current?.showPicker()}
          >
            <input
              ref={fechaRef}
              type="date"
              value={form.fecha}
              onChange={e => onChange('fecha', e.target.value)}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm [&::-webkit-calendar-picker-indicator]:hidden"
            />
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </div>
        </div>

        <PagadoPorSelect
          value={form.pagadoPor}
          otroValue={form.pagadoPorOtro}
          onChange={v => onChange('pagadoPor', v)}
          onChangeOtro={v => onChange('pagadoPorOtro', v)}
        />
      </div>

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

      {/* Precargado desde el gatillo de comisión (US-04) — sin comprobante, así que va editable, no como el bloque readonly de arriba */}
      {!fromComprobante && form.nombre_destinatario && (
        <div className="col-span-1 md:col-span-2 space-y-1">
          <Label className="text-xs text-slate-500">Destinatario</Label>
          <Input value={form.nombre_destinatario} onChange={e => onChange('nombre_destinatario', e.target.value)} className="text-sm" />
        </div>
      )}

      <div className="col-span-1 md:col-span-2 space-y-1">
        <Label className="text-xs text-slate-500">Detalle</Label>
        <Input value={form.detalle} onChange={e => onChange('detalle', e.target.value)} className="text-sm" />
      </div>

      {form.id_reserva && (
        <p className="col-span-1 md:col-span-2 text-[11px] text-slate-400">
          Vinculado a la reserva #{form.id_reserva}.
        </p>
      )}

      {error && <p className="col-span-1 md:col-span-2 text-xs text-red-500">{error}</p>}
    </div>
  )
}
