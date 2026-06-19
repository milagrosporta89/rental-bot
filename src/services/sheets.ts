import { google } from "googleapis";
import { config, SHEETS, titularDeCasa } from "../config";
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

function mesAnio(fecha: string): string {
  const [, m, y] = fecha.split("/");
  return `${y}-${m.padStart(2, "0")}`;
}

async function appendResumen(sheets: ReturnType<typeof getSheetsClient>, row: (string | number)[]): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: config.googleSheetId });
  const sheetMeta = (meta.data.sheets ?? []).find((s: any) => s.properties?.title === SHEETS.resumen) as any;
  if (!sheetMeta) return;

  const table = sheetMeta.tables?.[0] as any;
  if (!table) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.googleSheetId,
      range: `${SHEETS.resumen}!A:I`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
    return;
  }

  const { tableId, name, range } = table;
  const endRowIndex: number = range.endRowIndex;
  await Promise.all([
    sheets.spreadsheets.values.update({
      spreadsheetId: config.googleSheetId,
      range: `${SHEETS.resumen}!A${endRowIndex + 1}:I${endRowIndex + 1}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    }),
    sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.googleSheetId,
      requestBody: {
        requests: [{ updateTable: { table: { tableId, name, range: { ...range, endRowIndex: endRowIndex + 1, endColumnIndex: 9 } }, fields: "range" } }] as any,
      },
    }),
  ]);
}

export async function registrarIngreso(ingreso: Ingreso): Promise<void> {
  const sheets = getSheetsClient();
  const montoARS = ingreso.moneda === "USD" ? +(ingreso.monto * ingreso.cotizacion).toFixed(2) : ingreso.monto;
  const montoUSD = ingreso.moneda === "ARS" ? (ingreso.cotizacion > 0 ? +(ingreso.monto / ingreso.cotizacion).toFixed(2) : "") : ingreso.monto;
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.ingresos}!A:S`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        ingreso.id, ingreso.fecha, ingreso.casa, ingreso.monto, ingreso.moneda,
        ingreso.tipo, ingreso.quienPago, ingreso.nombreDestinatario ?? "",
        ingreso.bancoOrigen, ingreso.nroOperacion, ingreso.detalle,
        ingreso.registradoPor, ingreso.comprobanteUrl, ingreso.timestamp,
        ingreso.cotizacion, montoARS, montoUSD, ingreso.idReserva, ingreso.tipoMovimiento,
      ]],
    },
  });
  await appendResumen(sheets, [
    ingreso.fecha, "reserva", ingreso.detalle,
    montoARS, montoUSD !== "" ? montoUSD : 0,
    ingreso.nombreDestinatario ?? "", ingreso.quienPago, mesAnio(ingreso.fecha), ingreso.id,
  ]).catch(() => {});
}

export async function registrarGasto(gasto: Gasto): Promise<void> {
  const sheets = getSheetsClient();
  const montoARS = gasto.moneda === "USD" ? +(gasto.monto * gasto.cotizacion).toFixed(2) : gasto.monto;
  const montoUSD = gasto.moneda === "ARS" ? (gasto.cotizacion > 0 ? +(gasto.monto / gasto.cotizacion).toFixed(2) : 0) : gasto.monto;
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.gastos}!A:P`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        gasto.id, gasto.fecha, gasto.monto, gasto.moneda, gasto.categoria,
        gasto.pagadoPor, gasto.nombreDestinatario, gasto.bancoOrigen,
        gasto.nroOperacion, gasto.detalle, gasto.registradoPor,
        gasto.comprobanteUrl, gasto.timestamp, gasto.cotizacion,
        montoARS, montoUSD,
      ]],
    },
  });
  await appendResumen(sheets, [
    gasto.fecha, gasto.categoria, gasto.detalle,
    -montoARS, montoUSD !== 0 ? -montoUSD : 0,
    "", gasto.pagadoPor, mesAnio(gasto.fecha), gasto.id,
  ]).catch(() => {});
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
    range: `${SHEETS.gastos}!A:I`,
  });

  for (const fila of (res.data.values ?? []).slice(1)) {
    if (fila[8] === nroOperacion) {
      return {
        fecha: fila[1],
        categoria: fila[4],
        monto: parsearMonto(fila[2]),
        pagadoPor: fila[5],
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
    range: `${SHEETS.ingresos}!A:J`,
  });

  for (const fila of (res.data.values ?? []).slice(1)) {
    if (fila[9] === nroOperacion) {
      return {
        fecha: fila[1],
        casa: fila[2],
        monto: parsearMonto(fila[3]),
        quienPago: fila[6],
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
    range: `${SHEETS.ingresos}!A:E`,
  });
  const gastosRes = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.gastos}!A:F`,
  });

  const calculados: Record<string, number> = {
    Francisco: 0,
    Milagros: 0,
    "Inés": 0,
    Fernando: 0,
  };

  // Ingresos suman al titular dueño de la casa
  for (const fila of (ingresosRes.data.values ?? []).slice(1)) {
    const monto = Number(fila[3] ?? 0);
    const casa = fila[2] as string;
    const titular = titularDeCasa(casa);
    if (titular) calculados[titular] += monto;
  }

  // Gastos restan al que pagó
  for (const fila of (gastosRes.data.values ?? []).slice(1)) {
    const monto = Number(fila[2] ?? 0);
    const pagadoPor = fila[5] as Titular;
    if (pagadoPor && calculados[pagadoPor] !== undefined) {
      calculados[pagadoPor] -= monto;
    }
  }

  return { reales, calculados };
}

