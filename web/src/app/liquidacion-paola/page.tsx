'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { liquidacionMensual } from '@/lib/liquidacionMensual'
import { formatMonto, type Moneda } from '@/lib/utils'
import { MonedaToggle } from '@/components/cuenta-paola/MonedaToggle'
import { SaldoPaolaCard } from '@/components/cuenta-paola/SaldoPaolaCard'
import type { Gasto, Ingreso, Reserva } from '@/lib/types'

interface DatosLiquidacion {
  ingresosPaola: Ingreso[]
  gastosPaolaBolsillo: Gasto[]
  gastosComision: Gasto[]
  reservas: Reserva[]
}

async function fetchDatos(): Promise<DatosLiquidacion> {
  const r = await fetch('/api/liquidacion-paola-data')
  const json = await r.json()
  if (!r.ok) throw new Error(json.error ?? 'Error al cargar los datos.')
  return json
}

export default function LiquidacionPaolaPage() {
  const [datos, setDatos] = useState<DatosLiquidacion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [moneda, setMoneda] = useState<Moneda>('USD')

  useEffect(() => {
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
            <p className="text-sm font-medium text-amber-800">No se pudo cargar la liquidación</p>
            <p className="text-sm text-amber-700 mt-1">{error || 'Error desconocido.'}</p>
          </div>
        </div>
      </div>
    )
  }

  const filas = liquidacionMensual(datos.ingresosPaola, datos.gastosPaolaBolsillo, datos.gastosComision, datos.reservas)
  const ultima = filas[filas.length - 1]

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Liquidación mensual con Paola (provisoria)</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Tabla de una sola vez para ponerse al día con la modalidad de pago anterior. No reemplaza la pantalla de Comisiones.
            </p>
          </div>
          <MonedaToggle value={moneda} onChange={setMoneda} />
        </div>

        {ultima && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
            <SaldoPaolaCard
              titulo="Saldo acumulado histórico"
              saldo={ultima.saldoAcumulado}
              saldoArs={ultima.saldoAcumuladoArs}
              destacada
              moneda={moneda}
            />
          </div>
        )}

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs">
                <th className="text-left font-medium px-3 py-2">Mes</th>
                <th className="text-right font-medium px-3 py-2">Ingresos a Paola</th>
                <th className="text-right font-medium px-3 py-2">Gastos pagados por Paola</th>
                <th className="text-right font-medium px-3 py-2">Comisión asentada</th>
                <th className="text-right font-medium px-3 py-2">Comisión sugerida (15% facturado)</th>
                <th className="text-right font-medium px-3 py-2">Saldo del mes</th>
                <th className="text-right font-medium px-3 py-2">Saldo acumulado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.mes} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-700">{f.mesLabel}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatMonto(f.ingresosPaola, f.ingresosPaolaArs, moneda)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatMonto(f.gastosPaola, f.gastosPaolaArs, moneda)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {f.comisionAsentada === 0
                      ? <span className="text-amber-600">sin cargar</span>
                      : formatMonto(f.comisionAsentada, f.comisionAsentadaArs, moneda)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">{formatMonto(f.comisionSugerida, f.comisionSugeridaArs, moneda)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${f.saldoMes > 0 ? 'text-red-500' : f.saldoMes < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {formatMonto(Math.abs(f.saldoMes), Math.abs(f.saldoMesArs), moneda)}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${f.saldoAcumulado > 0 ? 'text-red-500' : f.saldoAcumulado < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {formatMonto(Math.abs(f.saldoAcumulado), Math.abs(f.saldoAcumuladoArs), moneda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-slate-400">
          Saldo positivo (rojo) = el negocio le debe a Paola. Saldo negativo (verde) = Paola le debe al negocio.
          &quot;Comisión asentada&quot; es lo que ya se cargó como gasto categoría comisión ese mes; &quot;sugerida&quot; es una referencia al 15% de lo facturado (por fecha de checkout) para los meses que todavía no tienen nada cargado.
        </p>
      </div>
    </div>
  )
}
