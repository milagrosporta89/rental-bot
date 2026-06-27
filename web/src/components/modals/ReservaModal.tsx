'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar, CreditCard, Info } from 'lucide-react'
import { Reserva, EstadoPago, EstadoReserva, Plataforma, CASA_LABELS } from '@/lib/types'
import { parse, addDays, format, isValid } from 'date-fns'
import { toISO, toDDMMYYYY, calcularNoches, solapan } from '@/lib/dates'
import { crearReserva, editarReserva, editarEstadoReserva } from '@/app/actions/reservas'

interface BaseProps {
  reservas: Reserva[]
  onClose: () => void
  onSaved: () => void
  onRefresh?: () => void
}

type Props = BaseProps & (
  | { mode: 'create'; casa: string; fechaEntrada: string; fechaSalida: string }
  | { mode: 'edit'; reserva: Reserva }
  | { mode: 'view'; reserva: Reserva }
)

interface Form {
  casa: string
  estado_reserva: EstadoReserva
  nombre_pax: string
  fecha_entrada: string
  fecha_salida: string
  cantidad_pax: string
  telefono: string
  monto_total_usd: string
  estado_pago: EstadoPago
  plataforma: Plataforma
  notas: string
}

function formFromReserva(r: Reserva): Form {
  return {
    casa: r.casa,
    estado_reserva: r.estado_reserva ?? 'confirmada',
    nombre_pax: r.nombre_pax,
    fecha_entrada: r.fecha_entrada,
    fecha_salida: r.fecha_salida,
    cantidad_pax: String(r.cantidad_pax),
    telefono: r.telefono ?? '',
    monto_total_usd: String(r.monto_total_usd),
    estado_pago: r.estado_pago,
    plataforma: r.plataforma,
    notas: r.notas ?? '',
  }
}

function emptyForm(casa: string, entrada: string, salida: string): Form {
  return {
    casa,
    estado_reserva: 'tentativa',
    nombre_pax: '',
    fecha_entrada: entrada,
    fecha_salida: salida,
    cantidad_pax: '',
    telefono: '',
    monto_total_usd: '',
    estado_pago: 'debe',
    plataforma: 'directo',
    notas: '',
  }
}

