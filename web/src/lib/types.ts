export type EstadoPago = 'debe' | 'parcial' | 'pagado'
export type EstadoReserva = 'tentativa' | 'confirmada' | 'cancelada'
export type Plataforma = 'directo' | 'airbnb'
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

export type CategoriaGasto =
  | 'limpieza'
  | 'jardinero'
  | 'lavanderia'
  | 'expensas'
  | 'luz'
  | 'gas'
  | 'mantenimiento'
  | 'internet'
  | 'marketing'
  | 'impuestos'
  | 'comision'
  | 'otro'

export interface Gasto {
  id: string
  fecha: string
  monto: number
  moneda: string
  categoria: string
  pagado_por: string
  nombre_destinatario: string | null
  banco_origen: string | null
  nro_operacion: string | null
  detalle: string | null
  registrado_por: string
  comprobante_url: string | null
  timestamp: string
  cotizacion: number
  monto_ars: number | null
  monto_usd: number | null
  id_reserva: string | null
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
  resolucion_cancelacion: ResolucionCancelacion | null
}

export type SentidoMovimiento = 'a_favor_paola' | 'a_favor_negocio'
export type ResolucionCancelacion = 'comision' | 'caja_chica'

// Determina si el movimiento genera o no un gasto espejo en /gastos (ver actions/movimientosInternos.ts):
// solo 'cierre_comision' representa plata nunca contada antes. Los demás ya están contados en
// otro lado (el gasto original, o no son una salida real) y generarían un doble conteo si también
// se asentaran como gasto nuevo.
export type TipoMovimientoInterno = 'cierre_comision' | 'reembolso_gastos' | 'caja_chica' | 'ajuste_libre'

export interface MovimientoInterno {
  id: string
  fecha: string
  monto: number
  moneda: string
  cotizacion: number
  monto_ars: number | null
  monto_usd: number | null
  sentido: SentidoMovimiento
  tipo: TipoMovimientoInterno
  cuenta_origen: string | null
  detalle: string | null
  comprobante_url: string | null
  registrado_por: string
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
  '1': '#6366f1',  // índigo
  '2': '#10b981',  // esmeralda
  '3': '#f59e0b',  // ámbar
  '4': '#ef4444',  // rojo
  '5': '#0ea5e9',  // sky (azul cielo)
}

export const CASA_LABELS: Record<string, string> = {
  '1': 'Casa 1',
  '2': 'Casa 2',
  '3': 'Casa 3',
  '4': 'Casa 4',
  '5': 'Casa 5',
}

export const PLATAFORMA_LABEL: Record<string, string> = {
  directo: 'Directo',
  airbnb: 'Airbnb',
}

// % de comisión de Paola sobre monto_total_usd de una reserva concretada (no cancelada)
export const COMISION_PAOLA_PORCENTAJE: Record<Plataforma, number> = {
  directo: 0.15,
  airbnb: 0.10,
}

export const SENTIDO_MOVIMIENTO_LABEL: Record<SentidoMovimiento, string> = {
  a_favor_paola: 'A favor de Paola',
  a_favor_negocio: 'A favor del negocio',
}

export const TIPO_MOVIMIENTO_LABEL: Record<TipoMovimientoInterno, string> = {
  cierre_comision: 'Comisión pendiente',
  reembolso_gastos: 'Reembolso de gastos',
  caja_chica: 'Caja chica',
  ajuste_libre: 'Otro ajuste',
}

export const RESOLUCION_CANCELACION_LABEL: Record<ResolucionCancelacion, string> = {
  comision: 'Comisión',
  caja_chica: 'Caja chica',
}

export const CATEGORIA_GASTO_LABEL: Record<CategoriaGasto, string> = {
  limpieza: 'Limpieza',
  jardinero: 'Jardinero',
  lavanderia: 'Lavandería',
  expensas: 'Expensas',
  luz: 'Luz',
  gas: 'Gas',
  mantenimiento: 'Mantenimiento',
  internet: 'Internet',
  marketing: 'Marketing',
  impuestos: 'Impuestos',
  comision: 'Comisión',
  otro: 'Otro',
}

export const TITULARES_PAGADOR = ['Francisco', 'Milagros', 'Inés', 'Fernando', 'Paola'] as const

// Estado "visual" = estado_reserva + "terminada" (derivado de la fecha, nunca se guarda ni se elige)
export const ESTADO_VISUAL_LABEL: Record<string, string> = {
  tentativa: 'Tentativa',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  en_curso: 'En curso',
  terminada: 'Terminada',
}

export const ESTADO_VISUAL_BADGE: Record<string, string> = {
  confirmada: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  tentativa: 'bg-amber-50 text-amber-700 border border-amber-200',
  cancelada: 'bg-red-50 text-red-600 border border-red-200',
  en_curso: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  terminada: 'bg-slate-100 text-slate-500 border border-slate-200',
}

export const ESTADO_VISUAL_COLOR: Record<string, string> = {
  confirmada: 'text-emerald-600',
  tentativa: 'text-amber-600',
  cancelada: 'text-slate-400',
  en_curso: 'text-indigo-600',
  terminada: 'text-slate-500',
}
