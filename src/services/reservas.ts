import { google } from "googleapis";
import { config, SHEETS } from "../config";
import { Reserva, EstadoPagoReserva, Casa, Titular } from "../types";

function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: config.googleClientEmail,
    key: config.googlePrivateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

const TAB = SHEETS.reservas;

async function leerFilas(): Promise<string[][]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${TAB}!A:N`,
  });
  return (res.data.values ?? []).slice(1);
}

// Genera el próximo ID numérico correlativo: 1, 2, 3...
export async function generarIdReserva(): Promise<string> {
  const filas = await leerFilas();
  let max = 0;
  for (const fila of filas) {
    const n = parseInt(fila[0] ?? "", 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return String(max + 1);
}

export interface ReservaPendiente {
  fila: number;
  id: string;
  casa: Casa;
  titular: Titular;
  nombrePax: string;
  fechaEntrada: string;
  fechaSalida: string;
  montoTotalUSD: number;
  saldoUSD: number;
  estadoPago: EstadoPagoReserva;
}

function parsearFechaSheet(s: string): Date | null {
  const [d, m, y] = (s ?? "").split("/").map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function inicioFinSemana(): { lunes: Date; domingo: Date } {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dow = hoy.getDay(); // 0=Dom
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - (dow === 0 ? 6 : dow - 1));
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  domingo.setHours(23, 59, 59, 999);
  return { lunes, domingo };
}

function toReservaPendiente(f: string[], fila: number): ReservaPendiente {
  return {
    fila,
    id: f[0],
    casa: f[2] as Casa,
    titular: f[3] as Titular,
    nombrePax: f[4] ?? "",
    fechaEntrada: f[7] ?? "",
    fechaSalida: f[8] ?? "",
    montoTotalUSD: parseFloat(f[9]) || 0,
    saldoUSD: parseFloat(f[12]) || 0,
    estadoPago: (f[13] ?? "ADELANTO_RECIBIDO") as EstadoPagoReserva,
  };
}

export async function listarReservasSemana(): Promise<ReservaPendiente[]> {
  const filas = await leerFilas();
  const { lunes, domingo } = inicioFinSemana();
  const result: ReservaPendiente[] = [];
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    if (!f[0] || f[13] === "COMPLETO") continue;
    const fecha = parsearFechaSheet(f[7]);
    if (fecha && fecha >= lunes && fecha <= domingo) {
      result.push(toReservaPendiente(f, i + 2));
    }
  }
  return result.sort((a, b) => {
    const fa = parsearFechaSheet(a.fechaEntrada);
    const fb = parsearFechaSheet(b.fechaEntrada);
    return (fa?.getTime() ?? 0) - (fb?.getTime() ?? 0);
  });
}

export async function buscarReservasPorNombre(nombre: string): Promise<ReservaPendiente[]> {
  const filas = await leerFilas();
  const norm = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const result: ReservaPendiente[] = [];
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    if (!f[0] || f[13] === "COMPLETO") continue;
    const pax = (f[4] ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (pax.includes(norm)) result.push(toReservaPendiente(f, i + 2));
  }
  return result;
}

export async function listarReservasPendientes(): Promise<ReservaPendiente[]> {
  const filas = await leerFilas();
  const result: ReservaPendiente[] = [];
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    if (!f[0] || f[13] === "COMPLETO") continue;
    result.push(toReservaPendiente(f, i + 2));
  }
  return result;
}

export async function registrarReserva(r: Reserva): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${TAB}!A:S`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        r.id,
        r.fechaRegistro,
        r.casa,
        r.titular,
        r.nombrePax,
        r.cantidadPax,
        r.cantidadNoches,
        r.fechaEntrada,
        r.fechaSalida,
        r.montoTotalUSD,
        r.montoAdelantoARS,
        r.montoAdelantoUSD,
        r.saldoUSD,
        r.estadoPago,
        r.comprobanteUrl,
        r.registradoPor,
        r.timestamp,
        r.cotizacion,
        r.plataforma,
      ]],
    },
  });
}

export interface ReservaEncontrada {
  fila: number;   // fila real en Sheets (1-indexed, incluye header)
  id: string;
  casa: Casa;
  titular: Titular;
  nombrePax: string;
  montoTotalUSD: number;
  saldoUSD: number;
  estadoPago: EstadoPagoReserva;
}

export async function buscarReservaPorId(id: string): Promise<ReservaEncontrada | null> {
  const filas = await leerFilas();
  for (let i = 0; i < filas.length; i++) {
    if (filas[i][0] === id) {
      return {
        fila: i + 2,
        id: filas[i][0],
        casa: filas[i][2] as Casa,
        titular: filas[i][3] as Titular,
        nombrePax: filas[i][4] ?? "",
        montoTotalUSD: parseFloat(filas[i][9]) || 0,
        saldoUSD: parseFloat(filas[i][12]) || 0,
        estadoPago: (filas[i][13] ?? "ADELANTO_RECIBIDO") as EstadoPagoReserva,
      };
    }
  }
  return null;
}

// Columnas editables: C=casa (índice 3), E=nombrePax (índice 5)
export type CampoReservaEditable = "casa" | "nombrePax";
const COLUMNA_CAMPO: Record<CampoReservaEditable, string> = { casa: "C", nombrePax: "E" };

export async function actualizarCampoReserva(
  fila: number,
  campo: CampoReservaEditable,
  valor: string
): Promise<void> {
  const sheets = getSheetsClient();
  const col = COLUMNA_CAMPO[campo];
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSheetId,
    range: `${TAB}!${col}${fila}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[valor]] },
  });
}

export async function registrarSaldoReserva(
  fila: number,
  estadoPago: EstadoPagoReserva,
  saldoRestanteUSD: number,
): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config.googleSheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${TAB}!M${fila}`, values: [[saldoRestanteUSD]] },
        { range: `${TAB}!N${fila}`, values: [[estadoPago]] },
      ],
    },
  });
}
