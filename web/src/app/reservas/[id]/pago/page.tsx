'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Calendar, FileCheck2, Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toDDMMYYYY, toISO } from '@/lib/dates'
import { formatUSD } from '@/lib/utils'
import { Reserva, CASA_LABELS } from '@/lib/types'
import { registrarPago, editarIngreso, obtenerIngreso } from '@/app/actions/ingresos'
import type { IngresoPayload } from '@/app/actions/ingresos'
import { GatilloComisionModal } from '@/components/reservas/GatilloComisionModal'

const DESTINATARIOS = ['Paola', 'Francisco', 'Fernando', 'Milagros', 'Inés']

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

type TipoPago = 'transferencia' | 'efectivo' | ''

function PagoPageInner() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')
  const fileRef = useRef<HTMLInputElement>(null)
  const fechaPagoRef = useRef<HTMLInputElement>(null)

  const [reserva, setReserva] = useState<Reserva | null>(null)
  const [cargando, setCargando] = useState(true)
  const [tipoPago, setTipoPago] = useState<TipoPago>('')

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
  const [fromComprobante, setFromComprobante] = useState(false)
  const [destinatarioOtro, setDestinatarioOtro] = useState(false)
  const [comprobanteUrl, setComprobanteUrl] = useState('')
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [gatilloOpen, setGatilloOpen] = useState(false)

  // Cargar reserva
  useEffect(() => {
    fetch('/api/calendar-data')
      .then(r => r.json())
      .then(({ reservas }: { reservas: Reserva[] }) => {
        const found = reservas.find(r => r.id === id) ?? null
        setReserva(found)
      })
      .finally(() => setCargando(false))
  }, [id])

  // Prefetch cotización (solo en modo nuevo pago)
  useEffect(() => {
    if (editId || form.cotizacion) return
    fetch('/api/cotizacion')
      .then(r => r.json())
      .then((d: { cotizacion: number }) => {
        if (d.cotizacion > 0) setForm(prev => ({ ...prev, cotizacion: String(Math.round(d.cotizacion)) }))
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar ingreso existente en modo edición
  useEffect(() => {
    if (!editId) return
    obtenerIngreso(editId).then(ingreso => {
      if (!ingreso) return
      setTipoPago(ingreso.nro_operacion ? 'transferencia' : 'efectivo')
      setComprobanteUrl(ingreso.comprobante_url ?? '')
      if (ingreso.comprobante_url) { setUploadState('done'); setFromComprobante(true) }
      const destNorm = ingreso.nombre_destinatario ? toTitleCase(ingreso.nombre_destinatario) : ''
      if (destNorm && !DESTINATARIOS.includes(destNorm)) setDestinatarioOtro(true)
      setForm({
        monto: String(ingreso.monto ?? ''),
        moneda: (ingreso.moneda as 'ARS' | 'USD') ?? 'ARS',
        cotizacion: String(ingreso.cotizacion ?? ''),
        tipo_movimiento: (ingreso.tipo_movimiento as FormState['tipo_movimiento']) ?? '',
        quien_pago: ingreso.quien_pago ? toTitleCase(ingreso.quien_pago) : '',
        fecha: ingreso.fecha ? toISO(ingreso.fecha) : new Date().toISOString().slice(0, 10),
        nombre_destinatario: destNorm,
        banco_destino: ingreso.banco_destino ? toTitleCase(ingreso.banco_destino) : '',
        nro_operacion: ingreso.nro_operacion ?? '',
        detalle: ingreso.detalle ?? '',
      })
    })
  }, [editId])

  function set(k: keyof FormState, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
    setError('')
  }

  function toTitleCase(s: string) {
    return s.replace(/\b\w/g, c => c.toUpperCase())
  }

  // ── Comprobante ──────────────────────────────────────────────────────
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
      setFromComprobante(true)
      setForm(prev => ({
        ...prev,
        monto:               datos.monto       ? String(datos.monto) : prev.monto,
        moneda:              (datos.moneda === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
        quien_pago:          datos.nombreOrdenante    ? toTitleCase(datos.nombreOrdenante)    : prev.quien_pago,
        nombre_destinatario: datos.nombreDestinatario ? toTitleCase(datos.nombreDestinatario) : prev.nombre_destinatario,
        banco_destino:       datos.bancoDestino       ? toTitleCase(datos.bancoDestino)       : prev.banco_destino,
        nro_operacion:       datos.nroOperacion       || prev.nro_operacion,
        fecha:               datos.fecha ? toISO(datos.fecha) : prev.fecha,
      }))
    } catch {
      setUploadState('error')
    }
  }

  function removeComprobante() {
    setComprobanteUrl('')
    setUploadState('idle')
    setFromComprobante(false)
    if (fileRef.current) fileRef.current.value = ''
    setForm(prev => ({
      ...prev,
      monto: '',
      moneda: 'ARS',
      quien_pago: '',
      nombre_destinatario: '',
      banco_destino: '',
      nro_operacion: '',
      fecha: new Date().toISOString().slice(0, 10),
    }))
  }

  // readonly para campos que vienen de un comprobante recién subido
  function ro(field: keyof FormState) {
    if (!fromComprobante) return false
    const editables: (keyof FormState)[] = ['cotizacion', 'detalle', 'tipo_movimiento', 'fecha', 'quien_pago']
    return !editables.includes(field)
  }

  // ── Submit ───────────────────────────────────────────────────────────
  const montoNum  = parseFloat(form.monto)     || 0
  const cotizNum  = parseFloat(form.cotizacion) || 0
  const montoUSD  = form.moneda === 'USD' ? montoNum : (cotizNum > 0 ? montoNum / cotizNum : 0)
  const montoARS  = form.moneda === 'ARS' ? montoNum : montoNum * cotizNum
  const saldoRestante = (reserva?.saldo_usd ?? 0) - montoUSD

  async function handleSubmit() {
    if (!reserva) return
    if (!form.monto || montoNum <= 0)  { setError('El monto es obligatorio.'); return }
    if (!form.tipo_movimiento)         { setError('Elegí el tipo de movimiento.'); return }
    if (!form.quien_pago.trim())       { setError('Quién pagó es obligatorio.'); return }
    if (!form.nombre_destinatario.trim()) { setError('El destinatario es obligatorio.'); return }
    if (tipoPago === 'transferencia' && uploadState !== 'done') { setError('Subí el comprobante antes de confirmar.'); return }

    setLoading(true)
    try {
      const nn = (s: string) => s.trim() || null
      const payload: IngresoPayload = {
        id_reserva:          reserva.id,
        casa:                reserva.casa,
        fecha:               toDDMMYYYY(form.fecha),
        monto:               montoNum,
        moneda:              form.moneda,
        cotizacion:          cotizNum,
        monto_ars:           Math.round(montoARS),
        monto_usd:           montoUSD,
        tipo_movimiento:     form.tipo_movimiento as 'adelanto' | 'saldo',
        quien_pago:          form.quien_pago.trim(),
        nombre_destinatario: nn(form.nombre_destinatario),
        banco_destino:       nn(form.banco_destino),
        nro_operacion:       nn(form.nro_operacion),
        detalle:             nn(form.detalle),
        comprobante_url:     comprobanteUrl || null,
      }
      if (editId) {
        await editarIngreso(editId, reserva.id, payload)
      } else {
        await registrarPago(reserva.id, payload)
      }

      // US-04: gatillo (no automático) para asentar el cobro también como gasto de comisión
      if (form.nombre_destinatario.trim() === 'Paola') {
        setGatilloOpen(true)
      } else {
        router.push(`/reservas/${reserva.id}`)
      }
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

  if (!editId && reserva.estado_reserva === 'cancelada') return (
    <div className="h-full overflow-auto">
      <div className="max-w-xl mx-auto px-4 py-6">
        <Link href={`/reservas/${reserva.id}`} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors mb-5">
          <ArrowLeft className="w-3.5 h-3.5" /> Atrás
        </Link>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Esta reserva está cancelada</p>
            <p className="text-sm text-amber-700 mt-1">
              {reserva.estado_pago !== 'debe'
                ? 'No se pueden asentar nuevos pagos. Esta reserva ya tiene un pago registrado — se puede trasladar a otra reserva ya creada en vez de cobrar de nuevo.'
                : 'No se pueden asentar nuevos pagos en una reserva cancelada.'}
            </p>
            <Link href={`/reservas/${reserva.id}`} className="inline-block mt-3 text-sm text-amber-800 underline">
              Volver al detalle de la reserva
            </Link>
          </div>
        </div>
      </div>
    </div>
  )

  const num = reserva.casa.replace(/\D/g, '')
  const idNum = reserva.id.replace(/^[A-Z]+-?/, '')
  const titulo = editId ? 'Editar pago' : 'Asentar pago'

  return (
    <div className="h-full overflow-auto flex flex-col">
      <div className="max-w-xl mx-auto px-4 py-6 w-full flex-1">

        <Link href={`/reservas/${reserva.id}`} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors mb-5">
          <ArrowLeft className="w-3.5 h-3.5" /> Atrás
        </Link>

        <h1 className="text-lg font-semibold text-slate-800 mb-1">
          {titulo}{' '}
          <span className="font-normal text-slate-400 text-base">reserva #{idNum}</span>
        </h1>

        {/* Banner reserva */}
        <div className="bg-slate-50 rounded-lg border border-slate-200 px-4 py-3 mb-6 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
          <span className="text-slate-600">
            <span className="text-xs text-slate-400 mr-1">Casa</span>
            {CASA_LABELS[num] ?? reserva.casa}
          </span>
          <span className="text-slate-600">
            <span className="text-xs text-slate-400 mr-1">Huésped</span>
            {reserva.nombre_pax}
          </span>
          <span className="text-slate-600">
            <span className="text-xs text-slate-400 mr-1">Fechas</span>
            {reserva.fecha_entrada} → {reserva.fecha_salida}
          </span>
          <span className="text-slate-600">
            <span className="text-xs text-slate-400 mr-1">Total</span>
            {formatUSD(reserva.monto_total_usd)}
          </span>
          <span>
            <span className="text-xs text-slate-400 mr-1">Saldo</span>
            <span className={reserva.saldo_usd > 0 ? 'text-red-500 font-medium' : 'text-emerald-600'}>
              {formatUSD(reserva.saldo_usd)}
            </span>
          </span>
        </div>

        {/* Selector tipo de pago */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {(['transferencia', 'efectivo'] as TipoPago[]).filter(Boolean).map(t => (
            <button
              key={t}
              onClick={() => {
                setTipoPago(t as TipoPago)
                if (t === 'efectivo') {
                  removeComprobante()
                  setForm(prev => ({ ...prev, quien_pago: reserva.nombre_pax }))
                }
              }}
              className={`rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors cursor-pointer ${
                tipoPago === t
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {(t as string).charAt(0).toUpperCase() + (t as string).slice(1)}
            </button>
          ))}
        </div>

        {tipoPago && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-x-3 gap-y-2 md:gap-y-4">

            {/* Comprobante — solo transferencia */}
            {tipoPago === 'transferencia' && (
              <div className="col-span-1 md:col-span-4 space-y-1.5">
                <Label className="text-xs text-slate-500">Comprobante *</Label>

                {uploadState === 'idle' && (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                    onClick={() => fileRef.current?.click()}
                    className={`w-full border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
                      dragOver
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-500'
                        : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-500'
                    }`}
                  >
                    <Upload className="w-5 h-5" />
                    <span className="text-sm">Arrastrá o hacé click para subir</span>
                    <span className="text-xs text-slate-300">JPG · PNG · PDF</span>
                  </div>
                )}

                {uploadState === 'uploading' && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" /> Procesando comprobante…
                  </div>
                )}

                {(uploadState === 'done' || uploadState === 'error') && (
                  <div className="flex items-center gap-4 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
                    {uploadState === 'done' && (
                      comprobanteUrl ? (
                        <a href={comprobanteUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <div className="w-16 h-16 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 hover:bg-emerald-100 transition-colors">
                            <FileCheck2 className="w-8 h-8" />
                          </div>
                        </a>
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 text-emerald-500">
                          <FileCheck2 className="w-8 h-8" />
                        </div>
                      )
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${uploadState === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
                        {uploadState === 'error' ? 'Error al procesar el archivo' : 'Comprobante procesado'}
                      </p>
                      {uploadState === 'done' && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {fromComprobante ? 'Los campos se completaron automáticamente' : 'Comprobante anterior — podés reemplazarlo'}
                        </p>
                      )}
                    </div>
                    <button onClick={removeComprobante} className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0">
                      <X className="w-4 h-4" />
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
            )}

            {/* Monto | Moneda */}
            <div className="col-span-1 md:col-span-4 grid grid-cols-2 gap-x-3 gap-y-2 md:gap-y-4 md:contents">
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Monto *</Label>
                <div className={`flex h-10 items-center rounded-md border border-input bg-background px-3 gap-1.5 ${ro('monto') ? 'opacity-60' : 'focus-within:ring-1 focus-within:ring-ring'}`}>
                  <span className="text-sm text-slate-600 shrink-0 select-none">
                    {form.moneda === 'USD' ? 'USD' : '$'}
                  </span>
                  <input
                    type="number" min={0} step={0.01}
                    value={form.monto}
                    readOnly={ro('monto')}
                    onChange={e => !ro('monto') && set('monto', e.target.value)}
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Moneda *</Label>
                <Select value={form.moneda} disabled={ro('moneda')} onValueChange={v => set('moneda', v)}>
                  <SelectTrigger className={`text-sm ${ro('moneda') ? 'bg-slate-50 text-slate-500' : ''}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">Pesos (ARS)</SelectItem>
                    <SelectItem value="USD">Dólares (USD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cotización | Tipo */}
            <div className="col-span-1 md:col-span-4 grid grid-cols-2 gap-x-3 gap-y-2 md:gap-y-4 md:contents">
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Cotización ARS/USD *</Label>
                <Input type="number" min={0} value={form.cotizacion} onChange={e => set('cotizacion', e.target.value)} className="text-sm" />
              </div>

              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Tipo de pago *</Label>
                <Select value={form.tipo_movimiento} onValueChange={v => set('tipo_movimiento', v)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Elegí el tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adelanto">Adelanto / seña</SelectItem>
                    <SelectItem value="saldo">Saldo restante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quién pagó */}
            <div className="col-span-1 md:col-span-2 space-y-1">
              <Label className="text-xs text-slate-500">Quién pagó *</Label>
              <Input
                value={form.quien_pago}
                readOnly={ro('quien_pago')}
                onChange={e => !ro('quien_pago') && set('quien_pago', toTitleCase(e.target.value))}
                className={`text-sm ${ro('quien_pago') ? 'bg-slate-50 text-slate-500 cursor-default' : ''}`}
              />
            </div>

            {/* Fecha del pago | Destinatario */}
            <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-x-3 gap-y-2 md:gap-y-4 md:contents">
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Fecha del pago</Label>
                <div
                  className="flex h-10 items-center rounded-md border border-input bg-background px-3 gap-2 cursor-pointer focus-within:ring-1 focus-within:ring-ring"
                  onClick={() => fechaPagoRef.current?.showPicker()}
                >
                  <input
                    ref={fechaPagoRef}
                    type="date"
                    value={form.fecha}
                    onChange={e => set('fecha', e.target.value)}
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm [&::-webkit-calendar-picker-indicator]:hidden"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </div>
              </div>

              <div className="md:col-span-4 space-y-1">
                <Label className="text-xs text-slate-500">Destinatario *</Label>
                {ro('nombre_destinatario') ? (
                  <Input
                    value={form.nombre_destinatario}
                    readOnly
                    className="text-sm bg-slate-50 text-slate-500 cursor-default"
                  />
                ) : (
                  <>
                    <Select
                      value={destinatarioOtro ? 'otro' : form.nombre_destinatario}
                      onValueChange={v => {
                        if (v === 'otro') {
                          setDestinatarioOtro(true)
                          set('nombre_destinatario', '')
                        } else {
                          setDestinatarioOtro(false)
                          set('nombre_destinatario', v)
                        }
                      }}
                    >
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DESTINATARIOS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        <SelectItem value="otro">Otro…</SelectItem>
                      </SelectContent>
                    </Select>
                    {destinatarioOtro && (
                      <Input
                        value={form.nombre_destinatario}
                        onChange={e => set('nombre_destinatario', toTitleCase(e.target.value))}
                        placeholder="Nombre del destinatario"
                        className="text-sm mt-1.5"
                        autoFocus
                      />
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Banco | N° op. — solo transferencia */}
            {tipoPago === 'transferencia' && <>
              <div className="col-span-1 md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Banco destino</Label>
                <Input
                  value={form.banco_destino}
                  readOnly={ro('banco_destino')}
                  onChange={e => !ro('banco_destino') && set('banco_destino', toTitleCase(e.target.value))}
                  className={`text-sm ${ro('banco_destino') ? 'bg-slate-50 text-slate-500 cursor-default' : ''}`}
                />
              </div>

              <div className="col-span-1 md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">N° operación</Label>
                <Input
                  value={form.nro_operacion}
                  readOnly={ro('nro_operacion')}
                  onChange={e => !ro('nro_operacion') && set('nro_operacion', e.target.value)}
                  className={`text-sm ${ro('nro_operacion') ? 'bg-slate-50 text-slate-500 cursor-default' : ''}`}
                />
              </div>
            </>}

            {/* Detalle */}
            <div className="col-span-1 md:col-span-4 space-y-1">
              <Label className="text-xs text-slate-500">Detalle</Label>
              <Input value={form.detalle} onChange={e => set('detalle', e.target.value)} className="text-sm" />
            </div>

            {/* Preview saldo */}
            {montoNum > 0 && (
              <div className="col-span-1 md:col-span-4 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Saldo actual</span>
                  <span className="tabular-nums text-slate-700">{formatUSD(reserva.saldo_usd)}</span>
                </div>
                <div className="flex justify-between text-slate-500 border-t border-slate-200 pt-1.5">
                  <span>Pago</span>
                  <span className="tabular-nums text-slate-700">{formatUSD(montoUSD)}</span>
                </div>
                <div className="flex justify-between text-slate-500 border-t border-slate-200 pt-1.5">
                  <span>Saldo total</span>
                  <span className={`flex items-center gap-1 tabular-nums font-medium ${saldoRestante > 0 ? 'text-amber-600' : saldoRestante < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {saldoRestante < 0 && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                    {formatUSD(saldoRestante)}
                  </span>
                </div>
                {saldoRestante < 0 && (
                  <p className="text-amber-600 pt-0.5">
                    Este pago supera el saldo pendiente y va a generar una diferencia a favor del huésped.
                  </p>
                )}
              </div>
            )}

            {error && <p className="col-span-1 md:col-span-4 text-xs text-red-500">{error}</p>}
          </div>
        )}
      </div>

      {tipoPago && (
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 py-3 shrink-0">
          <div className="max-w-xl mx-auto flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={loading || !form.monto || !form.tipo_movimiento || !form.quien_pago}
              className="cursor-pointer"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
              {editId ? 'Guardar cambios' : 'Confirmar pago'}
            </Button>
          </div>
        </div>
      )}

      <GatilloComisionModal
        open={gatilloOpen}
        montoUsd={montoUSD}
        onConfirm={() => router.push(`/gastos/nuevo?prefillComision=1&monto=${montoNum}&moneda=${form.moneda}&fecha=${form.fecha}`)}
        onDismiss={() => router.push(`/reservas/${reserva.id}`)}
      />
    </div>
  )
}

export default function PagoPage() {
  return (
    <Suspense>
      <PagoPageInner />
    </Suspense>
  )
}
