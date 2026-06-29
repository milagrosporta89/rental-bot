'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { esTerminada } from '@/lib/dates'
import { registradoPorActual } from '@/lib/auth'
import type { Ingreso } from '@/lib/types'

export interface IngresoPayload {
  id_reserva: string | null
  casa: string
  fecha: string
  monto: number
  moneda: 'ARS' | 'USD'
  cotizacion: number
  monto_ars: number
  monto_usd: number
  tipo_movimiento: 'adelanto' | 'saldo'
  quien_pago: string
  nombre_destinatario: string | null
  banco_destino: string | null
  nro_operacion: string | null
  detalle: string | null
  comprobante_url: string | null
}

function calcEstadoPago(saldo: number, total: number): string {
  if (saldo <= 0) return 'pagado'
  if (saldo < total) return 'parcial'
  return 'debe'
}

async function recalcularSaldo(reservaId: string): Promise<void> {
  const supabase = createAdminClient()
  const [{ data: ingresos }, { data: reserva }] = await Promise.all([
    supabase.from('ingresos').select('monto_usd').eq('id_reserva', reservaId),
    supabase.from('reservas').select('monto_total_usd').eq('id', reservaId).single(),
  ])
  const sumaUSD = (ingresos ?? []).reduce((s: number, i: { monto_usd: number | null }) => s + (i.monto_usd ?? 0), 0)
  const total = reserva?.monto_total_usd ?? 0
  const nuevoSaldo = total - sumaUSD
  const nuevoEstado = calcEstadoPago(nuevoSaldo, total)
  const { error } = await supabase
    .from('reservas')
    .update({ saldo_usd: nuevoSaldo, estado_pago: nuevoEstado })
    .eq('id', reservaId)
  if (error) throw new Error(error.message)
}

export async function crearIngreso(payload: IngresoPayload): Promise<void> {
  const registrado_por = await registradoPorActual()
  const supabase = createAdminClient()
  const id = `ING-${Date.now()}`
  const timestamp = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })

  const { error } = await supabase.from('ingresos').insert({
    ...payload,
    id,
    tipo: payload.nro_operacion ? 'transferencia' : 'efectivo',
    registrado_por,
    timestamp,
  })
  if (error?.code === '23505') throw new Error(`El número de operación ${payload.nro_operacion} ya fue registrado.`)
  if (error) throw new Error(error.message)
}

/** Inserta ingreso y recalcula saldo/estado_pago de la reserva desde cero */
export async function registrarPago(
  reservaId: string,
  payload: IngresoPayload
): Promise<void> {
  const registrado_por = await registradoPorActual()
  const supabase = createAdminClient()

  const { data: reservaActual } = await supabase.from('reservas').select('estado_reserva').eq('id', reservaId).single()
  if (reservaActual?.estado_reserva === 'cancelada') {
    throw new Error('No se pueden asentar pagos nuevos en una reserva cancelada.')
  }

  const id = `ING-${Date.now()}`
  const timestamp = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })

  const { error: ie } = await supabase.from('ingresos').insert({
    ...payload,
    id,
    tipo: payload.nro_operacion ? 'transferencia' : 'efectivo',
    registrado_por,
    timestamp,
  })
  if (ie?.code === '23505') throw new Error(`El número de operación ${payload.nro_operacion} ya fue registrado.`)
  if (ie) throw new Error(ie.message)

  // Recalcular saldo sumando todos los ingresos USD de esta reserva
  const [{ data: ingresos }, { data: reserva }] = await Promise.all([
    supabase.from('ingresos').select('monto_usd').eq('id_reserva', reservaId),
    supabase.from('reservas').select('monto_total_usd').eq('id', reservaId).single(),
  ])

  const sumaUSD = (ingresos ?? []).reduce((s: number, i: { monto_usd: number | null }) => s + (i.monto_usd ?? 0), 0)
  const total = reserva?.monto_total_usd ?? 0
  const nuevoSaldo = total - sumaUSD
  const nuevoEstado = calcEstadoPago(nuevoSaldo, total)

  const { error: re } = await supabase
    .from('reservas')
    .update({ saldo_usd: nuevoSaldo, estado_pago: nuevoEstado, estado_reserva: 'confirmada' })
    .eq('id', reservaId)
  if (re) throw new Error(re.message)
}

export async function obtenerIngreso(id: string): Promise<Ingreso | null> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('ingresos').select('*').eq('id', id).single()
  return data as Ingreso | null
}

