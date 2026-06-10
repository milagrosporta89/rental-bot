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

export async function registrarIngreso(ingreso: Ingreso): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.ingresos}!A:Q`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        ingreso.id,
        ingreso.fecha,
        ingreso.casa,
        ingreso.monto,
        ingreso.moneda,
        ingreso.tipo,
        ingreso.quienPago,
        ingreso.nombreDestinatario ?? "",
        ingreso.bancoOrigen,
        ingreso.nroOperacion,
        ingreso.detalle,
        ingreso.registradoPor,
        ingreso.comprobanteUrl,
        ingreso.timestamp,
        ingreso.cotizacion,
        ingreso.moneda === "USD" ? +(ingreso.monto * ingreso.cotizacion).toFixed(2) : ingreso.monto,
        ingreso.moneda === "ARS" ? (ingreso.cotizacion > 0 ? +(ingreso.monto / ingreso.cotizacion).toFixed(2) : "") : ingreso.monto,
      ]],
    },
  });
}

export async function registrarGasto(gasto: Gasto): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.gastos}!A:P`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        gasto.id,
        gasto.fecha,
        gasto.monto,
        gasto.moneda,
        gasto.categoria,
        gasto.pagadoPor,
        gasto.nombreDestinatario,
        gasto.bancoOrigen,
        gasto.nroOperacion,
        gasto.detalle,
        gasto.registradoPor,
        gasto.comprobanteUrl,
        gasto.timestamp,
        gasto.cotizacion,
        gasto.moneda === "USD" ? +(gasto.monto * gasto.cotizacion).toFixed(2) : gasto.monto,
        gasto.moneda === "ARS" ? (gasto.cotizacion > 0 ? +(gasto.monto / gasto.cotizacion).toFixed(2) : "") : gasto.monto,
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

function mesPrevio(mesActual: string): string {
  const [anio, mes] = mesActual.split("-").map(Number);
  const d = new Date(anio, mes - 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function registrarReembolso(fecha: string, monto: number, descripcion: string, timestamp: string): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.reembolsosPaola}!A:D`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[fecha, monto, descripcion, timestamp]] },
  });
}

export async function registrarComision(
  monto: number,
  descripcion: string,
  timestamp: string,
  cotizacion = 0,
  tipo: "cobro" | "gasto" = "cobro"
): Promise<void> {
  const sheets = getSheetsClient();
  const mes = mesKey(new Date().toLocaleDateString("es-AR"));
  const montoFinal = tipo === "gasto" ? -Math.abs(monto) : Math.abs(monto);
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${SHEETS.comisiones}!A:F`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[mes, montoFinal, tipo, descripcion, timestamp, cotizacion]] },
  });
}

export async function obtenerResumenComision(): Promise<{
  mesBase: string;
  baseIngresos: number;
  comisionMes: number;
  cobradosMes: number;
  gastosMes: number;
  netMes: number;
  pendienteMes: number;
  totalComisionFormal: number;
  totalCobrosDirectos: number;
  totalGastosHistorico: number;
  superavit: number;
}> {
  const sheets = getSheetsClient();
  const mesActual = mesKey(new Date().toLocaleDateString("es-AR"));
  const base = mesPrevio(mesActual);

  const [ingresosRes, comisionesRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: config.googleSheetId, range: `${SHEETS.ingresos}!A2:Q` }),
    sheets.spreadsheets.values.get({ spreadsheetId: config.googleSheetId, range: `${SHEETS.comisiones}!A2:F` }),
  ]);

  // ── Ingresos del mes anterior ─────────────────────────────────────────────
  const baseIngresos = (ingresosRes.data.values ?? [])
    .filter((r) => r[1] && mesKey(r[1]) === base)
    .reduce((sum, r) => sum + (parsearMonto(r[15]) || parsearMonto(r[3])), 0);
  const comisionMes = Math.round(baseIngresos * 0.15);

  const filasCom = comisionesRes.data.values ?? [];

  // ── Este mes: cobros y gastos por separado ────────────────────────────────
  const filasMes = filasCom.filter((r) => r[0] === mesActual);
  const cobradosMes = Math.round(filasMes.filter(r => parsearMonto(r[1]) > 0).reduce((s, r) => s + parsearMonto(r[1]), 0));
  const gastosMes   = Math.round(filasMes.filter(r => parsearMonto(r[1]) < 0).reduce((s, r) => s + Math.abs(parsearMonto(r[1])), 0));
  const netMes = cobradosMes - gastosMes;

  // ── Histórico: comisiones formales, cobros directos, gastos ───────────────
  const totalComisionFormal = Math.round(
    filasCom.filter(r => r[2] === "cobro" && r[3]?.toLowerCase().includes("comisi"))
             .reduce((s, r) => s + parsearMonto(r[1]), 0)
  );
  const totalCobrosDirectos = Math.round(
    filasCom.filter(r => r[2] === "cobro" && !r[3]?.toLowerCase().includes("comisi"))
             .reduce((s, r) => s + parsearMonto(r[1]), 0)
  );
  const totalGastosHistorico = Math.round(
    filasCom.filter(r => parsearMonto(r[1]) < 0)
             .reduce((s, r) => s + Math.abs(parsearMonto(r[1])), 0)
  );
  // Superávit = lo cobrado neto menos las comisiones formales ya liquidadas
  const superavit = Math.round(totalCobrosDirectos + totalComisionFormal - totalGastosHistorico - totalComisionFormal);

  return {
    mesBase: base,
    baseIngresos: Math.round(baseIngresos),
    comisionMes,
    cobradosMes,
    gastosMes,
    netMes,
    pendienteMes: Math.round(comisionMes - netMes),
    totalComisionFormal,
    totalCobrosDirectos,
    totalGastosHistorico,
    superavit: Math.round(totalCobrosDirectos - totalGastosHistorico),
  };
}

