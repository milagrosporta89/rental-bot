export const dynamic = 'force-dynamic'

import type { ReactNode } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, AlertTriangle } from 'lucide-react'
import { Reserva, Ingreso, CASA_COLORES, CASA_LABELS, PLATAFORMA_LABEL, ESTADO_VISUAL_BADGE, ESTADO_VISUAL_LABEL } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { PagosSection } from '@/components/reservas/PagosSection'
import { EditarReservaButton } from '@/components/reservas/EditarReservaButton'
import { formatUSD } from '@/lib/utils'
import { esTerminada, estadoVisual } from '@/lib/dates'

function casaNum(c: string) { return c.replace(/\D/g, '') }

const PAGO_DOT: Record<string, string> = {
  debe:    'bg-red-400',
  parcial: 'bg-amber-400',
  pagado:  'bg-emerald-400',
}
const PAGO_LABEL: Record<string, string> = { debe: 'Sin pago', parcial: 'Seña pagada', pagado: 'Pagado' }

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  )
}

export default async function ReservaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: reserva }, { data: ingresos }] = await Promise.all([
    supabase.from('reservas').select('*').eq('id', id).single(),
    supabase.from('ingresos').select('*').eq('id_reserva', id).order('timestamp', { ascending: false }),
  ])

  if (!reserva) notFound()

  const r = reserva as Reserva
  const pagos = (ingresos ?? []) as Ingreso[]
  const num = casaNum(r.casa)
  const color = CASA_COLORES[num] ?? '#94a3b8'
  const estado = estadoVisual(r.estado_reserva, r.fecha_entrada, r.fecha_salida)
  const terminada = esTerminada(r.fecha_salida)

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">

        <Link href="/reservas" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors mb-5">
          <ArrowLeft className="w-3.5 h-3.5" /> Atrás
        </Link>

        {/* Encabezado */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-5">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">{r.nombre_pax}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {CASA_LABELS[num] ?? r.casa}
              <span className="text-slate-400 mx-1.5">·</span>
              {r.cantidad_noches} {r.cantidad_noches === 1 ? 'noche' : 'noches'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ESTADO_VISUAL_BADGE[estado] ?? ESTADO_VISUAL_BADGE.confirmada}`}>
              {ESTADO_VISUAL_LABEL[estado] ?? estado}
            </span>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${PAGO_DOT[r.estado_pago] ?? 'bg-slate-300'}`} />
              <span className="text-xs text-slate-500">{PAGO_LABEL[r.estado_pago] ?? r.estado_pago}</span>
            </div>
          </div>
        </div>

        {/* Datos de la reserva */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Reserva <span className="normal-case font-normal text-slate-300">#{r.id.replace(/^[A-Z]+-?/, '')}</span>
            </h2>
            {!terminada && <EditarReservaButton reserva={r} />}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Campo label="Check-in">{r.fecha_entrada}</Campo>
            <Campo label="Check-out">{r.fecha_salida}</Campo>
            <Campo label="Noches">{r.cantidad_noches}</Campo>
            <Campo label="Huéspedes">{r.cantidad_pax}</Campo>
            <Campo label="Plataforma">{PLATAFORMA_LABEL[r.plataforma] ?? r.plataforma}</Campo>
            <Campo label="Teléfono">{r.telefono ?? '—'}</Campo>
            <Campo label="Monto total">{formatUSD(r.monto_total_usd)}</Campo>
            <Campo label="Saldo pendiente">
              <div className="flex items-center gap-1.5">
                {r.saldo_usd < 0 && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                <span className={r.saldo_usd > 0 ? 'text-red-500 font-medium' : r.saldo_usd < 0 ? 'text-amber-600 font-medium' : 'text-emerald-600'}>
                  {formatUSD(r.saldo_usd)}
                </span>
              </div>
              {r.saldo_usd < 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  El pago registrado generó una diferencia a favor del huésped.
                </p>
              )}
            </Campo>
            {r.notas && (
              <div className="col-span-2 sm:col-span-3">
                <Campo label="Notas">{r.notas}</Campo>
              </div>
            )}
          </div>
        </div>

        {/* Pagos registrados */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Pagos registrados</h2>
            {r.estado_reserva !== 'cancelada' && (
              <Button asChild size="sm" variant="outline" className="text-xs text-slate-500 border-slate-200 h-7 px-2.5">
                <Link href={`/reservas/${id}/pago`}>
                  <Plus className="w-3 h-3 mr-1" />Asentar pago
                </Link>
              </Button>
            )}
          </div>

          {r.estado_reserva === 'cancelada' && r.estado_pago !== 'debe' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Esta reserva está cancelada y tiene un pago registrado. No se pueden asentar pagos nuevos, pero se puede trasladar a otra reserva ya creada.
              </p>
            </div>
          )}

          <PagosSection pagos={pagos} reservaId={r.id} reserva={r} cancelada={r.estado_reserva === 'cancelada'} />
        </div>
      </div>
    </div>
  )
}
