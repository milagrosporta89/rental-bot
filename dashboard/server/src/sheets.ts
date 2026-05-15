import { google } from "googleapis";
import { config } from "./config";

export interface IngresoRow {
  fecha: string;
  casa: string;
  monto: number;
  moneda: "ARS" | "USD";
  tipo: string;
  quienPago: string;
  nombreDestinatario: string;
  bancoOrigen: string;
  nroOperacion: string;
  notas: string;
  registradoPor: string;
  comprobanteUrl: string;
  timestamp: string;
  cotizacion: number;
  montoARS: number;
}

export interface GastoRow {
  fecha: string;
  monto: number;
  moneda: "ARS" | "USD";
  categoria: string;
  pagadoPor: string;
  nombreDestinatario: string;
  bancoOrigen: string;
  nroOperacion: string;
  notas: string;
  registradoPor: string;
  comprobanteUrl: string;
  timestamp: string;
  cotizacion: number;
  montoARS: number;
}

export interface SaldoRow {
  fecha: string;
  titular: string;
  monto: number;
  timestamp: string;
}

function getSheets() {
  const auth = new google.auth.JWT({
    email: config.googleClientEmail,
    key: config.googlePrivateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

function num(val: unknown): number {
  return parseFloat(String(val).replace(/\./g, "").replace(",", ".")) || 0;
}

function toARS(monto: number, moneda: string, cotizacion: number): number {
  return moneda === "USD" ? monto * cotizacion : monto;
}

export async function getIngresos(): Promise<IngresoRow[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: "Ingresos!A2:N",
  });
  return (res.data.values ?? [])
    .filter((r) => r[0])
    .map((r) => {
      const monto = num(r[2]);
      const moneda = (r[3] as "ARS" | "USD") || "ARS";
      const cotizacion = num(r[13]);
      return {
        fecha: r[0], casa: r[1], monto, moneda,
        tipo: r[4] || "", quienPago: r[5] || "",
        nombreDestinatario: r[6] || "", bancoOrigen: r[7] || "",
        nroOperacion: r[8] || "", notas: r[9] || "",
        registradoPor: r[10] || "", comprobanteUrl: r[11] || "",
        timestamp: r[12] || "", cotizacion,
        montoARS: toARS(monto, moneda, cotizacion),
      };
    });
}

export async function getGastos(): Promise<GastoRow[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: "Gastos!A2:M",
  });
  return (res.data.values ?? [])
    .filter((r) => r[0])
    .map((r) => {
      const monto = num(r[1]);
      const moneda = (r[2] as "ARS" | "USD") || "ARS";
      const cotizacion = num(r[12]);
      return {
        fecha: r[0], monto, moneda,
        categoria: r[3] || "", pagadoPor: r[4] || "",
        nombreDestinatario: r[5] || "", bancoOrigen: r[6] || "",
        nroOperacion: r[7] || "", notas: r[8] || "",
        registradoPor: r[9] || "", comprobanteUrl: r[10] || "",
        timestamp: r[11] || "", cotizacion,
        montoARS: toARS(monto, moneda, cotizacion),
      };
    });
}

export async function getSaldos(): Promise<SaldoRow[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: "SaldosReales!A2:D",
  });
  return (res.data.values ?? [])
    .filter((r) => r[0])
    .map((r) => ({
      fecha: r[0], titular: r[1],
      monto: num(r[2]), timestamp: r[3] || "",
    }));
}
