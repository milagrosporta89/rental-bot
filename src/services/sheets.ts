import { google } from "googleapis";
import { config, SHEETS } from "../config";
import { Ingreso, Gasto, SaldoReal, Titular } from "../types";

function getAuth() {
  return new google.auth.JWT({
    email: config.googleClientEmail,
    key: config.googlePrivateKey,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
}

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

export async function registrarIngreso(ingreso: Ingreso): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.ingresos}!A:N`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        ingreso.fecha,
        ingreso.casa,
        ingreso.monto,
        ingreso.moneda,
        ingreso.tipo,
        ingreso.quienPago,
        ingreso.nombreDestinatario ?? "",
        ingreso.bancoOrigen,
        ingreso.nroOperacion,
        ingreso.notas,
        ingreso.registradoPor,
        ingreso.comprobanteUrl,
        ingreso.timestamp,
        ingreso.cotizacion,
      ]],
    },
  });
}

export async function registrarGasto(gasto: Gasto): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.gastos}!A:M`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        gasto.fecha,
        gasto.monto,
        gasto.moneda,
        gasto.categoria,
        gasto.pagadoPor,
        gasto.nombreDestinatario,
        gasto.bancoOrigen,
        gasto.nroOperacion,
        gasto.notas,
        gasto.registradoPor,
        gasto.comprobanteUrl,
        gasto.timestamp,
        gasto.cotizacion,
      ]],
    },
  });
}

export async function buscarGastoDuplicado(nroOperacion: string): Promise<{
  fecha: string;
  categoria: string;
  monto: number;
  pagadoPor: string;
} | null> {
  if (!nroOperacion.trim()) return null;

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.gastos}!A:H`,
  });

  for (const fila of (res.data.values ?? []).slice(1)) {
    if (fila[7] === nroOperacion) {
      return {
        fecha: fila[0],
        categoria: fila[3],
        monto: parsearMonto(fila[1]),
        pagadoPor: fila[4],
      };
    }
  }

  return null;
}

export async function registrarSaldoReal(saldo: SaldoReal): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.saldosReales}!A:D`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        saldo.fecha,
        saldo.titular,
        saldo.monto,
        saldo.timestamp,
      ]],
    },
  });
}

function parsearMonto(valor: string): number {
  // Sheets puede devolver "57.178,6" (AR) o "57178.6" (EN)
  const limpio = String(valor).replace(/\./g, "").replace(",", ".");
  return parseFloat(limpio) || 0;
}

export async function buscarIngresoDuplicado(nroOperacion: string): Promise<{
  fecha: string;
  casa: string;
  monto: number;
  quienPago: string;
} | null> {
  if (!nroOperacion.trim()) return null;

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.ingresos}!A:I`,
  });

  for (const fila of (res.data.values ?? []).slice(1)) {
    if (fila[8] === nroOperacion) {
      return {
        fecha: fila[0],
        casa: fila[1],
        monto: parsearMonto(fila[2]),
        quienPago: fila[5],
      };
    }
  }

  return null;
}

export async function obtenerSaldos(): Promise<{
  reales: Record<string, { monto: number; fecha: string }>;
  calculados: Record<string, number>;
}> {
  const sheets = getSheetsClient();

  // Últimos saldos reales por titular
  const saldosRes = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.saldosReales}!A:C`,
  });

  const reales: Record<string, { monto: number; fecha: string }> = {};
  const filasSaldos = saldosRes.data.values ?? [];
  for (const fila of filasSaldos.slice(1)) {
    const [fecha, titular, monto] = fila;
    reales[titular] = { monto: Number(monto), fecha };
  }

  // Saldo calculado: suma ingresos - suma gastos por titular
  const ingresosRes = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.ingresos}!A:I`,
  });
  const gastosRes = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.gastos}!A:J`,
  });

  const calculados: Record<string, number> = {
    Francisco: 0,
    Milagros: 0,
    "Inés": 0,
    Fernando: 0,
  };

  // Ingresos suman al titular dueño de la casa (simplificado: se usa el campo casa)
  for (const fila of (ingresosRes.data.values ?? []).slice(1)) {
    const monto = Number(fila[2] ?? 0);
    const casa = fila[1] as string;
    const titular = titularDeCasa(casa);
    if (titular) calculados[titular] += monto;
  }

  // Gastos restan al que pagó
  for (const fila of (gastosRes.data.values ?? []).slice(1)) {
    const monto = Number(fila[1] ?? 0);
    const pagadoPor = fila[4] as Titular;
    if (pagadoPor && calculados[pagadoPor] !== undefined) {
      calculados[pagadoPor] -= monto;
    }
  }

  return { reales, calculados };
}

// Tabla de casas → titular (se puede mover a config cuando se definan los nombres reales)
function titularDeCasa(casa: string): Titular | null {
  const mapa: Record<string, Titular> = {
    "Casa 1": "Francisco",
    "Casa 2": "Francisco",
    "Casa 3": "Milagros",
    "Casa 4": "Milagros",
    "Casa 5": "Inés",
  };
  return mapa[casa] ?? null;
}
