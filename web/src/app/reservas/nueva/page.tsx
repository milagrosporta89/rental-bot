'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { parse, addDays, format, isValid } from 'date-fns'
import { AlertTriangle, ChevronRight, Calendar, ArrowLeft, Upload, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toISO, toDDMMYYYY, calcularNoches, hoy } from '@/lib/dates'
import { formatUSD } from '@/lib/utils'
import { CASA_LABELS, EstadoPago, Plataforma } from '@/lib/types'
import { crearReserva } from '@/app/actions/reservas'
import { crearIngreso } from '@/app/actions/ingresos'
import type { IngresoPayload } from '@/app/actions/ingresos'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface S1 {
  casa: string
  fecha_entrada: string   // DD/MM/YYYY
  fecha_salida: string    // DD/MM/YYYY
  nombre_pax: string
  telefono: string
  cantidad_pax: string
  monto_total_usd: string
  plataforma: Plataforma
  estado_reserva: 'tentativa' | 'confirmada' | ''
  notas: string
}

interface S2 {
  monto: string
  moneda: 'ARS' | 'USD'
  cotizacion: string
  tipo_movimiento: 'adelanto' | 'saldo' | ''
  quien_pago: string
  fecha: string           // ISO yyyy-MM-dd para el input[type=date]
  nombre_destinatario: string
  banco_destino: string
  nro_operacion: string
  detalle: string
}

function calcEstadoPago(saldo: number, total: number): EstadoPago {
  if (saldo <= 0) return 'pagado'
  if (saldo < total) return 'parcial'
  return 'debe'
}

// ── Componente interno (necesita useSearchParams) ─────────────────────────────

