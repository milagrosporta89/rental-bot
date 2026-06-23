import type { ReactNode } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'
import { Reserva, Ingreso, CASA_COLORES, CASA_LABELS } from '@/lib/types'
import { Button } from '@/components/ui/button'

function casaNum(c: string) { return c.replace(/\D/g, '') }

const ESTADO_BADGE: Record<string, string> = {
  confirmada: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  tentativa:  'bg-amber-50 text-amber-700 border border-amber-200',
  cancelada:  'bg-slate-100 text-slate-400 border border-slate-200',
}

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
      <p className="text-sm text-slate-700">{children}</p>
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
  const estado = r.estado_reserva ?? 'confirmada'

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-5">
          <Link href="/calendario" className="hover:text-slate-600 transition-colors">Calendario</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/reservas" className="hover:text-slate-600 transition-colors">Reservas</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-600 font-medium">{r.nombre_pax} · {CASA_LABELS[num] ?? r.casa}</span>
        </div>

        {/* Encabezado */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium"
              style={{ backgroundColor: `${color}20`, color }}
            >
              {CASA_LABELS[num] ?? r.casa}
            </span>
            <h1 className="text-lg font-semibold text-slate-800">{r.nombre_pax}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ESTADO_BADGE[estado] ?? ESTADO_BADGE.confirmada}`}>
              {estado.charAt(0).toUpperCase() + estado.slice(1)}
            </span>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${PAGO_DOT[r.estado_pago] ?? 'bg-slate-300'}`} />
              <span className="text-xs text-slate-500">{PAGO_LABEL[r.estado_pago] ?? r.estado_pago}</span>
            </div>
          </div>
        </div>

        {/* Datos de la reserva */}
        <div className="bg-white border border-slate-100 rounded-xl p-5 mb-5">
          <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-4">Datos de la reserva</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Campo label="Check-in">{r.fecha_entrada}</Campo>
            <Campo label="Check-out">{r.fecha_salida}</Campo>
            <Campo label="Noches">{r.cantidad_noches}</Campo>
            <Campo label="Huéspedes">{r.cantidad_pax}</Campo>
            <Campo label="Plataforma">{r.plataforma}</Campo>
            <Campo label="Teléfono">{r.telefono ?? '—'}</Campo>
            <Campo label="Monto total">USD {r.monto_total_usd?.toLocaleString('es-AR') ?? '—'}</Campo>
            <Campo label="Saldo pendiente">
              <span className={r.saldo_usd > 0 ? 'text-red-500 font-medium' : 'text-emerald-600'}>
                USD {r.saldo_usd?.toLocaleString('es-AR') ?? '—'}
              </span>
            </Campo>
            {r.notas && (
              <div className="col-span-2 sm:col-span-3">
                <Campo label="Notas">{r.notas}</Campo>
              </div>
            )}
          </div>
        </div>

        {/* Pagos registrados */}
        <div className="bg-white border border-slate-100 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Pagos registrados</h2>
            <Button asChild size="sm" variant="outline" className="text-xs text-slate-500 border-slate-200 h-7 px-2.5">
              <Link href={`/reservas/${id}/pago`}>
                <Plus className="w-3 h-3 mr-1" />Asentar pago
              </Link>
            </Button>
          </div>

          {pagos.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Sin pagos registrados</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {pagos.map(p => {
                const metodo = p.nro_operacion ? 'Transferencia' : 'Efectivo'
                const tipoLabel: Record<string, string> = { adelanto: 'Adelanto', saldo: 'Saldo', directo: 'Pago' }
                return (
                  <div key={p.id} className="py-3 flex items-center gap-4">
                    {p.comprobante_url && (
                      <a href={p.comprobante_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <img
                          src={p.comprobante_url}
                          alt="comprobante"
                          className="h-10 w-10 rounded object-cover border border-slate-100 hover:opacity-80 transition-opacity"
                        />
                      </a>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-700 tabular-nums">
                          {p.moneda} {p.monto?.toLocaleString('es-AR')}
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs text-slate-500">{tipoLabel[p.tipo_movimiento] ?? p.tipo_movimiento}</span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs text-slate-500">{metodo}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{p.fecha}{p.quien_pago ? ` · ${p.quien_pago}` : ''}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
