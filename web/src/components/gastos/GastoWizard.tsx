'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toDDMMYYYY, toISO } from '@/lib/dates'
import { buscarGastoDuplicado } from '@/app/actions/gastos'
import type { GastoDuplicado, GastoPayload } from '@/app/actions/gastos'
import { useGastoSubmit } from '@/hooks/useGastoSubmit'
import { SeleccionCaminoToggle, type Camino } from './SeleccionCaminoToggle'
import { ComprobanteDropzone, type UploadState } from './ComprobanteDropzone'
import { DuplicadoBloqueo } from './DuplicadoBloqueo'
import { FormularioGasto, type GastoFormState } from './FormularioGasto'
import { ConfirmacionGasto, type ResumenGasto } from './ConfirmacionGasto'

type Paso = 'camino' | 'dropzone' | 'duplicado' | 'formulario' | 'confirmacion'

const FORM_INICIAL: GastoFormState = {
  categoria: '',
  categoriaOtro: '',
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
  const { submit, loading, error: submitError } = useGastoSubmit()

  const [paso, setPaso] = useState<Paso>('camino')
  const [camino, setCamino] = useState<Camino>('')
  const [form, setForm] = useState<GastoFormState>(FORM_INICIAL)
  const [fromComprobante, setFromComprobante] = useState(false)
  const [comprobanteUrl, setComprobanteUrl] = useState('')
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [duplicado, setDuplicado] = useState<GastoDuplicado | null>(null)
  const [formError, setFormError] = useState('')

  function elegirCamino(c: Camino) {
    setCamino(c)
    setPaso(c === 'comprobante' ? 'dropzone' : 'formulario')
  }

  function onChange(k: keyof GastoFormState, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
    setFormError('')
  }

  // ── Comprobante ──────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setUploadState('uploading')
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

      // Validación de duplicado (step 3a): corre antes de llegar al formulario/confirmación
      if (datos.nroOperacion) {
        const existente = await buscarGastoDuplicado(datos.nroOperacion)
        if (existente) {
          setDuplicado(existente)
          setPaso('duplicado')
          return
        }
      }
      setPaso('formulario')
    } catch {
      setUploadState('error')
    }
  }

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
    setPaso('dropzone')
  }

  // readonly para campos que vinieron de un comprobante recién subido (mismo criterio que pago/page.tsx)
  function ro(field: keyof GastoFormState): boolean {
    if (!fromComprobante) return false
    const editables: (keyof GastoFormState)[] = ['categoria', 'categoriaOtro', 'pagadoPor', 'pagadoPorOtro', 'detalle', 'fecha']
    return !editables.includes(field)
  }

  // ── Validación previa a confirmación ────────────────────────────────
  function validarFormulario(): boolean {
    const montoNum = parseFloat(form.monto) || 0
    if (form.categoria === 'otro' && !form.categoriaOtro.trim()) {
      setFormError('Ingresá el nombre de la categoría.')
      return false
    }
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
      categoria: form.categoria === 'otro' ? form.categoriaOtro.trim() : form.categoria,
      pagado_por: form.pagadoPor === 'otro' ? form.pagadoPorOtro.trim() : form.pagadoPor,
      nombre_destinatario: nn(form.nombre_destinatario),
      // Igual que el bot (src/handlers/gastos.ts): el camino manual no tiene comprobante, se asume efectivo
      banco_origen: camino === 'manual' ? 'Efectivo' : nn(form.banco_origen),
      nro_operacion: nn(form.nro_operacion),
      detalle: nn(form.detalle),
      comprobante_url: comprobanteUrl || null,
    }
  }

  async function confirmar() {
    const ok = await submit(buildPayload())
    if (ok) router.push('/gastos?creado=1')
  }

  const resumen: ResumenGasto = {
    categoria: form.categoria === 'otro' ? form.categoriaOtro : form.categoria,
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

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-lg font-semibold text-slate-800">Cargar gasto</h1>

      {paso === 'camino' && (
        <SeleccionCaminoToggle camino={camino} onSelect={elegirCamino} />
      )}

      {paso === 'dropzone' && (
        <ComprobanteDropzone
          uploadState={uploadState}
          comprobanteUrl={comprobanteUrl}
          onFile={handleFile}
          onRemove={removeComprobante}
        />
      )}

      {paso === 'duplicado' && duplicado && (
        <DuplicadoBloqueo gastoExistente={duplicado} onReintentar={removeComprobante} />
      )}

      {paso === 'formulario' && (
        <FormularioGasto
          camino={camino}
          form={form}
          fromComprobante={fromComprobante}
          ro={ro}
          onChange={onChange}
          onSubmit={irAConfirmacion}
          error={formError}
        />
      )}

      {paso === 'confirmacion' && (
        <ConfirmacionGasto
          resumen={resumen}
          onVolver={() => setPaso('formulario')}
          onConfirmar={confirmar}
          loading={loading}
          error={submitError}
        />
      )}
    </div>
  )
}