function NuevaReservaForm() {
  const router = useRouter()
  const sp = useSearchParams()

  const [step, setStep] = useState(1)
  const [s1, setS1] = useState<S1>({
    casa: sp.get('casa') ?? '1',
    fecha_entrada: sp.get('fecha_entrada') ?? '',
    fecha_salida: sp.get('fecha_salida') ?? '',
    nombre_pax: '',
    telefono: '',
    cantidad_pax: '',
    monto_total_usd: '',
    plataforma: 'directo',
    estado_reserva: '',
    notas: '',
  })
  const [s2, setS2] = useState<S2>({
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

  const checkinRef = useRef<HTMLInputElement>(null)
  const checkoutRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Prefetch cotización al llegar al paso 2
  useEffect(() => {
    if (step !== 2 || s2.cotizacion) return
    fetch('/api/cotizacion')
      .then(r => r.json())
      .then((d: { cotizacion: number }) => {
        if (d.cotizacion > 0) {
          setS2(prev => ({ ...prev, cotizacion: String(Math.round(d.cotizacion)) }))
        }
      })
      .catch(() => {})
  }, [step, s2.cotizacion])

  // Pre-fill quien_pago con nombre_pax al entrar al paso 2
  useEffect(() => {
    if (step === 2 && !s2.quien_pago && s1.nombre_pax) {
      setS2(prev => ({ ...prev, quien_pago: s1.nombre_pax }))
    }
  }, [step, s1.nombre_pax, s2.quien_pago])

  const set1 = useCallback(<K extends keyof S1>(k: K, v: S1[K]) => {
    setS1(prev => ({ ...prev, [k]: v }))
    setError('')
  }, [])

  const set2 = useCallback(<K extends keyof S2>(k: K, v: S2[K]) => {
    setS2(prev => ({ ...prev, [k]: v }))
    setError('')
  }, [])

  // ── Calculados paso 2 ──────────────────────────────────────────────────────

  const montoNum = parseFloat(s2.monto) || 0
  const cotizNum = parseFloat(s2.cotizacion) || 0
  const totalUSD = parseFloat(s1.monto_total_usd) || 0

  const montoUSD = s2.moneda === 'USD' ? montoNum : (cotizNum > 0 ? montoNum / cotizNum : 0)
  const montoARS = s2.moneda === 'ARS' ? montoNum : montoNum * cotizNum
  const saldoRestante = totalUSD - montoUSD

  // ── Upload comprobante ─────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setUploadState('uploading')
    setError('')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/comprobante', { method: 'POST', body: form })
      if (!res.ok) { setUploadState('error'); return }
      const { datos, url } = await res.json() as {
        datos: {
          fecha?: string; monto?: number; moneda?: string;
          nombreOrdenante?: string; nombreDestinatario?: string;
          bancoDestino?: string; nroOperacion?: string
        }
        url: string
      }
      setComprobanteUrl(url)
      setUploadState('done')
      // Pre-llenar campos desde los datos extraídos
      setS2(prev => ({
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

  // ── Validación paso 1 ──────────────────────────────────────────────────────

  function validarS1(): string | null {
    if (!s1.nombre_pax.trim()) return 'El nombre del huésped es obligatorio.'
    if (!s1.fecha_entrada || !s1.fecha_salida) return 'Las fechas son obligatorias.'
    if (calcularNoches(s1.fecha_entrada, s1.fecha_salida) <= 0) return 'La salida debe ser posterior a la entrada.'
    if (!s1.cantidad_pax || parseInt(s1.cantidad_pax) < 1) return 'La cantidad de huéspedes es obligatoria.'
    if (!s1.monto_total_usd || parseFloat(s1.monto_total_usd) < 0) return 'El monto total es obligatorio.'
    if (!s1.estado_reserva) return 'Elegí un estado para continuar.'
    return null
  }

  // ── Submit tentativa ───────────────────────────────────────────────────────

  async function handleGuardarTentativa() {
    const err = validarS1()
    if (err) { setError(err); return }
    setLoading(true)
    try {
      const noches = calcularNoches(s1.fecha_entrada, s1.fecha_salida)
      const total = parseFloat(s1.monto_total_usd)
      await crearReserva({
        casa: s1.casa,
        estado_reserva: 'tentativa',
        titular: '',
        nombre_pax: s1.nombre_pax,
        fecha_entrada: s1.fecha_entrada,
        fecha_salida: s1.fecha_salida,
        cantidad_pax: parseInt(s1.cantidad_pax),
        cantidad_noches: noches,
        telefono: s1.telefono.trim() || null,
        monto_total_usd: total,
        saldo_usd: total,
        estado_pago: 'debe',
        plataforma: s1.plataforma,
        notas: s1.notas.trim() || null,
        cotizacion: 0,
      })
      router.push('/calendario')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar.')
    } finally {
      setLoading(false)
    }
  }

  // ── Submit confirmada (paso 2) ─────────────────────────────────────────────

  async function handleConfirmar() {
    if (!s2.monto || montoNum <= 0) { setError('El monto del pago es obligatorio.'); return }
    if (s2.moneda === 'USD' && cotizNum <= 0) { setError('Ingresá la cotización del dólar.'); return }
    if (!s2.tipo_movimiento) { setError('Elegí el tipo de movimiento.'); return }
    if (!s2.quien_pago.trim()) { setError('Quién pagó es obligatorio.'); return }

    setLoading(true)
    try {
      const noches = calcularNoches(s1.fecha_entrada, s1.fecha_salida)
      const total = parseFloat(s1.monto_total_usd)
      const saldo = Math.max(0, total - montoUSD)
      const estadoPago = calcEstadoPago(saldo, total)

      const { id } = await crearReserva({
        casa: s1.casa,
        estado_reserva: 'confirmada',
        titular: '',
        nombre_pax: s1.nombre_pax,
        fecha_entrada: s1.fecha_entrada,
        fecha_salida: s1.fecha_salida,
        cantidad_pax: parseInt(s1.cantidad_pax),
        cantidad_noches: noches,
        telefono: s1.telefono.trim() || null,
        monto_total_usd: total,
        saldo_usd: saldo,
        estado_pago: estadoPago,
        plataforma: s1.plataforma,
        notas: s1.notas.trim() || null,
        cotizacion: cotizNum,
      })

      const ingreso: IngresoPayload = {
        id_reserva: id,
        casa: s1.casa,
        fecha: toDDMMYYYY(s2.fecha),
        monto: montoNum,
        moneda: s2.moneda,
        cotizacion: cotizNum,
        monto_ars: Math.round(montoARS),
        monto_usd: montoUSD,
        tipo_movimiento: s2.tipo_movimiento as 'adelanto' | 'saldo',
        quien_pago: s2.quien_pago.trim(),
        nombre_destinatario: s2.nombre_destinatario.trim(),
        banco_destino: s2.banco_destino.trim(),
        nro_operacion: s2.nro_operacion.trim(),
        detalle: s2.detalle.trim(),
        comprobante_url: comprobanteUrl,
      }
      await crearIngreso(ingreso)
      router.push('/calendario')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al confirmar. Podés reintentar.')
    } finally {
      setLoading(false)
    }
  }

  const noches = calcularNoches(s1.fecha_entrada, s1.fecha_salida)
  const casaNum = s1.casa.replace(/\D/g, '') || s1.casa
  const minCheckout = (() => {
    const d = parse(s1.fecha_entrada, 'dd/MM/yyyy', new Date())
    return isValid(d) ? format(addDays(d, 1), 'yyyy-MM-dd') : ''
  })()

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-xl mx-auto px-4 py-6">

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-5">
          <Link href="/calendario" className="hover:text-slate-600 transition-colors">Calendario</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-600 font-medium">Nueva reserva</span>
        </div>

        {/* ── PASO 1 ── */}
        {step === 1 && (
          <>
            <h1 className="text-lg font-semibold text-slate-800 mb-1">Nueva reserva</h1>
            <p className="text-xs text-slate-400 mb-5">Paso 1 de 2 · Datos de la reserva</p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-x-3 gap-y-4">

              {/* Casa + Estado */}
              <div className="col-span-1 md:col-span-4 grid grid-cols-2 gap-x-3 gap-y-4 md:contents">
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs text-slate-500">Casa *</Label>
                  <Select value={s1.casa} onValueChange={v => set1('casa', v)}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CASA_LABELS).map(([num, label]) => (
                        <SelectItem key={num} value={num}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Estado reserva */}
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs text-slate-500">Estado *</Label>
                  <Select
                    value={s1.estado_reserva}
                    onValueChange={v => set1('estado_reserva', v as 'tentativa' | 'confirmada')}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Elegí un estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tentativa">Tentativa</SelectItem>
                      <SelectItem value="confirmada">Confirmada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Check-in + Check-out */}
              <div className="col-span-1 md:col-span-4 grid grid-cols-2 gap-x-3 gap-y-4 md:contents">
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs text-slate-500">Check-in *</Label>
                  <div
                    className="flex h-9 items-center rounded-md border border-input bg-background px-3 gap-2 cursor-pointer focus-within:ring-1 focus-within:ring-ring"
                    onClick={() => checkinRef.current?.showPicker()}
                  >
                    <input
                      ref={checkinRef}
                      type="date"
                      value={toISO(s1.fecha_entrada)}
                      onChange={e => {
                        const nueva = toDDMMYYYY(e.target.value)
                        const nd = parse(nueva, 'dd/MM/yyyy', new Date())
                        const sd = parse(s1.fecha_salida, 'dd/MM/yyyy', new Date())
                        setS1(prev => ({
                          ...prev,
                          fecha_entrada: nueva,
                          fecha_salida: isValid(sd) && sd <= nd
                            ? format(addDays(nd, 1), 'dd/MM/yyyy')
                            : prev.fecha_salida,
                        }))
                        setError('')
                      }}
                      className="flex-1 min-w-0 bg-transparent outline-none text-sm [&::-webkit-calendar-picker-indicator]:hidden"
                    />
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </div>
                </div>

                {/* Check-out */}
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs text-slate-500">Check-out *</Label>
                  <div
                    className="flex h-9 items-center rounded-md border border-input bg-background px-3 gap-2 cursor-pointer focus-within:ring-1 focus-within:ring-ring"
                    onClick={() => { if (checkoutRef.current) { checkoutRef.current.min = minCheckout; checkoutRef.current.showPicker() } }}
                  >
                    <input
                      ref={checkoutRef}
                      type="date"
                      value={toISO(s1.fecha_salida)}
                      min={minCheckout}
                      onChange={e => set1('fecha_salida', toDDMMYYYY(e.target.value))}
                      className="flex-1 min-w-0 bg-transparent outline-none text-sm [&::-webkit-calendar-picker-indicator]:hidden"
                    />
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </div>
                </div>
              </div>

              {noches > 0 && (
                <p className="col-span-1 md:col-span-4 text-xs text-slate-400 -mt-2">{noches} noches</p>
              )}

              {/* Nombre */}
              <div className="col-span-1 md:col-span-3 space-y-1">
                <Label className="text-xs text-slate-500">Nombre completo *</Label>
                <Input value={s1.nombre_pax} onChange={e => set1('nombre_pax', e.target.value)} className="text-sm" />
              </div>

              {/* Huéspedes */}
              <div className="col-span-1 md:col-span-1 space-y-1">
                <Label className="text-xs text-slate-500">Huéspedes *</Label>
                <Input
                  type="number" min={1} max={20}
                  value={s1.cantidad_pax}
                  onChange={e => set1('cantidad_pax', e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* Teléfono */}
              <div className="col-span-1 md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Teléfono</Label>
                <Input
                  type="tel"
                  value={s1.telefono}
                  onChange={e => set1('telefono', e.target.value.replace(/[^0-9+\-\s()]/g, ''))}
                  placeholder="549XXXXXXXXXX"
                  className="text-sm"
                />
              </div>

              {/* Plataforma */}
              <div className="col-span-1 md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Plataforma</Label>
                <Select value={s1.plataforma} onValueChange={v => set1('plataforma', v as Plataforma)}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="directo">Directo</SelectItem>
                    <SelectItem value="airbnb">Airbnb</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Monto */}
              <div className="col-span-1 md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Monto total *</Label>
                <div className="flex h-9 items-center rounded-md border border-input bg-background px-3 gap-1.5 focus-within:ring-1 focus-within:ring-ring">
                  <span className="text-sm text-slate-600 shrink-0">USD</span>
                  <input
                    type="number" min={0} step={0.01}
                    value={s1.monto_total_usd}
                    onChange={e => set1('monto_total_usd', e.target.value)}
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              {/* Notas */}
              <div className="col-span-1 md:col-span-4 space-y-1">
                <Label className="text-xs text-slate-500">Notas</Label>
                <Textarea
                  value={s1.notas}
                  onChange={e => set1('notas', e.target.value)}
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>
            </div>

            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

            <div className="flex justify-end gap-2 mt-5">
              <Button variant="ghost" size="sm" asChild className="text-slate-500">
                <Link href="/calendario"><ArrowLeft className="w-3.5 h-3.5 mr-1" />Volver</Link>
              </Button>

              {s1.estado_reserva === '' && (
                <Button size="sm" disabled className="opacity-50">
                  Elegí un estado para continuar
                </Button>
              )}
              {s1.estado_reserva === 'tentativa' && (
                <Button size="sm" onClick={handleGuardarTentativa} disabled={loading}>
                  {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                  Guardar reserva
                </Button>
              )}
              {s1.estado_reserva === 'confirmada' && (
                <Button size="sm" onClick={() => {
                  const err = validarS1()
                  if (err) { setError(err); return }
                  setError('')
                  setStep(2)
                }}>
                  Siguiente: asentar pago
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              )}
            </div>
          </>
        )}

        {/* ── PASO 2 ── */}
        {step === 2 && (
          <>
            <h1 className="text-lg font-semibold text-slate-800 mb-1">Asentar pago</h1>
            <p className="text-xs text-slate-400 mb-4">Paso 2 de 2 · Registrar el pago de la reserva</p>

            {/* Resumen paso 1 (solo lectura) */}
            <div className="bg-slate-50 rounded-lg border border-slate-200 px-4 py-3 mb-5 text-sm text-slate-600 flex flex-wrap gap-x-6 gap-y-1">
              <span><span className="text-slate-400 text-xs">Casa</span> {CASA_LABELS[casaNum] ?? casaNum}</span>
              <span><span className="text-slate-400 text-xs">Huésped</span> {s1.nombre_pax}</span>
              <span><span className="text-slate-400 text-xs">Fechas</span> {s1.fecha_entrada} → {s1.fecha_salida}</span>
              <span><span className="text-slate-400 text-xs">Total</span> {formatUSD(parseFloat(s1.monto_total_usd || '0'))}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-x-3 gap-y-4">

              {/* Comprobante */}
              <div className="col-span-1 md:col-span-4 space-y-1.5">
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
                        <img src={comprobanteUrl} alt="comprobante" className="h-12 w-auto rounded border border-slate-200 object-cover" />
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

              {/* Monto + Moneda */}
              <div className="col-span-1 md:col-span-4 grid grid-cols-2 gap-x-3 gap-y-4 md:contents">
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs text-slate-500">Monto *</Label>
                  <Input
                    type="number" min={0} step={0.01}
                    value={s2.monto}
                    onChange={e => set2('monto', e.target.value)}
                    className="text-sm"
                  />
                </div>

                {/* Moneda */}
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs text-slate-500">Moneda *</Label>
                  <Select value={s2.moneda} onValueChange={v => set2('moneda', v as 'ARS' | 'USD')}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ARS">Pesos (ARS)</SelectItem>
                      <SelectItem value="USD">Dólares (USD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Cotización (solo si USD) */}
              {s2.moneda === 'USD' && (
                <div className="col-span-1 md:col-span-2 space-y-1">
                  <Label className="text-xs text-slate-500">Cotización ARS/USD *</Label>
                  <Input
                    type="number" min={0}
                    value={s2.cotizacion}
                    onChange={e => set2('cotizacion', e.target.value)}
                    placeholder="Oficial"
                    className="text-sm"
                  />
                </div>
              )}

              {/* Tipo de movimiento */}
              <div className="col-span-1 md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Tipo de pago *</Label>
                <Select
                  value={s2.tipo_movimiento}
                  onValueChange={v => set2('tipo_movimiento', v as 'adelanto' | 'saldo')}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Elegí el tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adelanto">Adelanto / seña</SelectItem>
                    <SelectItem value="saldo">Saldo restante</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Quién pagó */}
              <div className="col-span-1 md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Quién pagó *</Label>
                <Input value={s2.quien_pago} onChange={e => set2('quien_pago', e.target.value)} className="text-sm" />
              </div>

              {/* Fecha del pago */}
              <div className="col-span-1 md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Fecha del pago</Label>
                <Input
                  type="date"
                  value={s2.fecha}
                  onChange={e => set2('fecha', e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* Nombre destinatario */}
              <div className="col-span-1 md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Destinatario</Label>
                <Input value={s2.nombre_destinatario} onChange={e => set2('nombre_destinatario', e.target.value)} className="text-sm" />
              </div>

              {/* Banco y N° operación (si hay comprobante de transferencia) */}
              <div className="col-span-1 md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Banco destino</Label>
                <Input value={s2.banco_destino} onChange={e => set2('banco_destino', e.target.value)} className="text-sm" />
              </div>

              <div className="col-span-1 md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">N° operación</Label>
                <Input value={s2.nro_operacion} onChange={e => set2('nro_operacion', e.target.value)} className="text-sm" />
              </div>

              {/* Detalle */}
              <div className="col-span-1 md:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Detalle</Label>
                <Input value={s2.detalle} onChange={e => set2('detalle', e.target.value)} className="text-sm" />
              </div>

              {/* Calculados */}
              {montoNum > 0 && (
                <div className="col-span-1 md:col-span-4 bg-slate-50 rounded-lg border border-slate-200 px-4 py-3 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-500">
                    <span>Equivalente ARS</span>
                    <span className="tabular-nums font-medium text-slate-700">
                      $ {Math.round(montoARS).toLocaleString('es-AR')}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Equivalente USD</span>
                    <span className="tabular-nums font-medium text-slate-700">
                      {formatUSD(montoUSD)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500 border-t border-slate-200 pt-1 mt-1">
                    <span>Saldo después de este pago</span>
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
            </div>

            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

            <div className="flex justify-between mt-5">
              <Button variant="ghost" size="sm" onClick={() => { setStep(1); setError('') }} className="text-slate-500">
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Volver a datos
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmar}
                disabled={loading || !s2.monto || !s2.tipo_movimiento || !s2.quien_pago}
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Confirmar reserva
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Export ─────────────────────────────────────────────────────────────────────

export default function NuevaReservaPage() {
  return (
    <Suspense>
      <NuevaReservaForm />
    </Suspense>
  )
}
