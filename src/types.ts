export type Casa =
  | "Casa 1"
  | "Casa 2"
  | "Casa 3"
  | "Casa 4"
  | "Casa 5";

export type TipoIngreso =
  | "deposito_reserva"
  | "saldo_checkin"
  | "transferencia"
  | "efectivo"
  | "airbnb";

export type CategoriaGasto =
  | "limpieza"
  | "jardinero"
  | "lavanderia"
  | "expensas"
  | "luz"
  | "gas"
  | "mantenimiento"
  | "internet"
  | "marketing"
  | "impuestos"
  | "comision"
  | "otro";

export type Titular = "Francisco" | "Milagros" | "Inés" | "Fernando" | "Paola";

export interface DatosComprobante {
  fecha: string;
  monto: number;
  moneda: "ARS" | "USD";
  nombreOrdenante: string;
  nombreDestinatario: string;
  bancoOrigen: string;
  bancoDestino: string;
  cbuDestino: string;
  nroOperacion: string;
}

export interface Ingreso {
  id: string;
  fecha: string;
  casa: Casa;
  monto: number;
  moneda: "ARS" | "USD";
  tipo: "transferencia" | "efectivo";
  quienPago: string;
  nombreDestinatario: string;
  bancoDestino: string;
  nroOperacion: string;
  detalle: string;
  registradoPor: string;
  comprobanteUrl: string;
  timestamp: string;
  cotizacion: number;
  idReserva: string;
  tipoMovimiento: "adelanto" | "saldo" | "directo";
}

export interface Gasto {
  id: string;
  fecha: string;
  monto: number;
  moneda: "ARS" | "USD";
  categoria: string;
  pagadoPor: Titular;
  nombreDestinatario: string;
  bancoOrigen: string;
  nroOperacion: string;
  detalle: string;
  registradoPor: string;
  comprobanteUrl: string;
  timestamp: string;
  cotizacion: number;
}

export interface SaldoReal {
  fecha: string;
  titular: Titular;
  monto: number;
  timestamp: string;
}

export type EstadoPagoReserva = "ADELANTO_RECIBIDO" | "SALDO_RECIBIDO" | "COMPLETO" | "ANULADO";

export interface Reserva {
  id: string;               // TMP-YYYY-NNNN
  fechaRegistro: string;
  casa: Casa;
  titular: Titular;
  nombrePax: string;
  cantidadPax: number;
  cantidadNoches: number;
  fechaEntrada: string;
  fechaSalida: string;
  montoTotalUSD: number;
  montoAdelantoARS: number;
  montoAdelantoUSD: number;
  saldoUSD: number;
  estadoPago: EstadoPagoReserva;
  comprobanteUrl: string;
  registradoPor: string;
  timestamp: string;
  cotizacion: number;
  plataforma: "whatsapp_directo";
}

export const MENU_BOTONES = [
  { id: "menu_gasto",   title: "💸 Nuevo gasto" },
  { id: "menu_reserva", title: "📋 Gestionar reservas" },
  { id: "menu_saldos",  title: "📊 Saldos y reportes" },
  { id: "menu_otros",   title: "📎 Otros" },
];

export interface WaCtx {
  from: { id: string; name: string };
  text?: string;
  imageId?: string;
  documentId?: string;
  mimeType?: string;
  buttonId?: string;
  reply(text: string): Promise<void>;
  replyButtons(text: string, buttons: Array<{ id: string; title: string }>): Promise<void>;
  replyList(text: string, items: Array<{ id: string; title: string }>): Promise<void>;
}

// Estado de conversación para flujos multi-paso

export interface EstadoConversacion {
  paso: string;
  datos: Partial<Ingreso & Gasto & SaldoReal & DatosComprobante>;
  fileId?: string;
  corregido?: boolean;
}
