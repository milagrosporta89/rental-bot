import { Reserva, Bloqueo, CalendarEvent, CASA_COLORES } from './types'
import { toISO } from './dates'

/** "Casa 1" | "1" → "1"  (normaliza el formato del bot y del UI) */
function casaId(casa: string): string {
  const m = casa.match(/\d+/)
  return m ? m[0] : casa
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
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
  const deudor = r.estado_pago === 'debe' || r.estado_pago === 'parcial'

  return {
    id: r.id,
    resourceId: id,
    title: `${deudor ? '● ' : ''}${r.nombre_pax}`,
    start: toISO(r.fecha_entrada),
    end: addOneDay(toISO(r.fecha_salida)),
    backgroundColor: tentativa ? hexToRgba(color, 0.45) : color,
    borderColor: color,
    textColor: '#ffffff',
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
    backgroundColor: '#374151',
    borderColor: '#374151',
    textColor: '#9ca3af',
    extendedProps: { tipo: 'bloqueo', bloqueo: b },
  }
}
