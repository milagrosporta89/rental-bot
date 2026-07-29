'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, History, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saldoPendienteDesglosado, fechaUltimoCierre, comisionesPorAdelantado, reconciliacionDesdeUltimoCierre } from '@/lib/cuentaPaola'
import { toISO } from '@/lib/dates'
import type { Moneda } from '@/lib/utils'
import { CATEGORIA_GASTO_LABEL, type CategoriaGasto, type Gasto, type Ingreso, type MovimientoInterno, type Reserva } from '@/lib/types'
import { SaldoPaolaCard } from '@/components/cuenta-paola/SaldoPaolaCard'
import { MonedaToggle } from '@/components/cuenta-paola/MonedaToggle'
import { TablaMovimientoFinanciero, type ItemMovimientoFinanciero } from '@/components/cuenta-paola/TablaMovimientoFinanciero'
import { TablaMovimientos } from '@/components/cuenta-paola/TablaMovimientos'
import { TablaComisionesCobradas } from '@/components/cuenta-paola/TablaComisionesCobradas'
import { TablaReconciliacionComision } from '@/components/cuenta-paola/TablaReconciliacionComision'
import { CierreCuentaSection } from '@/components/cuenta-paola/CierreCuentaSection'
import { CancelacionesPendientesSection } from '@/components/cuenta-paola/CancelacionesPendientesSection'
import { AjusteLibreModal } from '@/components/cuenta-paola/AjusteLibreModal'

interface DatosCuentaPaola {
  ingresosPaola: Ingreso[]
  gastosPaola: Gasto[]
  movimientosInternos: MovimientoInterno[]
  reservas: Reserva[]
  cancelacionesPendientes: Ingreso[]
}

async function fetchDatos(): Promise<DatosCuentaPaola> {
  const r = await fetch('/api/cuenta-paola-data')
  const json = await r.json()
  if (!r.ok) throw new Error(json.error ?? 'Error al cargar los datos.')
  return json
}

function desdeFecha(fecha: string): (item: { fecha: string }) => boolean {
  const desdeISO = fecha ? toISO(fecha) : null
  return item => !desdeISO || toISO(item.fecha) > desdeISO
}

function desde(fecha: string | null): string {
  return fecha ? `desde el ${fecha}` : '(histórico completo, todavía no hubo ningún cierre)'
}

