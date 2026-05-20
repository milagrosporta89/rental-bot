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
    range: "Ingresos!A2:O",
  });
  return (res.data.values ?? [])
    .filter((r) => r[1])
    .map((r) => {
      const monto = num(r[3]);
      const moneda = (r[4] as "ARS" | "USD") || "ARS";
      const cotizacion = num(r[14]);
      return {
        fecha: r[1], casa: r[2], monto, moneda,
        tipo: r[5] || "", quienPago: r[6] || "",
        nombreDestinatario: r[7] || "", bancoOrigen: r[8] || "",
        nroOperacion: r[9] || "", notas: r[10] || "",
        registradoPor: r[11] || "", comprobanteUrl: r[12] || "",
        timestamp: r[13] || "", cotizacion,
        montoARS: toARS(monto, moneda, cotizacion),
      };
    });
}

export async function getGastos(): Promise<GastoRow[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: "Gastos!A2:N",
  });
  return (res.data.values ?? [])
    .filter((r) => r[1])
    .map((r) => {
      const monto = num(r[2]);
      const moneda = (r[3] as "ARS" | "USD") || "ARS";
      const cotizacion = num(r[13]);
      return {
        fecha: r[1], monto, moneda,
        categoria: r[4] || "", pagadoPor: r[5] || "",
        nombreDestinatario: r[6] || "", bancoOrigen: r[7] || "",
        nroOperacion: r[8] || "", notas: r[9] || "",
        registradoPor: r[10] || "", comprobanteUrl: r[11] || "",
        timestamp: r[12] || "", cotizacion,
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
