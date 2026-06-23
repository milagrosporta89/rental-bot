'use server'

import { createAdminClient } from '@/lib/supabase/admin'

const REGISTRADO_POR = 'Milagros'

export interface IngresoPayload {
  id_reserva: string | null
  casa: string
  fecha: string
  monto: number
  moneda: 'ARS' | 'USD'
  cotizacion: number
  monto_ars: number
  monto_usd: number
  tipo_movimiento: 'adelanto' | 'saldo' | 'directo'
  quien_pago: string
  nombre_destinatario: string
  banco_destino: string
  nro_operacion: string
  detalle: string
  comprobante_url: string
}

function calcEstadoPago(saldo: number, total: number): string {
  if (saldo <= 0) return 'pagado'
  if (saldo < total) return 'parcial'
  return 'debe'
}

export async function crearIngreso(payload: IngresoPayload): Promise<void> {
  const supabase = createAdminClient()
  const id = `ING-${Date.now()}`
  const timestamp = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })

  const { error } = await supabase.from('ingresos').insert({
    ...payload,
    id,
    tipo: payload.nro_operacion ? 'transferencia' : 'efectivo',
    registrado_por: REGISTRADO_POR,
    timestamp,
  })
  if (error) throw new Error(error.message)
}

/** Inserta ingreso y recalcula saldo/estado_pago de la reserva desde cero */
export async function registrarPago(
  reservaId: string,
  payload: IngresoPayload
): Promise<void> {
  const supabase = createAdminClient()
  const id = `ING-${Date.now()}`
  const timestamp = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })

  const { error: ie } = await supabase.from('ingresos').insert({
    ...payload,
    id,
    tipo: payload.nro_operacion ? 'transferencia' : 'efectivo',
    registrado_por: REGISTRADO_POR,
    timestamp,
  })
  if (ie) throw new Error(ie.message)

  // Recalcular saldo sumando todos los ingresos USD de esta reserva
  const [{ data: ingresos }, { data: reserva }] = await Promise.all([
    supabase.from('ingresos').select('monto_usd').eq('id_reserva', reservaId),
    supabase.from('reservas').select('monto_total_usd').eq('id', reservaId).single(),
  ])

  const sumaUSD = (ingresos ?? []).reduce((s, i) => s + (i.monto_usd ?? 0), 0)
  const total = reserva?.monto_total_usd ?? 0
  const nuevoSaldo = Math.max(0, total - sumaUSD)
  const nuevoEstado = calcEstadoPago(nuevoSaldo, total)

  const { error: re } = await supabase
    .from('reservas')
    .update({ saldo_usd: nuevoSaldo, estado_pago: nuevoEstado })
    .eq('id', reservaId)
  if (re) throw new Error(re.message)
}
