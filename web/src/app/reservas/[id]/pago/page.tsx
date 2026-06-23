'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toDDMMYYYY, toISO } from '@/lib/dates'
import { Reserva, CASA_LABELS } from '@/lib/types'
import { registrarPago } from '@/app/actions/ingresos'
import type { IngresoPayload } from '@/app/actions/ingresos'

interface FormState {
  monto: string
  moneda: 'ARS' | 'USD'
  cotizacion: string
  tipo_movimiento: 'adelanto' | 'saldo' | ''
  quien_pago: string
  fecha: string
  nombre_destinatario: string
  banco_destino: string
  nro_operacion: string
  detalle: string
}

export default function PagoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [reserva, setReserva] = useState<Reserva | null>(null)
  const [cargando, setCargando] = useState(true)

  const [form, setForm] = useState<FormState>({
    monto: '',
    moneda: 'ARS',
    cotizacion: '',
    tipo_movimiento: '',
    quien_pago: '',
    fecha: new Date().toISOString().slice(0, 10),
    nombre_destinatario: '',
    banco_destino: '',
    nro_operacion: '',
    detalle: '',
  })
  const [comprobanteUrl, setComprobanteUrl] = useState('')
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Cargar reserva
  useEffect(() => {
    fetch('/api/calendar-data')
      .then(r => r.json())
      .then(({ reservas }: { reservas: Reserva[] }) => {
        const found = reservas.find(r => r.id === id) ?? null
        setReserva(found)
        if (found) setForm(prev => ({ ...prev, quien_pago: found.nombre_pax }))
      })
      .finally(() => setCargando(false))
  }, [id])

  // Prefetch cotización
  useEffect(() => {
    if (form.cotizacion) return
    fetch('/api/cotizacion')
      .then(r => r.json())
      .then((d: { cotizacion: number }) => {
        if (d.cotizacion > 0) setForm(prev => ({ ...prev, cotizacion: String(Math.round(d.cotizacion)) }))
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function set(k: keyof FormState, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
    setError('')
  }

  const montoNum = parseFloat(form.monto) || 0
  const cotizNum = parseFloat(form.cotizacion) || 0
  const montoUSD = form.moneda === 'USD' ? montoNum : (cotizNum > 0 ? montoNum / cotizNum : 0)
  const montoARS = form.moneda === 'ARS' ? montoNum : montoNum * cotizNum
  const saldoRestante = Math.max(0, (reserva?.saldo_usd ?? 0) - montoUSD)

  async function handleFile(file: File) {
    setUploadState('uploading')
    setError('')
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/comprobante', { method: 'POST', body: fd })
      if (!res.ok) { setUploadState('error'); return }
      const { datos, url } = await res.json() as {
        datos: { fecha?: string; monto?: number; moneda?: string; nombreOrdenante?: string; nombreDestinatario?: string; bancoDestino?: string; nroOperacion?: string }
        url: string
      }
      setComprobanteUrl(url)
      setUploadState('done')
      setForm(prev => ({
        ...prev,
        monto: datos.monto ? String(datos.monto) : prev.monto,
        moneda: (datos.moneda === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
        quien_pago: datos.nombreOrdenante || prev.quien_pago,
        nombre_destinatario: datos.nombreDestinatario || prev.nombre_destinatario,
        banco_destino: datos.bancoDestino || prev.banco_destino,
        nro_operacion: datos.nroOperacion || prev.nro_operacion,
        fecha: datos.fecha ? toISO(datos.fecha) : prev.fecha,
      }))
    } catch {
      setUploadState('error')
    }
  }

  function removeComprobante() {
    setComprobanteUrl('')
    setUploadState('idle')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit() {
    if (!reserva) return
    if (!form.monto || montoNum <= 0) { setError('El monto es obligatorio.'); return }
    if (cotizNum <= 0) { setError('Ingresá la cotización del dólar.'); return }
    if (!form.tipo_movimiento) { setError('Elegí el tipo de movimiento.'); return }
    if (!form.quien_pago.trim()) { setError('Quién pagó es obligatorio.'); return }

    setLoading(true)
    try {
      const payload: IngresoPayload = {
        id_reserva: reserva.id,
        casa: reserva.casa,
        fecha: toDDMMYYYY(form.fecha),
        monto: montoNum,
        moneda: form.moneda,
        cotizacion: cotizNum,
        monto_ars: Math.round(montoARS),
        monto_usd: montoUSD,
        tipo_movimiento: form.tipo_movimiento as 'adelanto' | 'saldo',
        quien_pago: form.quien_pago.trim(),
        nombre_destinatario: form.nombre_destinatario.trim(),
        banco_destino: form.banco_destino.trim(),
        nro_operacion: form.nro_operacion.trim(),
        detalle: form.detalle.trim(),
        comprobante_url: comprobanteUrl,
      }
      await registrarPago(reserva.id, payload)
      router.push(`/reservas/${reserva.id}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar. Podés reintentar.')
    } finally {
      setLoading(false)
    }
  }

  if (cargando) return (
    <div className="flex items-center justify-center h-full text-sm text-slate-400">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando…
    </div>
  )

  if (!reserva) return (
    <div className="flex items-center justify-center h-full text-sm text-slate-400">
      Reserva no encontrada.
    </div>
  )

  const num = reserva.casa.replace(/\D/g, '')

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-xl mx-auto px-4 py-6">

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-5">
          <Link href="/calendario" className="hover:text-slate-600 transition-colors">Calendario</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/reservas" className="hover:text-slate-600 transition-colors">Reservas</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href={`/reservas/${id}`} className="hover:text-slate-600 transition-colors">{reserva.nombre_pax}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-600 font-medium">Asentar pago</span>
        </div>

        <h1 className="text-lg font-semibold text-slate-800 mb-1">Asentar pago</h1>
        <p className="text-xs text-slate-400 mb-4">Registrar un nuevo pago para esta reserva</p>

        {/* Resumen reserva */}
        <div className="bg-slate-50 rounded-lg border border-slate-100 px-4 py-3 mb-5 text-sm text-slate-600 flex flex-wrap gap-x-6 gap-y-1">
          <span><span className="text-slate-400 text-xs">Casa</span> {CASA_LABELS[num] ?? reserva.casa}</span>
          <span><span className="text-slate-400 text-xs">Huésped</span> {reserva.nombre_pax}</span>
          <span><span className="text-slate-400 text-xs">Fechas</span> {reserva.fecha_entrada} → {reserva.fecha_salida}</span>
          <span><span className="text-slate-400 text-xs">Total</span> USD {reserva.monto_total_usd?.toLocaleString('es-AR')}</span>
          <span>
            <span className="text-slate-400 text-xs">Saldo</span>{' '}
            <span className={reserva.saldo_usd > 0 ? 'text-red-500 font-medium' : 'text-emerald-600'}>
              USD {reserva.saldo_usd?.toLocaleString('es-AR')}
            </span>
          </span>
        </div>

        <div className="grid grid-cols-4 gap-x-3 gap-y-4">

          {/* Comprobante */}
          <div className="col-span-4 space-y-1.5">
            <Label className="text-xs text-slate-500">Comprobante (opcional)</Label>
            {uploadState === 'idle' && (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border border-dashed border-slate-200 rounded-lg py-4 flex flex-col items-center gap-1.5 text-slate-400 hover:border-slate-300 hover:text-slate-500 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span className="text-xs">Subir imagen o PDF</span>
              </button>
            )}
            {uploadState === 'uploading' && (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando comprobante…
              </div>
            )}
            {(uploadState === 'done' || uploadState === 'error') && (
              <div className="flex items-center gap-2">
                {uploadState === 'done' && comprobanteUrl && (
                  <a href={comprobanteUrl} target="_blank" rel="noopener noreferrer">
                    <img src={comprobanteUrl} alt="comprobante" className="h-12 w-auto rounded border border-slate-100 object-cover" />
                  </a>
                )}
                <span className={`text-xs ${uploadState === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
                  {uploadState === 'error' ? 'Error al procesar' : 'Comprobante cargado'}
                </span>
                <button onClick={removeComprobante} className="ml-auto text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>

          {/* Monto */}
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-slate-500">Monto *</Label>
            <Input type="number" min={0} step={0.01} value={form.monto} onChange={e => set('monto', e.target.value)} className="text-sm" />
          </div>

          {/* Moneda */}
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-slate-500">Moneda *</Label>
            <Select value={form.moneda} onValueChange={v => set('moneda', v)}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ARS">Pesos (ARS)</SelectItem>
                <SelectItem value="USD">Dólares (USD)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-slate-500">Cotización ARS/USD *</Label>
            <Input type="number" min={0} value={form.cotizacion} onChange={e => set('cotizacion', e.target.value)} className="text-sm" />
          </div>

          {/* Tipo movimiento */}
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-slate-500">Tipo *</Label>
            <Select value={form.tipo_movimiento} onValueChange={v => set('tipo_movimiento', v)}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Elegí el tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="adelanto">Adelanto / seña</SelectItem>
                <SelectItem value="saldo">Saldo restante</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quién pagó */}
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-slate-500">Quién pagó *</Label>
            <Input value={form.quien_pago} onChange={e => set('quien_pago', e.target.value)} className="text-sm" />
          </div>

          {/* Fecha */}
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-slate-500">Fecha del pago</Label>
            <Input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} className="text-sm" />
          </div>

          {/* Destinatario */}
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-slate-500">Destinatario</Label>
            <Input value={form.nombre_destinatario} onChange={e => set('nombre_destinatario', e.target.value)} className="text-sm" />
          </div>

          {/* Banco */}
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-slate-500">Banco destino</Label>
            <Input value={form.banco_destino} onChange={e => set('banco_destino', e.target.value)} className="text-sm" />
          </div>

          {/* N° operación */}
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-slate-500">N° operación</Label>
            <Input value={form.nro_operacion} onChange={e => set('nro_operacion', e.target.value)} className="text-sm" />
          </div>

          {/* Detalle */}
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-slate-500">Detalle</Label>
            <Input value={form.detalle} onChange={e => set('detalle', e.target.value)} className="text-sm" />
          </div>

          {/* Calculados */}
          {montoNum > 0 && (
            <div className="col-span-4 bg-slate-50 rounded-lg border border-slate-100 px-4 py-3 space-y-1 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Equivalente ARS</span>
                <span className="tabular-nums font-medium text-slate-700">$ {Math.round(montoARS).toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Equivalente USD</span>
                <span className="tabular-nums font-medium text-slate-700">USD {montoUSD.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500 border-t border-slate-100 pt-1 mt-1">
                <span>Saldo después de este pago</span>
                <span className={`tabular-nums font-medium ${saldoRestante > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  USD {saldoRestante.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {error && <p className="col-span-4 text-xs text-red-500">{error}</p>}

          <div className="col-span-4 flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={loading || !form.monto || !form.tipo_movimiento || !form.quien_pago}
              className="cursor-pointer"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
              Confirmar pago
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
