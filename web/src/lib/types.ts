export type EstadoPago = 'debe' | 'parcial' | 'pagado'
export type EstadoReserva = 'tentativa' | 'confirmada' | 'cancelada'
export type Plataforma = 'directo' | 'airbnb' | 'booking'
export type MotivoBloqueo = 'limpieza' | 'mantenimiento' | 'uso_personal' | 'otro'

export interface Reserva {
  id: string
  fecha_registro: string       // DD/MM/YYYY
  casa: string                 // '1' a '5'
  titular: string
  nombre_pax: string
  cantidad_pax: number
  cantidad_noches: number
  fecha_entrada: string        // DD/MM/YYYY
  fecha_salida: string         // DD/MM/YYYY
  monto_total_usd: number
  monto_adelanto_ars: number | null
  monto_adelanto_usd: number | null
  saldo_usd: number
  estado_pago: EstadoPago
  comprobante_url: string | null
  registrado_por: string
  timestamp: string
  cotizacion: number
  plataforma: Plataforma
  // Campos agregados por rental-ui
  estado_reserva: EstadoReserva
  notas: string | null
  telefono: string | null
}

export interface Bloqueo {
  id: string
  casa: string
  fecha_desde: string          // DD/MM/YYYY
  fecha_hasta: string          // DD/MM/YYYY
  motivo: MotivoBloqueo
  notas: string | null
  registrado_por: string
  timestamp: string
}

export interface Ingreso {
  id: string
  fecha: string
  casa: string
  monto: number
  moneda: string
  tipo: string
  quien_pago: string
  id_reserva: string | null
  tipo_movimiento: string
  monto_ars: number | null
  monto_usd: number | null
  cotizacion: number
  nombre_destinatario: string | null
  banco_destino: string | null
  nro_operacion: string | null
  detalle: string | null
  registrado_por: string
  comprobante_url: string | null
  timestamp: string
}

// Para FullCalendar
export interface CalendarEvent {
  id: string
  resourceId: string           // casa
  title: string
  start: string                // ISO YYYY-MM-DD
  end: string                  // ISO YYYY-MM-DD (exclusive)
  backgroundColor: string
  borderColor: string
  textColor?: string
  opacity?: number
  extendedProps: {
    tipo: 'reserva' | 'bloqueo'
    reserva?: Reserva
    bloqueo?: Bloqueo
  }
}

export const CASA_TITULAR: Record<string, string> = {
  '1': 'Francisco',
  '2': 'Francisco',
  '3': 'Milagros',
  '4': 'Milagros',
  '5': 'Inés',
}

export const CASA_COLORES: Record<string, string> = {
  '1': '#6366f1',
  '2': '#10b981',
  '3': '#f59e0b',
  '4': '#ef4444',
  '5': '#8b5cf6',
}

export const CASA_LABELS: Record<string, string> = {
  '1': 'Casa 1',
  '2': 'Casa 2',
  '3': 'Casa 3',
  '4': 'Casa 4',
  '5': 'Casa 5',
}
