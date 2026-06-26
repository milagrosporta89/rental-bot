'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { toDDMMYYYY, toISO } from '@/lib/dates'
import { buscarGastoDuplicado, obtenerGasto } from '@/app/actions/gastos'
import type { GastoDuplicado, GastoPayload } from '@/app/actions/gastos'
import { useGastoSubmit } from '@/hooks/useGastoSubmit'
import { Stepper } from './Stepper'
import { ComprobanteDropzone, type UploadState } from './ComprobanteDropzone'
import { DuplicadoBloqueo } from './DuplicadoBloqueo'
import { FormularioGasto, type GastoFormState } from './FormularioGasto'
import { ConfirmacionGasto, type ResumenGasto } from './ConfirmacionGasto'
import { PantallaExito } from './PantallaExito'

type Paso = 'carga' | 'confirmacion' | 'exito'
const PASO_NUM: Record<Paso, 1 | 2 | 3> = { carga: 1, confirmacion: 2, exito: 3 }

const FORM_INICIAL: GastoFormState = {
  categoria: '',
  monto: '',
  moneda: 'ARS',
  fecha: new Date().toISOString().slice(0, 10),
  pagadoPor: '',
  pagadoPorOtro: '',
  nombre_destinatario: '',
  banco_origen: '',
  nro_operacion: '',
  detalle: '',
}