export async function eliminarIngreso(id: string, reservaId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('ingresos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  await recalcularSaldo(reservaId)
}

/** Mueve un pago de una reserva cancelada a otra reserva ya creada */
export async function trasladarPago(ingresoId: string, reservaDestinoId: string): Promise<void> {
  const registrado_por = await registradoPorActual()
  const supabase = createAdminClient()

  const { data: ingreso } = await supabase.from('ingresos').select('id_reserva').eq('id', ingresoId).single()
  const reservaOrigenId = ingreso?.id_reserva
  if (!reservaOrigenId) throw new Error('El pago no está asociado a ninguna reserva.')
  if (reservaOrigenId === reservaDestinoId) throw new Error('Elegí una reserva distinta a la actual.')

  const [{ data: origen }, { data: destino }] = await Promise.all([
    supabase.from('reservas').select('estado_reserva, monto_total_usd').eq('id', reservaOrigenId).single(),
    supabase.from('reservas').select('estado_reserva, fecha_salida').eq('id', reservaDestinoId).single(),
  ])
  if (origen?.estado_reserva !== 'cancelada') throw new Error('Solo se pueden trasladar pagos de reservas canceladas.')
  if (!destino) throw new Error('Reserva destino no encontrada.')
  if (destino.estado_reserva === 'cancelada') throw new Error('No se puede trasladar un pago a una reserva cancelada.')
  if (esTerminada(destino.fecha_salida)) throw new Error('No se puede trasladar un pago a una reserva ya terminada.')

  const { error: ue } = await supabase.from('ingresos').update({ id_reserva: reservaDestinoId }).eq('id', ingresoId)
  if (ue) throw new Error(ue.message)

  // Origen: sigue cancelada con saldo en 0, pero el estado de pago refleja lo que le queda (si quedó algún otro ingreso)
  const { data: ingresosOrigen } = await supabase.from('ingresos').select('monto_usd').eq('id_reserva', reservaOrigenId)
  const sumaOrigen = (ingresosOrigen ?? []).reduce((s: number, i: { monto_usd: number | null }) => s + (i.monto_usd ?? 0), 0)
  const totalOrigen = origen.monto_total_usd ?? 0
  await supabase
    .from('reservas')
    .update({ estado_pago: calcEstadoPago(totalOrigen - sumaOrigen, totalOrigen), saldo_usd: 0 })
    .eq('id', reservaOrigenId)

  // Destino: recalcula su saldo normalmente (ya incluye el pago trasladado) y la confirma si todavía era tentativa
  await recalcularSaldo(reservaDestinoId)
  if (destino.estado_reserva === 'tentativa') {
    const { error: ce } = await supabase.from('reservas').update({ estado_reserva: 'confirmada' }).eq('id', reservaDestinoId)
    if (ce) throw new Error(ce.message)
  }

  const timestamp = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  await supabase.from('historial').insert([
    {
      timestamp, id_registro: reservaOrigenId, tipo_registro: 'reserva', campo: 'pago_trasladado',
      valor_anterior: ingresoId, valor_nuevo: `trasladado a reserva ${reservaDestinoId}`,
      modificado_por: registrado_por, aprobado_por: registrado_por,
    },
    {
      timestamp, id_registro: reservaDestinoId, tipo_registro: 'reserva', campo: 'pago_trasladado',
      valor_anterior: ingresoId, valor_nuevo: `recibido desde reserva ${reservaOrigenId}`,
      modificado_por: registrado_por, aprobado_por: registrado_por,
    },
  ])
}

/**
 * Clasificación manual (US-06) de un cobro de Paola en una reserva cancelada:
 * 'comision' no hace nada más (la plata queda definitivamente de ella); 'caja_chica'
 * además registra un movimiento_interno a_favor_negocio por el mismo monto, porque
 * esa plata pasa a contar como reembolso de lo que el negocio le debe por gastos.
 */
export async function marcarResolucionCancelacion(
  ingresoId: string,
  resolucion: 'comision' | 'caja_chica'
): Promise<void> {
  const supabase = createAdminClient()
  const { data: ingreso, error: ie } = await supabase
    .from('ingresos')
    .select('fecha, monto, moneda, cotizacion, monto_ars, monto_usd, resolucion_cancelacion')
    .eq('id', ingresoId)
    .single()
  if (ie || !ingreso) throw new Error(ie?.message ?? 'Ingreso no encontrado.')
  if (ingreso.resolucion_cancelacion) throw new Error('Este cobro ya fue clasificado.')

  const { error } = await supabase
    .from('ingresos')
    .update({ resolucion_cancelacion: resolucion })
    .eq('id', ingresoId)
  if (error) throw new Error(error.message)

  if (resolucion === 'caja_chica') {
    const registrado_por = await registradoPorActual()
    const timestamp = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
    const { error: me } = await supabase.from('movimientos_internos').insert({
      id: `MOV-${Date.now()}`,
      fecha: ingreso.fecha,
      monto: ingreso.monto,
      moneda: ingreso.moneda,
      cotizacion: ingreso.cotizacion,
      monto_ars: ingreso.monto_ars,
      monto_usd: ingreso.monto_usd,
      sentido: 'a_favor_negocio',
      tipo: 'caja_chica',
      cuenta_origen: null, // no es una transferencia entre cuentas, es plata que Paola ya tenía
      detalle: `Caja chica — cobro de reserva cancelada (ingreso ${ingresoId})`,
      comprobante_url: null,
      registrado_por,
      timestamp,
    })
    if (me) throw new Error(me.message)
  }
}

export async function editarIngreso(
  id: string,
  reservaId: string,
  payload: IngresoPayload
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('ingresos').update({
    fecha: payload.fecha,
    monto: payload.monto,
    moneda: payload.moneda,
    cotizacion: payload.cotizacion,
    monto_ars: payload.monto_ars,
    monto_usd: payload.monto_usd,
    tipo_movimiento: payload.tipo_movimiento,
    quien_pago: payload.quien_pago,
    nombre_destinatario: payload.nombre_destinatario,
    banco_destino: payload.banco_destino,
    nro_operacion: payload.nro_operacion,
    detalle: payload.detalle,
    comprobante_url: payload.comprobante_url,
    tipo: payload.nro_operacion ? 'transferencia' : 'efectivo',
  }).eq('id', id)
  if (error?.code === '23505') throw new Error(`El número de operación ${payload.nro_operacion} ya fue registrado.`)
  if (error) throw new Error(error.message)
  await recalcularSaldo(reservaId)
}
