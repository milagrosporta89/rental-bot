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
  | "otro";

export type Titular = "Francisco" | "Milagros" | "Inés" | "Fernando";

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
  fecha: string;
  casa: Casa;
  monto: number;
  moneda: "ARS" | "USD";
  tipo: TipoIngreso;
  quienPago: string;
  nombreDestinatario: string;
  bancoOrigen: string;
  nroOperacion: string;
  notas: string;
  registradoPor: string;
  comprobanteUrl: string;
  timestamp: string;
  cotizacion: number;
}

export interface Gasto {
  fecha: string;
  monto: number;
  moneda: "ARS" | "USD";
  categoria: string;
  pagadoPor: Titular;
  nombreDestinatario: string;
  bancoOrigen: string;
  nroOperacion: string;
  notas: string;
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
  answerCallbackQuery(): Promise<void>;
}

// Estado de conversación para flujos multi-paso

export interface EstadoConversacion {
  paso: string;
  datos: Partial<Ingreso & Gasto & SaldoReal & DatosComprobante>;
  fileId?: string;
  corregido?: boolean;
}