function toTitleCase(s: string) {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

export function GastoWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')
  const { submit, loading, error: submitError } = useGastoSubmit()

  const [cargandoEdicion, setCargandoEdicion] = useState(!!editId)
  const [paso, setPaso] = useState<Paso>('carga')
  const [form, setForm] = useState<GastoFormState>(FORM_INICIAL)
  const [fromComprobante, setFromComprobante] = useState(false)
  const [comprobanteUrl, setComprobanteUrl] = useState('')
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [duplicado, setDuplicado] = useState<GastoDuplicado | null>(null)
  const [formError, setFormError] = useState('')

  // Modo edición: precarga los datos del gasto existente. Sin dropzone — editar es para
  // corregir un dato, no para reemplazar el comprobante original.
  useEffect(() => {
    if (!editId) return
    obtenerGasto(editId).then(g => {
      if (!g) { setCargandoEdicion(false); return }
      const tieneComprobante = Boolean(g.nro_operacion || g.comprobante_url)
      setFromComprobante(tieneComprobante)
      setComprobanteUrl(g.comprobante_url ?? '')
      setForm({
        categoria: g.categoria,
        monto: String(g.monto),
        moneda: (g.moneda === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
        fecha: toISO(g.fecha),
        pagadoPor: g.pagado_por,
        pagadoPorOtro: '',
        nombre_destinatario: g.nombre_destinatario ?? '',
        banco_origen: g.banco_origen ?? '',
        nro_operacion: g.nro_operacion ?? '',
        detalle: g.detalle ?? '',
      })
      setCargandoEdicion(false)
    })
  }, [editId])

  function onChange(k: keyof GastoFormState, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
    setFormError('')
  }

  // ── Comprobante (opcional, solo en alta nueva) ──────────────────────
  async function handleFile(file: File) {
    setUploadState('uploading')
    setDuplicado(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('tipo', 'gasto')
    try {
      const res = await fetch('/api/comprobante', { method: 'POST', body: fd })
      if (!res.ok) { setUploadState('error'); return }
      const { datos, url } = await res.json() as {
        datos: { fecha?: string; monto?: number; moneda?: string; nombreDestinatario?: string; bancoOrigen?: string; nroOperacion?: string }
        url: string
      }
      setComprobanteUrl(url)
      setUploadState('done')
      setFromComprobante(true)
      setForm(prev => ({
        ...prev,
        monto:               datos.monto ? String(datos.monto) : prev.monto,
        moneda:              (datos.moneda === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
        nombre_destinatario: datos.nombreDestinatario ? toTitleCase(datos.nombreDestinatario) : prev.nombre_destinatario,
        banco_origen:        datos.bancoOrigen ? toTitleCase(datos.bancoOrigen) : prev.banco_origen,
        nro_operacion:       datos.nroOperacion || prev.nro_operacion,
        fecha:               datos.fecha ? toISO(datos.fecha) : prev.fecha,
      }))

      // Validación de duplicado: advertencia inline en la misma pantalla, no una pantalla aparte
      if (datos.nroOperacion) {
        const existente = await buscarGastoDuplicado(datos.nroOperacion)
        if (existente) setDuplicado(existente)
      }
    } catch {
      setUploadState('error')
    }
  }

  // Quita el comprobante cargado (por error de elección, o tras un duplicado) — el resto
  // del formulario sigue disponible para completar a mano
  function removeComprobante() {
    setComprobanteUrl('')
    setUploadState('idle')
    setFromComprobante(false)
    setDuplicado(null)
    setForm(prev => ({
      ...prev,
      monto: '',
      moneda: 'ARS',
      nombre_destinatario: '',
      banco_origen: '',
      nro_operacion: '',
      fecha: new Date().toISOString().slice(0, 10),
    }))
  }

  // readonly para campos que vinieron de un comprobante (recién subido, o ya existente al editar)
  function ro(field: keyof GastoFormState): boolean {
    if (!fromComprobante) return false
    const editables: (keyof GastoFormState)[] = ['categoria', 'pagadoPor', 'pagadoPorOtro', 'detalle', 'fecha']
    return !editables.includes(field)
  }

  // ── Validación previa a confirmación ────────────────────────────────
  function validarFormulario(): boolean {
    if (duplicado) {
      setFormError('Quitá el comprobante duplicado antes de continuar.')
      return false
    }
    const montoNum = parseFloat(form.monto) || 0
    if (!form.categoria) {
      setFormError('La categoría es obligatoria.')
      return false
    }
    if (!form.monto || montoNum <= 0) {
      setFormError('El monto debe ser numérico y mayor a 0.')
      return false
    }
    if (!form.fecha) {
      setFormError('La fecha es obligatoria.')
      return false
    }
    if (form.fecha > new Date().toISOString().slice(0, 10)) {
      setFormError('La fecha no puede ser futura.')
      return false
    }
    if (!form.pagadoPor) {
      setFormError('Pagado por es obligatorio.')
      return false
    }
    if (form.pagadoPor === 'otro' && !form.pagadoPorOtro.trim()) {
      setFormError('Ingresá el nombre de quién pagó.')
      return false
    }
    return true
  }

  function irAConfirmacion() {
    if (!validarFormulario()) return
    setPaso('confirmacion')
  }

  // ── Submit final ─────────────────────────────────────────────────────
  function buildPayload(): GastoPayload {
    const montoNum = parseFloat(form.monto) || 0
    const nn = (s: string) => s.trim() || null
    return {
      fecha: toDDMMYYYY(form.fecha),
      monto: montoNum,
      moneda: form.moneda,
      categoria: form.categoria,
      pagado_por: form.pagadoPor === 'otro' ? form.pagadoPorOtro.trim() : form.pagadoPor,
      nombre_destinatario: nn(form.nombre_destinatario),
      // Igual que el bot (src/handlers/gastos.ts): sin comprobante se asume efectivo
      banco_origen: fromComprobante ? nn(form.banco_origen) : 'Efectivo',
      nro_operacion: nn(form.nro_operacion),
      detalle: nn(form.detalle),
      comprobante_url: comprobanteUrl || null,
    }
  }

  async function confirmar() {
    const ok = await submit(buildPayload(), editId ?? undefined)
    if (ok) setPaso('exito')
  }

  const resumen: ResumenGasto = {
    categoria: form.categoria,
    monto: parseFloat(form.monto) || 0,
    moneda: form.moneda,
    fecha: toDDMMYYYY(form.fecha),
    pagadoPor: form.pagadoPor === 'otro' ? form.pagadoPorOtro : form.pagadoPor,
    detalle: form.detalle,
    nombre_destinatario: form.nombre_destinatario,
    banco_origen: form.banco_origen,
    nro_operacion: form.nro_operacion,
    comprobante_url: comprobanteUrl,
  }

  if (cargandoEdicion) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-400 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Link href="/gastos" className="hover:text-slate-600 transition-colors">Gastos</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-slate-600 font-medium">{editId ? 'Editar gasto' : 'Nuevo gasto'}</span>
      </div>

      <Stepper actual={PASO_NUM[paso]} />

      {paso === 'carga' && (
        <div className="space-y-4">
          {!editId && (
            <div className="space-y-2">
              <ComprobanteDropzone
                uploadState={uploadState}
                comprobanteUrl={comprobanteUrl}
                onFile={handleFile}
                onRemove={removeComprobante}
              />
              {duplicado && <DuplicadoBloqueo gastoExistente={duplicado} />}
              {!fromComprobante && !duplicado && (
                <p className="text-[11px] text-slate-400">
                  Si subís el comprobante, completamos los datos automáticamente.
                </p>
              )}
            </div>
          )}

          <FormularioGasto
            form={form}
            fromComprobante={fromComprobante}
            ro={ro}
            onChange={onChange}
            onSubmit={irAConfirmacion}
            onVolver={editId ? () => router.push('/gastos') : undefined}
            error={formError}
          />
        </div>
      )}

      {paso === 'confirmacion' && (
        <ConfirmacionGasto
          resumen={resumen}
          onVolver={() => setPaso('carga')}
          onConfirmar={confirmar}
          loading={loading}
          error={submitError}
          modoEdicion={!!editId}
        />
      )}

      {paso === 'exito' && (
        <PantallaExito
          mensaje={editId ? 'Gasto actualizado correctamente' : 'Gasto registrado correctamente'}
          onContinuar={() => router.push('/gastos')}
        />
      )}
    </div>
  )
}
