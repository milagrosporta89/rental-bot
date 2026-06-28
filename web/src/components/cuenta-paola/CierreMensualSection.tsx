'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatUSD } from '@/lib/utils'
import { reconciliacionDelMes } from '@/lib/cuentaPaola'
import type { Ingreso, Reserva } from '@/lib/types'
import { TablaReconciliacionComision } from './TablaReconciliacionComision'

interface Props {
  reservas: Reserva[]
  ingresosPaola: Ingreso[]
  onCerrarMes: (total: number) => void
}

function mesActualISO(): string {
  return new Date().toISOString().slice(0, 7)
}

export function CierreMensualSection({ reservas, ingresosPaola, onCerrarMes }: Props) {
  const [mes, setMes] = useState(mesActualISO())

  const filas = useMemo(() => reconciliacionDelMes(reservas, ingresosPaola, mes), [reservas, ingresosPaola, mes])
  const total = useMemo(() => filas.reduce((s, f) => s + f.diferencia, 0), [filas])

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-medium text-slate-700">Cierre mensual de comisión (por checkout)</h2>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-slate-500">Mes</Label>
          <Input type="month" value={mes} onChange={e => setMes(e.target.value)} className="text-sm w-auto" />
        </div>
      </div>

      <TablaReconciliacionComision filas={filas} />

      {filas.length > 0 && (
        <div className="flex items-center justify-between gap-3 mt-3 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
          <div>
            <p className="text-xs text-slate-400">Total del mes</p>
            <p className={`text-sm font-medium tabular-nums ${total > 0 ? 'text-amber-600' : total < 0 ? 'text-indigo-600' : 'text-slate-500'}`}>
              {formatUSD(total)}
            </p>
          </div>
          {total !== 0 && (
            <Button size="sm" variant="outline" onClick={() => onCerrarMes(total)}>
              Cerrar mes
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
