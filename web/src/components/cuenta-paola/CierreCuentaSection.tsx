'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatMonto, type Moneda } from '@/lib/utils'
import { toISO, hoy } from '@/lib/dates'
import { fechaUltimoCierre, gastosPendientesDeReembolso, reconciliacionDesdeUltimoCierre, saldoCajaChica } from '@/lib/cuentaPaola'
import { crearMovimientoInterno } from '@/app/actions/movimientosInternos'
import { partirIngresoPorExcedente, crearIngreso } from '@/app/actions/ingresos'
import { gastoComisionExiste, crearGastoComision } from '@/app/actions/gastos'
import { TITULARES_PAGADOR, type Gasto, type Ingreso, type MovimientoInterno, type Reserva } from '@/lib/types'

interface Props {
  reservas: Reserva[]
  ingresosPaola: Ingreso[]
  gastosPaola: Gasto[]
  movimientosInternos: MovimientoInterno[]
  onCerrado: () => void
  moneda: Moneda
}

function desde(fecha: string | null): string {
  return fecha ? `desde el ${fecha}` : '(histórico completo, todavía no hubo ningún cierre)'
}

export function CierreCuentaSection({ reservas, ingresosPaola, gastosPaola, movimientosInternos, onCerrado, moneda }: Props) {
  const [confirmando, setConfirmando] = useState(false)
  const [cuentaOrigen, setCuentaOrigen] = useState('Fernando')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fechaCierreReembolso = fechaUltimoCierre(movimientosInternos, 'reembolso_gastos')

  const filasComision = reconciliacionDesdeUltimoCierre(reservas, ingresosPaola)
  // Cada reserva se liquida por separado, en cualquiera de las dos direcciones:
  // - Le deben a Paola (diferencia > 0): comisión real, genera su propio gasto — existe sin
  //   importar si hay caja chica para cubrirla o no, porque el costo ya se incurrió.
  // - Cobró de más (diferencia < 0): su ingreso se parte en comisión + caja chica, sin gasto
  //   nuevo (esa plata ya estaba contada en otro lado).
  const filasADeberAPaola = filasComision.filter(f => f.diferencia > 0)
  const filasSobrecobradas = filasComision.filter(f => f.diferencia < 0)
  const totalComisionAPagar = filasADeberAPaola.reduce((s, f) => s + f.diferencia, 0)
  const totalComisionAPagarArs = filasADeberAPaola.reduce((s, f) => s + f.diferenciaArs, 0)
  const totalSobrecobrado = filasSobrecobradas.reduce((s, f) => s + Math.abs(f.diferencia), 0)
  const totalSobrecobradoArs = filasSobrecobradas.reduce((s, f) => s + Math.abs(f.diferenciaArs), 0)

  const gastosPendientes = gastosPendientesDeReembolso(
    gastosPaola, fechaCierreReembolso ? toISO(fechaCierreReembolso) : null
  )
  const totalReembolso = gastosPendientes.reduce((s, g) => s + (g.monto_usd ?? 0), 0)
  // Reembolso real en pesos: la suma de lo que Paola efectivamente pagó en pesos en cada gasto,
  // no una conversión — si pagó $50.000, se le devuelven esos mismos $50.000.
  const totalReembolsoArs = gastosPendientes.reduce((s, g) => s + (g.monto_ars ?? 0), 0)

  // La caja chica es un stock que persiste entre liquidaciones: lo que ya había acumulado de
  // antes, más el excedente nuevo de este período, cubre primero lo que el negocio le debe a
  // Paola y el reembolso de gastos, antes de transferir efectivo nuevo. Esto solo afecta el
  // efectivo a transferir — el gasto de cada comisión pendiente se registra igual, siempre.
  const cajaChicaAcumulada = saldoCajaChica(movimientosInternos)
  const cajaChicaAcumuladaArs = saldoCajaChica(movimientosInternos, 'monto_ars')
  const cajaChicaDisponible = cajaChicaAcumulada + totalSobrecobrado
  const cajaChicaDisponibleArs = cajaChicaAcumuladaArs + totalSobrecobradoArs
  const debeNegocio = totalComisionAPagar + totalReembolso
  const debeNegocioArs = totalComisionAPagarArs + totalReembolsoArs
  const usoDeCajaChica = Math.min(cajaChicaDisponible, debeNegocio)
  const usoDeCajaChicaArs = Math.min(cajaChicaDisponibleArs, debeNegocioArs)
  const totalATransferir = debeNegocio - usoDeCajaChica
  const totalATransferirArs = debeNegocioArs - usoDeCajaChicaArs
  const cajaChicaRestante = cajaChicaDisponible - usoDeCajaChica
  const cajaChicaRestanteArs = cajaChicaDisponibleArs - usoDeCajaChicaArs
  const hayAlgoQueLiquidar = totalComisionAPagar > 0 || filasSobrecobradas.length > 0 || totalReembolso > 0
  // Neto de comisión del período, para el resumen del modal: positivo = a favor del negocio
  // (se suma a caja chica), negativo = a favor de Paola (lo que se le debe).
  const resultadoComisionPeriodo = totalSobrecobrado - totalComisionAPagar
  const resultadoComisionPeriodoArs = totalSobrecobradoArs - totalComisionAPagarArs

  async function confirmarLiquidacion() {
    setLoading(true)
    setError('')
    const fecha = hoy()
    try {
      for (const fila of filasSobrecobradas) {
        // Si nunca se asentó el gasto de comisión al cobrar (se salteó el gatillo), la
        // liquidación es la última instancia donde puede quedar registrado ese costo real.
        if (!(await gastoComisionExiste(fila.reserva.id))) {
          await crearGastoComision({
            id_reserva: fila.reserva.id,
            fecha,
            monto_usd: fila.devengado,
            monto_ars: fila.devengadoArs,
            cotizacion: fila.reserva.cotizacion,
            pagado_por: cuentaOrigen,
            detalle: `Comisión de la reserva #${fila.reserva.id} — ${fila.reserva.nombre_pax} (no se había asentado al cobrar)`,
          })
        }
        const excedente = await partirIngresoPorExcedente(fila.reserva.id, fila.devengado)
        await crearMovimientoInterno({
          fecha: excedente?.fecha ?? fecha,
          monto: Math.abs(fila.diferencia),
          moneda: 'USD',
          cotizacion: fila.reserva.cotizacion,
          monto_ars: Math.abs(fila.diferenciaArs),
          monto_usd: Math.abs(fila.diferencia),
          sentido: 'a_favor_negocio',
          tipo: 'caja_chica',
          cuenta_origen: cuentaOrigen,
          detalle: `Comisión cobrada de más en la reserva #${fila.reserva.id} — ${fila.reserva.nombre_pax}`,
          comprobante_url: null,
        })
      }
      for (const fila of filasADeberAPaola) {
        // Además del movimiento (que genera el gasto), se asienta como ingreso a Paola — así
        // la reserva queda con cobrado = devengado en el histórico, no en $0/parcial para
        // siempre solo porque el huésped nunca le pagó a ella directamente. El monto en pesos
        // usa la cotización con la que se cargó esa reserva (no la de hoy).
        await crearIngreso({
          id_reserva: fila.reserva.id,
          casa: fila.reserva.casa,
          fecha,
          monto: fila.diferencia,
          moneda: 'USD',
          cotizacion: fila.reserva.cotizacion,
          monto_ars: fila.diferenciaArs,
          monto_usd: fila.diferencia,
          tipo_movimiento: 'saldo',
          quien_pago: 'Liquidación de comisión',
          nombre_destinatario: 'Paola',
          banco_destino: null,
          nro_operacion: null,
          detalle: `Liquidación de comisión pendiente — reserva #${fila.reserva.id}`,
          comprobante_url: null,
        })
        await crearMovimientoInterno({
          fecha,
          monto: fila.diferencia,
          moneda: 'USD',
          cotizacion: fila.reserva.cotizacion,
          monto_ars: fila.diferenciaArs,
          monto_usd: fila.diferencia,
          sentido: 'a_favor_paola',
          tipo: 'cierre_comision',
          cuenta_origen: cuentaOrigen,
          detalle: `Comisión pendiente de la reserva #${fila.reserva.id} — ${fila.reserva.nombre_pax}`,
          comprobante_url: null,
        })
      }
      if (totalReembolso > 0) {
        await crearMovimientoInterno({
          fecha,
          monto: totalReembolso,
          moneda: 'USD',
          cotizacion: 0,
          monto_ars: totalReembolsoArs,
          monto_usd: totalReembolso,
          sentido: 'a_favor_paola',
          tipo: 'reembolso_gastos',
          cuenta_origen: cuentaOrigen,
          detalle: `Reembolso de gastos pendientes ${desde(fechaCierreReembolso)}`,
          comprobante_url: null,
        })
      }
      if (usoDeCajaChica > 0) {
        await crearMovimientoInterno({
          fecha,
          monto: usoDeCajaChica,
          moneda: 'USD',
          cotizacion: 0,
          monto_ars: usoDeCajaChicaArs,
          monto_usd: usoDeCajaChica,
          sentido: 'a_favor_paola',
          tipo: 'caja_chica',
          cuenta_origen: cuentaOrigen,
          detalle: `Caja chica usada para cubrir esta liquidación`,
          comprobante_url: null,
        })
      }
      setConfirmando(false)
      onCerrado()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al liquidar. Podés reintentar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
        <div>
          <p className="text-xs text-slate-400">Total a transferirle a Paola (comisión + reembolso)</p>
          <p className={`text-sm font-medium tabular-nums ${totalATransferir > 0 ? 'text-red-500' : 'text-slate-500'}`}>
            {formatMonto(totalATransferir, totalATransferirArs, moneda)}
          </p>
        </div>
        {hayAlgoQueLiquidar && (
          <Button size="sm" variant="outline" onClick={() => setConfirmando(true)}>
            Liquidar comisiones
          </Button>
        )}
      </div>

      <Dialog open={confirmando} onOpenChange={o => !o && setConfirmando(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar liquidación de comisiones</DialogTitle>
            <DialogDescription>
              {resultadoComisionPeriodo !== 0 && (
                <>Se resuelven comisiones por {formatMonto(Math.abs(resultadoComisionPeriodo), Math.abs(resultadoComisionPeriodoArs), moneda)} a favor {resultadoComisionPeriodo > 0 ? 'del negocio' : 'de Paola'}<br /></>
              )}
              {totalReembolso > 0 && <>Se reembolsan gastos por {formatMonto(totalReembolso, totalReembolsoArs, moneda)}<br /></>}
              {totalATransferir > 0
                ? <strong>Se transfiere a Paola: {formatMonto(totalATransferir, totalATransferirArs, moneda)}</strong>
                : <strong>No hace falta transferir nada — se cubre con la caja chica acumulada.</strong>}
              {totalATransferir === 0 && <><br />Caja chica restante: {formatMonto(cajaChicaRestante, cajaChicaRestanteArs, moneda)}</>}
              <br /><br />
              {totalATransferir > 0
                ? 'Hacé la transferencia real antes o después de confirmar. No se puede deshacer.'
                : 'La plata sigue en la cuenta de Paola, contabilizada como caja chica del negocio. No se puede deshacer.'}
            </DialogDescription>
          </DialogHeader>

          {totalATransferir > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">¿De qué cuenta sale la plata? *</Label>
              <Select value={cuentaOrigen} onValueChange={setCuentaOrigen}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TITULARES_PAGADOR.filter(t => t !== 'Paola').map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmando(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button size="sm" onClick={confirmarLiquidacion} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
              Confirmar liquidación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
