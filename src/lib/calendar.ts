import { Reserva, Bloqueo, CalendarEvent, CASA_COLORES } from './types'
import { toISO } from './dates'

/** "Casa 1" | "1" → "1"  (normaliza el formato del bot y del UI) */
function casaId(casa: string): string {
  const m = casa.match(/\d+/)
  return m ? m[0] : casa
}

/** Aplana un color hex + alpha sobre blanco — devuelve hex sólido sin transparencia */
function blendOnWhite(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const ro = Math.round(255 * (1 - alpha) + r * alpha)
  const go = Math.round(255 * (1 - alpha) + g * alpha)
  const bo = Math.round(255 * (1 - alpha) + b * alpha)
  return `#${ro.toString(16).padStart(2, '0')}${go.toString(16).padStart(2, '0')}${bo.toString(16).padStart(2, '0')}`
}

function addOneDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function reservaToEvent(r: Reserva): CalendarEvent {
  const id = casaId(r.casa)
  const color = CASA_COLORES[id] ?? '#6366f1'
  const tentativa = r.estado_reserva === 'tentativa'
  // saldo_usd (no estado_pago): estado_pago es editable a mano y puede desincronizarse
  // del saldo real, dejando el puntito prendido en reservas ya cobradas.
  const deudor = r.saldo_usd > 0

  // Confirmada: fondo muy suave (≈ color al 13%, igual que los chips de la tabla)
  // Tentativa:  fondo un poco más visible para distinguirla sin usar transparencia real
  const bgAlpha = tentativa ? 0.22 : 0.13
  const borderAlpha = tentativa ? 0.38 : 0.25

  return {
    id: r.id,
    resourceId: id,
    title: `${deudor ? '● ' : ''}${r.nombre_pax}`,
    start: toISO(r.fecha_entrada),
    end: addOneDay(toISO(r.fecha_salida)),
    backgroundColor: blendOnWhite(color, bgAlpha),
    borderColor: blendOnWhite(color, borderAlpha),
    textColor: color,
    extendedProps: { tipo: 'reserva', reserva: r },
  }
}

export function bloqueoToEvent(b: Bloqueo): CalendarEvent {
  return {
    id: `bloqueo-${b.id}`,
    resourceId: casaId(b.casa),
    title: `⊘ ${b.motivo.replace('_', ' ')}`,
    start: toISO(b.fecha_desde),
    end: toISO(b.fecha_hasta),
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    textColor: '#64748b',
    extendedProps: { tipo: 'bloqueo', bloqueo: b },
  }
}
