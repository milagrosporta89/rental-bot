'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearMovimientoInterno } from '@/app/actions/movimientosInternos'
import { toDDMMYYYY } from '@/lib/dates'
import { TITULARES_PAGADOR, SENTIDO_MOVIMIENTO_LABEL, type SentidoMovimiento } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onCreado: () => void
}

const CUENTAS = TITULARES_PAGADOR.filter(t => t !== 'Paola')

/**
 * Ajuste que no encaja en ningún flujo automático (cierre de comisión, reembolso de gastos,
 * excedente de caja chica) — para casos puntuales como cerrar un saldo heredado de un sistema
 * anterior a la migración. Queda igual que el resto en "Movimientos de ajuste".
 */
export function AjusteLibreModal({ open, onClose, onCreado }: Props) {
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>('USD')
  const [cotizacion, setCotizacion] = useState('')
  const [sentido, setSentido] = useState<SentidoMovimiento>('a_favor_paola')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [cuentaOrigen, setCuentaOrigen] = useState('')
  const [detalle, setDetalle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || cotizacion) return
    fetch('/api/cotizacion').then(r => r.json()).then((d: { cotizacion: number }) => {
      if (d.cotizacion > 0) setCotizacion(String(Math.round(d.cotizacion)))
    }).catch(() => {})
  }, [open, cotizacion])

  function limpiarYCerrar() {
    setMonto('')
    setMoneda('USD')
    setSentido('a_favor_paola')
    setFecha(new Date().toISOString().slice(0, 10))
    setCuentaOrigen('')
    setDetalle('')
    setError('')
    onClose()
  }

  async function confirmar() {
    const montoNum = parseFloat(monto) || 0
    const cotizNum = parseFloat(cotizacion) || 0
    if (montoNum <= 0) { setError('El monto es obligatorio.'); return }
    if (moneda === 'ARS' && cotizNum <= 0) { setError('La cotización es obligatoria para convertir a USD.'); return }
    if (!detalle.trim()) { setError('El detalle es obligatorio — dejá constancia de por qué se hizo este ajuste.'); return }

    const montoUsd = moneda === 'USD' ? montoNum : montoNum / cotizNum
    const montoArs = moneda === 'ARS' ? montoNum : (cotizNum > 0 ? montoNum * cotizNum : null)

    setLoading(true)
    setError('')
    try {
      await crearMovimientoInterno({
        fecha: toDDMMYYYY(fecha),
        monto: montoNum,
        moneda,
        cotizacion: cotizNum,
        monto_ars: montoArs,
        monto_usd: montoUsd,
        sentido,
        tipo: 'ajuste_libre',
        cuenta_origen: cuentaOrigen || null,
        detalle: detalle.trim(),
        comprobante_url: null,
      })
      onCreado()
      limpiarYCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar. Podés reintentar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && limpiarYCerrar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar ajuste</DialogTitle>
          <DialogDescription>
            Para saldos que no vienen de una comisión, un gasto o un excedente de caja chica — por ejemplo, cerrar un saldo heredado de antes de este sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Monto *</Label>
              <Input type="number" min={0} step={0.01} value={monto} onChange={e => setMonto(e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Moneda *</Label>
              <Select value={moneda} onValueChange={v => setMoneda(v as 'ARS' | 'USD')}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">Dólares (USD)</SelectItem>
                  <SelectItem value="ARS">Pesos (ARS)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Cotización ARS/USD {moneda === 'ARS' ? '*' : ''}</Label>
              <Input type="number" min={0} value={cotizacion} onChange={e => setCotizacion(e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Fecha *</Label>
              <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="text-sm" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Sentido *</Label>
            <Select value={sentido} onValueChange={v => setSentido(v as SentidoMovimiento)}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="a_favor_paola">{SENTIDO_MOVIMIENTO_LABEL.a_favor_paola} (el negocio le debe a ella)</SelectItem>
                <SelectItem value="a_favor_negocio">{SENTIDO_MOVIMIENTO_LABEL.a_favor_negocio} (ella le debe al negocio)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-slate-500">¿De qué cuenta sale o entra? (opcional)</Label>
            <Select value={cuentaOrigen || 'ninguna'} onValueChange={v => setCuentaOrigen(v === 'ninguna' ? '' : v)}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguna">No aplica (solo contable, sin transferencia)</SelectItem>
                {CUENTAS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Detalle *</Label>
            <Input value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Ej: saldo de cierre del sistema anterior a la migración" className="text-sm" />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={limpiarYCerrar} disabled={loading}>
            Cancelar
          </Button>
          <Button size="sm" onClick={confirmar} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