export default function CuentaPaolaPage() {
  const [datos, setDatos] = useState<DatosCuentaPaola | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [moneda, setMoneda] = useState<Moneda>('USD')
  const [ajusteModalOpen, setAjusteModalOpen] = useState(false)

  useEffect(() => {
    fetchDatos().then(setDatos).catch(e => setError(e.message)).finally(() => setCargando(false))
  }, [])

  const recargar = useCallback(() => {
    setCargando(true)
    setError('')
    fetchDatos().then(setDatos).catch(e => setError(e.message)).finally(() => setCargando(false))
  }, [])

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-400 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
      </div>
    )
  }

  if (error || !datos) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3 max-w-md">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">No se pudo cargar la cuenta de Paola</p>
            <p className="text-sm text-amber-700 mt-1">{error || 'Error desconocido.'}</p>
          </div>
        </div>
      </div>
    )
  }

  // "Comisiones cobradas" y "Gastos pagados por Paola" muestran lo acumulado desde el último
  // cierre de cada tipo — mismo criterio que usa CierreCuentaSection, así no hay dos nociones
  // distintas de "qué es lo pendiente" en la misma pantalla. El saldo principal usa exactamente
  // la misma cuenta (comisión pendiente + gastos pendientes), nunca el acumulado de toda la vida.
  const saldo = saldoPendienteDesglosado(datos.reservas, datos.ingresosPaola, datos.gastosPaola, datos.movimientosInternos)
  const fechaCierreComision = fechaUltimoCierre(datos.movimientosInternos, 'cierre_comision')
  const fechaCierreReembolso = fechaUltimoCierre(datos.movimientosInternos, 'reembolso_gastos')
  const gastosPaolaPendientes = fechaCierreReembolso ? datos.gastosPaola.filter(desdeFecha(fechaCierreReembolso)) : datos.gastosPaola
  const movimientosCajaChica = datos.movimientosInternos.filter(m => m.tipo === 'caja_chica')
  const movimientosDeAjuste = datos.movimientosInternos.filter(m => m.tipo !== 'caja_chica')

  // Una sola cuenta corriente de caja chica: lo que Paola le debe al negocio (excedente cobrado
  // de más, cobros de reservas canceladas) en positivo, lo que el negocio le debe a ella (gastos
  // que pagó de su bolsillo, o caja chica ya usada a su favor) en negativo. La suma de esta
  // tabla es el número de "Caja chica" de la card de arriba.
  const filasCajaChica: ItemMovimientoFinanciero[] = [
    ...gastosPaolaPendientes.map(g => ({
      id: g.id,
      fecha: g.fecha,
      monto: -(g.monto ?? 0),
      monto_ars: g.monto_ars != null ? -g.monto_ars : null,
      monto_usd: g.monto_usd != null ? -g.monto_usd : null,
      moneda: g.moneda,
      detalle: g.detalle,
      categoria: CATEGORIA_GASTO_LABEL[g.categoria as CategoriaGasto] ?? g.categoria,
    })),
    ...movimientosCajaChica.map(m => ({
      id: m.id,
      fecha: m.fecha,
      monto: m.sentido === 'a_favor_negocio' ? m.monto : -m.monto,
      monto_ars: m.monto_ars != null ? (m.sentido === 'a_favor_negocio' ? m.monto_ars : -m.monto_ars) : null,
      monto_usd: m.monto_usd != null ? (m.sentido === 'a_favor_negocio' ? m.monto_usd : -m.monto_usd) : null,
      moneda: m.moneda,
      detalle: m.detalle,
      categoria: 'Caja chica',
    })),
  ].sort((a, b) => toISO(a.fecha).localeCompare(toISO(b.fecha)))
  const cajaChica = filasCajaChica.reduce((s, f) => s + (f.monto_usd ?? 0), 0)
  const cajaChicaArs = filasCajaChica.reduce((s, f) => s + (f.monto_ars ?? 0), 0)

  // Comisiones cobradas por adelantado de reservas que todavía no terminaron — quedan "en
  // stand-by" hasta que la reserva concluya, así que se muestran aparte de las que ya se
  // pueden cerrar (esas sí entran en "desde el último cierre").
  const adelantadas = comisionesPorAdelantado(datos.ingresosPaola, datos.reservas)
  const idsAdelantadas = new Set(adelantadas.map(i => i.id))
  const comisionesDesdeUltimoCierre = fechaCierreComision ? datos.ingresosPaola.filter(desdeFecha(fechaCierreComision)) : datos.ingresosPaola

  // Reconciliación a nivel reserva (no por pago) — así una reserva sin ningún cobro a Paola
  // también aparece como "a resolver", en vez de desaparecer por no tener ingreso que listar.
  const filasReconciliacion = reconciliacionDesdeUltimoCierre(datos.reservas, datos.ingresosPaola)
  const diferenciaPorReserva = new Map(filasReconciliacion.map(f => [f.reserva.id, f.diferencia]))
  const comisionesPerfectas = comisionesDesdeUltimoCierre.filter(
    i => i.resolucion_cancelacion !== 'caja_chica' && !idsAdelantadas.has(i.id) && i.id_reserva && diferenciaPorReserva.get(i.id_reserva) === 0
  )
  const filasComisionAResolver = filasReconciliacion.filter(f => f.diferencia !== 0)

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-800">Comisiones y Caja chica</h1>
          <div className="flex items-center gap-2">
            <MonedaToggle value={moneda} onChange={setMoneda} />
            <Button size="sm" variant="outline" asChild>
              <Link href="/cuenta-paola/historico">
                <History className="w-3.5 h-3.5" /> Histórico de reservas cobradas
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SaldoPaolaCard titulo="Total pendiente con Paola" saldo={saldo.total} saldoArs={saldo.totalArs} destacada moneda={moneda} />
          <SaldoPaolaCard titulo="Pendiente de saldar — comisión" saldo={saldo.comision} saldoArs={saldo.comisionArs} moneda={moneda} />
          <SaldoPaolaCard titulo="Caja chica" saldo={-cajaChica} saldoArs={-cajaChicaArs} moneda={moneda} />
        </div>

        <CierreCuentaSection
          reservas={datos.reservas}
          ingresosPaola={datos.ingresosPaola}
          gastosPaola={datos.gastosPaola}
          movimientosInternos={datos.movimientosInternos}
          onCerrado={recargar}
          moneda={moneda}
        />

        <div>
          <h2 className="text-sm font-medium text-slate-700 mb-3">
            Comisiones por reservas terminadas {desde(fechaCierreComision)}
          </h2>

          <div className="space-y-5 pl-1">
            <div>
              <h3 className="text-xs font-semibold text-slate-600 mb-1">Comisiones a resolver</h3>
              <p className="text-[11px] text-slate-400 mb-2">
                Reservas ya terminadas donde lo cobrado no coincide con lo que correspondía — incluye las que todavía no pagaron nada.
              </p>
              <TablaReconciliacionComision filas={filasComisionAResolver} moneda={moneda} />
            </div>

            <div>
              <h3 className="text-xs font-semibold text-slate-600 mb-1">Comisiones sin conflictos</h3>
              <p className="text-[11px] text-slate-400 mb-2">
                Reservas donde Paola cobró exactamente el 10% o 15% que le corresponde — ya están listas, no necesitan ningún ajuste.
              </p>
              <TablaComisionesCobradas
                ingresos={comisionesPerfectas}
                reservas={datos.reservas}
                vacioMensaje="Sin comisiones sin conflictos desde el último cierre."
                moneda={moneda}
              />
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium text-slate-700 mb-1">Caja chica</h2>
          <p className="text-[11px] text-slate-400 mb-2">
            En positivo, lo que Paola le debe al negocio (excedente cobrado de más, cobros de reservas canceladas). En negativo, lo que el negocio le debe a ella (gastos que pagó de su bolsillo, o caja chica ya usada a su favor). El total es el saldo de caja chica.
          </p>
          <TablaMovimientoFinanciero
            items={filasCajaChica}
            vacioMensaje="Sin movimientos de caja chica todavía."
          />
        </div>

        <div>
          <h2 className="text-sm font-medium text-slate-700 mb-1">Comisiones cobradas por adelantado — la reserva todavía no terminó</h2>
          <p className="text-[11px] text-slate-400 mb-2">
            Comisión ya cobrada de reservas futuras. Queda en stand-by, sin contar para ningún cierre, hasta que la reserva concluya.
          </p>
          <TablaComisionesCobradas
            ingresos={adelantadas}
            reservas={datos.reservas}
            vacioMensaje="Sin comisiones cobradas por adelantado."
            moneda={moneda}
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="text-sm font-medium text-slate-700">Movimientos de ajuste</h2>
            <Button size="sm" variant="outline" onClick={() => setAjusteModalOpen(true)}>
              Registrar ajuste
            </Button>
          </div>
          <p className="text-[11px] text-slate-400 mb-2">
            Transferencias reales ya hechas para saldar diferencias con Paola — lo que ya se pagó, no lo que falta.
          </p>
          <TablaMovimientos
            items={movimientosDeAjuste}
            vacioMensaje="Sin movimientos registrados todavía."
          />
        </div>

        <AjusteLibreModal
          open={ajusteModalOpen}
          onClose={() => setAjusteModalOpen(false)}
          onCreado={recargar}
        />

        <CancelacionesPendientesSection
          items={datos.cancelacionesPendientes}
          reservas={datos.reservas}
          onResuelto={recargar}
        />
      </div>
    </div>
  )
}
