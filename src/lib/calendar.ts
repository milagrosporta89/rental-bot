import { Reserva, Bloqueo, CalendarEvent, CASA_COLORES } from './types'
import { toISO, esTerminada } from './dates'

/** "Casa 1" | "1" → "1"  (normaliza el formato del bot y del UI) */
function casaId(casa: string): string {
  const m = casa.match(/\d+/)
  return m ? m[0] : casa
}

/** Mezcla un color hex con otro (blanco o negro) en la proporción `t` — devuelve hex sólido sin transparencia */
function mix(hex: string, target: [number, number, number], t: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const ro = Math.round(r * (1 - t) + target[0] * t)
  const go = Math.round(g * (1 - t) + target[1] * t)
  const bo = Math.round(b * (1 - t) + target[2] * t)
  return `#${ro.toString(16).padStart(2, '0')}${go.toString(16).padStart(2, '0')}${bo.toString(16).padStart(2, '0')}`
}

const blendOnWhite = (hex: string, alpha: number) => mix(hex, [255, 255, 255], 1 - alpha)
// El color de casa "puro" no llega a 4.5:1 de contraste sobre el fondo pálido del chip
// (ej. el esmeralda de Casa 2 da ~2.25:1) — oscurecerlo hacia el negro sube el contraste
// de las 5 casas a ~4.5:1 o más sin perder el matiz que identifica a cada una.
const darken = (hex: string) => mix(hex, [0, 0, 0], 0.4)

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
  const title = `${deudor ? '● ' : ''}${r.nombre_pax}`
  const start = toISO(r.fecha_entrada)
  const end = addOneDay(toISO(r.fecha_salida))

  // Terminada: gris plano (igual que un bloqueo) en vez del color de la casa, para
  // distinguirla de un vistazo de las reservas activas
  if (esTerminada(r.fecha_salida)) {
    return {
      id: r.id,
      resourceId: id,
      title,
      start,
      end,
      backgroundColor: '#f1f5f9',
      borderColor: '#e2e8f0',
      textColor: '#94a3b8',
      extendedProps: { tipo: 'reserva', reserva: r },
    }
  }

  // Confirmada: fondo muy suave (≈ color al 13%, igual que los chips de la tabla)
  // Tentativa:  fondo un poco más visible para distinguirla sin usar transparencia real
  const bgAlpha = tentativa ? 0.22 : 0.13
  const borderAlpha = tentativa ? 0.38 : 0.25

  return {
    id: r.id,
    resourceId: id,
    title,
    start,
    end,
    backgroundColor: blendOnWhite(color, bgAlpha),
    borderColor: blendOnWhite(color, borderAlpha),
    textColor: darken(color),
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