export function ReservaModal(props: Props) {
  const { mode, reservas, onClose, onSaved, onRefresh } = props
  const router = useRouter()
  const readonly = mode === 'view'
  const reservaId = (mode === 'edit' || mode === 'view') ? props.reserva.id : null
  const [form, setForm] = useState<Form>(
    mode === 'edit' || mode === 'view'
      ? formFromReserva(props.reserva)
      : emptyForm(props.casa, props.fechaEntrada, props.fechaSalida)
  )
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingCancelacion, setPendingCancelacion] = useState(false)
  const checkinRef = useRef<HTMLInputElement>(null)
  const checkoutRef = useRef<HTMLInputElement>(null)

  const noches = calcularNoches(form.fecha_entrada, form.fecha_salida)
  const isAirbnb = form.plataforma === 'airbnb'

  const minCheckout = (() => {
    const d = parse(form.fecha_entrada, 'dd/MM/yyyy', new Date())
    if (!isValid(d)) return ''
    return format(addDays(d, 1), 'yyyy-MM-dd')
  })()

  const maxCheckout = (() => {
    const entradaD = parse(form.fecha_entrada, 'dd/MM/yyyy', new Date())
    if (!isValid(entradaD)) return ''
    const casaNum = form.casa.replace(/\D/g, '')
    const editId = mode === 'edit' ? props.reserva.id : null
    let min: Date | null = null
    for (const r of reservas) {
      if (r.id === editId || r.estado_reserva === 'cancelada') continue
      if (r.casa.replace(/\D/g, '') !== casaNum) continue
      const rEntrada = parse(r.fecha_entrada, 'dd/MM/yyyy', new Date())
      if (!isValid(rEntrada) || rEntrada <= entradaD) continue
      if (!min || rEntrada < min) min = rEntrada
    }
    return min ? format(min, 'yyyy-MM-dd') : ''
  })()

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }))
    setError('')
  }

  function verificarSolapamiento(): string | null {
    const candidateId = mode === 'edit' ? props.reserva.id : null
    const solapante = reservas.find((r) => {
      if (r.id === candidateId) return false
      if (r.casa !== form.casa) return false
      if (r.estado_reserva === 'cancelada') return false
      return solapan(
        { desde: form.fecha_entrada, hasta: form.fecha_salida },
        { desde: r.fecha_entrada, hasta: r.fecha_salida }
      )
    })
    if (solapante) return `Solapa con ${solapante.nombre_pax} (${solapante.fecha_entrada} – ${solapante.fecha_salida})`
    return null
  }

  async function handleSubmit() {
    if (!form.nombre_pax.trim()) return setError('El nombre del huésped es obligatorio.')
    if (!form.fecha_entrada || !form.fecha_salida) return setError('Las fechas son obligatorias.')
    if (noches <= 0) return setError('La fecha de salida debe ser posterior a la entrada.')
    if (!form.cantidad_pax || parseInt(form.cantidad_pax) < 1) return setError('El número de huéspedes es obligatorio.')
    if (form.monto_total_usd === '') return setError('El monto total es obligatorio.')
    if (!(parseFloat(form.monto_total_usd) > 0)) return setError('El monto total debe ser mayor a cero.')
    const solapaMsg = verificarSolapamiento()
    if (solapaMsg) return setError(solapaMsg)

    setLoading(true)
    try {
      const montoTotal = parseFloat(form.monto_total_usd) || 0
      // Edición: descontamos lo que ya se pagó (monto - saldo de la reserva original), no reseteamos a "debe todo"
      const yaPagado = mode === 'edit' ? props.reserva.monto_total_usd - props.reserva.saldo_usd : 0
      // Cancelada: no queda nada por cobrar, sea lo que sea que se haya pagado
      const saldo = form.estado_reserva === 'cancelada' ? 0 : montoTotal - yaPagado

      const payload = {
        casa: form.casa,
        estado_reserva: form.estado_reserva,
        titular: '',
        nombre_pax: form.nombre_pax.trim(),
        fecha_entrada: form.fecha_entrada,
        fecha_salida: form.fecha_salida,
        cantidad_pax: parseInt(form.cantidad_pax) || 1,
        cantidad_noches: noches,
        telefono: form.telefono.trim() || null,
        monto_total_usd: montoTotal,
        saldo_usd: saldo,
        cotizacion: 0,
        estado_pago: form.estado_pago,
        plataforma: form.plataforma,
        notas: form.notas.trim() || null,
      }
      mode === 'create'
        ? await crearReserva(payload)
        : await editarReserva(props.reserva.id, payload, props.reserva as unknown as Record<string, unknown>)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="pb-1">
          <DialogTitle className="text-lg font-semibold text-slate-800">
            {mode === 'view' ? (
              <>
                {props.reserva.nombre_pax}
                <span className="text-slate-400 font-normal mx-2">·</span>
                <span className="text-slate-500 font-normal">{CASA_LABELS[props.reserva.casa.replace(/\D/g, '')] ?? props.reserva.casa}</span>
                <span className="text-slate-400 font-normal mx-2">·</span>
                <span className="text-slate-500 font-normal text-base">#{props.reserva.id.replace(/^[A-Z]+-?/, '')}</span>
              </>
            ) : (
              <>
                Casa {form.casa.replace(/\D/g, '') || form.casa}
                {noches > 0 && <span className="font-normal text-slate-400 text-sm ml-2">· {noches} {noches === 1 ? 'noche' : 'noches'}</span>}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-x-3 gap-y-3 pt-1">

          <div className="col-span-1 md:col-span-4 grid grid-cols-2 gap-x-3 gap-y-3 md:contents">
            <div className="md:col-span-2 space-y-1">
              <Label className="text-xs text-slate-500">Check-in {!readonly && '*'}</Label>
              <div
                className={`flex h-9 items-center rounded-md border border-input bg-background px-3 gap-2 ${readonly ? 'opacity-60' : 'cursor-pointer focus-within:ring-1 focus-within:ring-ring'}`}
                onClick={() => !readonly && checkinRef.current?.showPicker()}
              >
                <input
                  ref={checkinRef}
                  type="date"
                  value={toISO(form.fecha_entrada)}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  disabled={readonly}
                  onChange={(e) => {
                    const nuevaEntrada = toDDMMYYYY(e.target.value)
                    const entradaD = parse(nuevaEntrada, 'dd/MM/yyyy', new Date())
                    const salidaD = parse(form.fecha_salida, 'dd/MM/yyyy', new Date())
                    setForm((f) => ({
                      ...f,
                      fecha_entrada: nuevaEntrada,
                      fecha_salida: isValid(salidaD) && salidaD <= entradaD
                        ? format(addDays(entradaD, 1), 'dd/MM/yyyy')
                        : f.fecha_salida,
                    }))
                    setError('')
                  }}
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm [&::-webkit-calendar-picker-indicator]:hidden disabled:cursor-default"
                />
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </div>
            </div>

            <div className="md:col-span-2 space-y-1">
              <Label className="text-xs text-slate-500">Check-out {!readonly && '*'}</Label>
              <div
                className={`flex h-9 items-center rounded-md border border-input bg-background px-3 gap-2 ${readonly ? 'opacity-60' : 'cursor-pointer focus-within:ring-1 focus-within:ring-ring'}`}
                onClick={() => {
                  if (!readonly && checkoutRef.current) {
                    checkoutRef.current.min = minCheckout
                    checkoutRef.current.showPicker()
                  }
                }}
              >
                <input
                  ref={checkoutRef}
                  type="date"
                  value={toISO(form.fecha_salida)}
                  min={minCheckout}
                  max={maxCheckout || undefined}
                  disabled={readonly}
                  onChange={(e) => set('fecha_salida', toDDMMYYYY(e.target.value))}
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm [&::-webkit-calendar-picker-indicator]:hidden disabled:cursor-default"
                />
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </div>
            </div>
          </div>

          <div className="col-span-1 md:col-span-3 space-y-1">
            <Label className="text-xs text-slate-500">Nombre completo {!readonly && '*'}</Label>
            <Input value={form.nombre_pax} disabled={readonly} onChange={(e) => set('nombre_pax', e.target.value)} className="text-sm" />
          </div>

          <div className="col-span-1 md:col-span-1 space-y-1">
            <Label className="text-xs text-slate-500">Huéspedes</Label>
            <Input type="number" min={1} max={8} value={form.cantidad_pax} disabled={readonly} onChange={(e) => set('cantidad_pax', e.target.value)} className="text-sm" />
          </div>

          <div className="col-span-1 md:col-span-4 space-y-1">
            <Label className="text-xs text-slate-500">Teléfono</Label>
            <Input type="tel" value={form.telefono} disabled={readonly} onChange={(e) => set('telefono', e.target.value.replace(/[^0-9+\-\s()]/g, ''))} className="text-sm" />
          </div>

          <div className="col-span-1 md:col-span-4 grid grid-cols-2 gap-x-3 gap-y-3 md:contents">
            <div className="md:col-span-2 space-y-1">
              <Label className="text-xs text-slate-500">Monto total</Label>
              <div className={`flex h-9 items-center rounded-md border border-input bg-background px-3 gap-1.5 ${readonly ? 'opacity-60' : 'focus-within:ring-1 focus-within:ring-ring'}`}>
                <span className="text-sm text-slate-600 shrink-0 select-none">USD</span>
                <input
                  type="number" min={0} step={0.01}
                  value={form.monto_total_usd}
                  disabled={readonly}
                  onChange={(e) => set('monto_total_usd', e.target.value)}
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:cursor-default"
                />
              </div>
            </div>

            {mode === 'create' ? (
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Precio promedio/noche</Label>
                <div className="flex h-9 items-center rounded-md border border-input bg-slate-50 px-3 text-sm text-slate-500">
                  USD {noches > 0 && form.monto_total_usd !== '' ? (parseFloat(form.monto_total_usd) / noches).toFixed(2) : '—'}
                </div>
              </div>
            ) : (
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Estado de pago</Label>
                <Select value={form.estado_pago} disabled={readonly} onValueChange={(v) => set('estado_pago', v as EstadoPago)}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debe">Sin pago</SelectItem>
                    <SelectItem value="parcial">Seña</SelectItem>
                    <SelectItem value="pagado">Pagado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="col-span-1 md:col-span-4 grid grid-cols-2 gap-x-3 gap-y-3 md:contents">
            <div className="md:col-span-2 space-y-1">
              <Label className="text-xs text-slate-500">Plataforma</Label>
              <Select
                value={form.plataforma}
                disabled={readonly}
                onValueChange={(v) => {
                  const nuevaPlataforma = v as Plataforma
                  setForm((f) => ({
                    ...f,
                    plataforma: nuevaPlataforma,
                    estado_reserva: nuevaPlataforma === 'airbnb' ? 'confirmada' : 'tentativa',
                  }))
                  setError('')
                }}
              >
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="directo">Directo</SelectItem>
                  <SelectItem value="airbnb">Airbnb</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2 space-y-1 group relative">
              <Label className="text-xs text-slate-500 flex items-center gap-1">
                Estado
                {form.estado_reserva === 'tentativa' && (
                  <Info className="w-3 h-3 text-slate-400 cursor-help" />
                )}
              </Label>
              {form.estado_reserva === 'tentativa' && (
                <div className="invisible group-hover:visible absolute left-0 bottom-full mb-1.5 w-44 rounded-md bg-slate-800 px-2 py-1.5 text-[11px] leading-snug text-white z-20">
                  La reserva pasará a Confirmada cuando se asiente un pago.
                </div>
              )}
              {mode === 'create' ? (
                <Select value={form.estado_reserva} disabled>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tentativa">Tentativa</SelectItem>
                    <SelectItem value="confirmada">Confirmada</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={form.estado_reserva}
                  onValueChange={async (v) => {
                    const nuevo = v as EstadoReserva
                    set('estado_reserva', nuevo)
                    if (readonly && reservaId) {
                      if (nuevo === 'cancelada') {
                        setPendingCancelacion(true)
                      } else {
                        setPendingCancelacion(false)
                        await editarEstadoReserva(reservaId, nuevo)
                        onRefresh?.()
                      }
                    }
                  }}
                >
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {!isAirbnb && form.estado_reserva !== 'confirmada' && (
                      <SelectItem value="tentativa" disabled>Tentativa</SelectItem>
                    )}
                    {(isAirbnb || form.estado_reserva === 'confirmada') && (
                      <SelectItem value="confirmada">Confirmada</SelectItem>
                    )}
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="col-span-1 md:col-span-4 space-y-1">
            <Label className="text-xs text-slate-500">Notas</Label>
            <Textarea value={form.notas} disabled={readonly} onChange={(e) => set('notas', e.target.value)} rows={2} className="text-sm resize-none" />
          </div>
        </div>

        {!readonly && error && <p className="text-xs text-red-500 mt-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          {readonly ? (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-500 cursor-pointer">
                Cerrar
              </Button>
              {pendingCancelacion ? (
                <Button
                  size="sm"
                  disabled={loading}
                  className="cursor-pointer bg-rose-600 hover:bg-rose-700 text-white"
                  onClick={async () => {
                    if (!reservaId) return
                    setLoading(true)
                    try {
                      await editarEstadoReserva(reservaId, 'cancelada')
                      onSaved()
                    } finally {
                      setLoading(false)
                    }
                  }}
                >
                  Confirmar cancelación
                </Button>
              ) : form.estado_reserva !== 'cancelada' ? (
                <Button size="sm" className="cursor-pointer" onClick={() => { onClose(); router.push(`/reservas/${reservaId}/pago`) }}>
                  <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                  Asentar pago
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-500 cursor-pointer">
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={loading} className="cursor-pointer">
                {loading ? 'Guardando…' : mode === 'create' ? 'Crear' : 'Guardar'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