function mesKey(fecha: string): string {
  const [, mes, anio] = fecha.split("/");
  return `${anio}-${mes.padStart(2, "0")}`;
}


export async function obtenerBalancePaola(): Promise<{
  totalCobrado: number;
  totalGastado: number;
  balance: number;
  cobradoMes: number;
  gastadoMes: number;
}> {
  const sheets = getSheetsClient();
  const mesActual = mesKey(new Date().toLocaleDateString("es-AR"));

  const [ingresosRes, gastosRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: config.googleSheetId, range: `${SHEETS.ingresos}!A2:P` }),
    sheets.spreadsheets.values.get({ spreadsheetId: config.googleSheetId, range: `${SHEETS.gastos}!A2:O` }),
  ]);

  const ingresosPaola = (ingresosRes.data.values ?? []).filter(r => r[7]?.toLowerCase() === "paola");
  const gastosPaola   = (gastosRes.data.values ?? []).filter(r => r[5]?.toLowerCase() === "paola");

  const totalCobrado = Math.round(ingresosPaola.reduce((s, r) => s + parsearMonto(r[15]), 0));
  const totalGastado = Math.round(gastosPaola.reduce((s, r) => s + parsearMonto(r[14]), 0));
  const cobradoMes   = Math.round(ingresosPaola.filter(r => r[1] && mesKey(r[1]) === mesActual).reduce((s, r) => s + parsearMonto(r[15]), 0));
  const gastadoMes   = Math.round(gastosPaola.filter(r => r[1] && mesKey(r[1]) === mesActual).reduce((s, r) => s + parsearMonto(r[14]), 0));

  return { totalCobrado, totalGastado, balance: totalCobrado - totalGastado, cobradoMes, gastadoMes };
}

// ── Últimos gastos ────────────────────────────────────────────────────────────

export async function obtenerUltimosGastos(n: number): Promise<Array<{
  id: string; fecha: string; monto: number; moneda: string;
  categoria: string; pagadoPor: string; detalle: string; rowIndex: number;
}>> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.gastos}!A:J`,
  });
  const filas = (res.data.values ?? []).slice(1).filter(r => r[0]);
  return filas.slice(-n).reverse().map((r, i) => ({
    id: r[0],
    fecha: r[1] ?? "",
    monto: parsearMonto(r[2]),
    moneda: r[3] ?? "",
    categoria: r[4] ?? "",
    pagadoPor: r[5] ?? "",
    detalle: r[9] ?? "",
    rowIndex: filas.length - i + 1, // +1 por header
  }));
}

// ── Corrección de gastos ──────────────────────────────────────────────────────

// Columnas Gastos: 0=id 1=fecha 2=monto 3=moneda 4=categoria 5=pagadoPor 9=detalle
const COL_GASTO: Record<string, string> = { categoria: "E", detalle: "J", fecha: "B", monto: "C" };

export async function buscarGastoPorId(id: string): Promise<{
  rowIndex: number; // 1-based, incluye header → fila real en Sheet
  fecha: string;
  monto: number;
  moneda: string;
  categoria: string;
  pagadoPor: string;
  detalle: string;
} | null> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.gastos}!A:J`,
  });
  const filas = res.data.values ?? [];
  for (let i = 1; i < filas.length; i++) {
    if (filas[i][0] === id) {
      return {
        rowIndex: i + 1,
        fecha: filas[i][1] ?? "",
        monto: parsearMonto(filas[i][2]),
        moneda: filas[i][3] ?? "",
        categoria: filas[i][4] ?? "",
        pagadoPor: filas[i][5] ?? "",
        detalle: filas[i][9] ?? "",
      };
    }
  }
  return null;
}

export async function actualizarCampoGasto(
  rowIndex: number,
  campo: string,
  valorNuevo: string
): Promise<void> {
  const col = COL_GASTO[campo];
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.gastos}!${col}${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[valorNuevo]] },
  });
}

export async function registrarAudit(entry: {
  idRegistro: string;
  tipoRegistro: string;
  campo: string;
  valorAnterior: string;
  valorNuevo: string;
  modificadoPor: string;
  aprobadoPor: string;
}): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.historial}!A:H`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        new Date().toISOString(),
        entry.idRegistro,
        entry.tipoRegistro,
        entry.campo,
        entry.valorAnterior,
        entry.valorNuevo,
        entry.modificadoPor,
        entry.aprobadoPor,
      ]],
    },
  });
}


