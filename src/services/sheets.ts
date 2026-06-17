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
    range: `${SHEETS.ingresos}!A:S`,
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
        ingreso.idReserva,
        ingreso.tipoMovimiento,
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

function mesActualKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toDateReporte(fechaStr: string): Date {
  const [d, m, a] = fechaStr.split("/").map(Number);
  return new Date(a < 100 ? 2000 + a : a, m - 1, d);
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

// ── Reporte en vivo ───────────────────────────────────────────────────────────

export interface DatosReporte {
  mesActual: string;
  mesPrevio: string;
  generadoEn: string;
  totIng: { ars: number; usd: number };
  totIngAnt: { ars: number; usd: number };
  totGas: number;
  totGasAnt: number;
  balNeto: number;
  ingPorCasa: Record<string, { ars: number; usd: number }>;
  gasPorCat: Record<string, number>;
  resumenTit: Record<string, { ingresos: number; gastos: number }>;
  reservasProx: Array<{
    casa: string; nombrePax: string; fechaEntrada: string;
    fechaSalida: string; cantidadNoches: string;
    montoTotalUSD: number; estadoPago: string;
  }>;
  comision: {
    cobradoMes: number; gastadoMes: number;
    totalCobrado: number; totalGastado: number; balance: number;
  };
  ingresos: Array<{
    fecha: string; casa: string; monto: number; moneda: string;
    montoARS: number; montoUSD: number; quienPago: string; tipo: string; detalle: string;
  }>;
  gastos: Array<{
    id: string; fecha: string; categoria: string; monto: number; moneda: string;
    montoARS: number; pagadoPor: string; detalle: string;
  }>;
}

export async function obtenerDatosReporte(): Promise<DatosReporte> {
  const sheets = getSheetsClient();

  async function getRange(range: string): Promise<string[][]> {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: config.googleSheetId, range });
    return (res.data.values ?? []).slice(1).filter(r => r.some(c => c));
  }

  const [ingresosRaw, gastosRaw, reservasRaw] = await Promise.all([
    getRange("Ingresos!A:Q"),
    getRange("Gastos!A:P"),
    getRange("Reservas!A:S"),
  ]);

  const mesActual = mesActualKey();
  const mesPrev = mesPrevio(mesActual);

  const ingresosMes = ingresosRaw.filter(r => r[1] && mesKey(r[1]) === mesActual);
  const ingresosAnt = ingresosRaw.filter(r => r[1] && mesKey(r[1]) === mesPrev);
  const gastosMes   = gastosRaw.filter(r => r[1] && mesKey(r[1]) === mesActual);
  const gastosAnt   = gastosRaw.filter(r => r[1] && mesKey(r[1]) === mesPrev);

  function sumarIngARS(filas: string[][]): { ars: number; usd: number } {
    let ars = 0, usd = 0;
    for (const r of filas) {
      const m = parsearMonto(r[3]);
      if (r[4] === "USD") {
        usd += m;
        ars += parsearMonto(r[15]) || m * parsearMonto(r[14]);
      } else {
        ars += m;
      }
    }
    return { ars, usd };
  }

  function sumarGasARS(filas: string[][]): number {
    return filas.reduce((s, r) => {
      const m = parsearMonto(r[2]);
      return s + (r[3] === "USD" ? (parsearMonto(r[14]) || m * parsearMonto(r[13])) : m);
    }, 0);
  }

  const totIng    = sumarIngARS(ingresosMes);
  const totIngAnt = sumarIngARS(ingresosAnt);
  const totGas    = sumarGasARS(gastosMes);
  const totGasAnt = sumarGasARS(gastosAnt);

  const ingPorCasa: Record<string, { ars: number; usd: number }> = {};
  for (const r of ingresosMes) {
    const casa = r[2] ?? "";
    if (!ingPorCasa[casa]) ingPorCasa[casa] = { ars: 0, usd: 0 };
    const m = parsearMonto(r[3]);
    if (r[4] === "USD") {
      ingPorCasa[casa].usd += m;
      ingPorCasa[casa].ars += parsearMonto(r[15]) || m * parsearMonto(r[14]);
    } else {
      ingPorCasa[casa].ars += m;
    }
  }

  const gasPorCat: Record<string, number> = {};
  for (const r of gastosMes) {
    const cat = (r[4] ?? "otro").toLowerCase();
    const m = parsearMonto(r[2]);
    const montoARS = r[3] === "USD" ? (parsearMonto(r[14]) || m * parsearMonto(r[13])) : m;
    gasPorCat[cat] = (gasPorCat[cat] ?? 0) + montoARS;
  }

  const casosPorTit: Record<string, string[]> = {
    Francisco: ["Casa 1", "Casa 2"],
    Milagros:  ["Casa 3", "Casa 4"],
    "Inés":    ["Casa 5"],
  };
  const resumenTit: Record<string, { ingresos: number; gastos: number }> = {};
  for (const [tit, casas] of Object.entries(casosPorTit)) {
    resumenTit[tit] = {
      ingresos: sumarIngARS(ingresosMes.filter(r => casas.includes(r[2]))).ars,
      gastos:   sumarGasARS(gastosMes.filter(r => r[5] === tit)),
    };
  }

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const en30 = new Date(hoy); en30.setDate(en30.getDate() + 30);
  const reservasProx = reservasRaw
    .filter(r => {
      if (!r[7]) return false;
      try { const d = toDateReporte(r[7]); return d >= hoy && d <= en30; } catch { return false; }
    })
    .sort((a, b) => toDateReporte(a[7]).getTime() - toDateReporte(b[7]).getTime())
    .map(r => ({
      casa: r[2] ?? "",
      nombrePax: r[4] ?? "",
      fechaEntrada: r[7] ?? "",
      fechaSalida: r[8] ?? "",
      cantidadNoches: r[6] ?? "",
      montoTotalUSD: parsearMonto(r[9]),
      estadoPago: r[13] ?? "",
    }));

  const ingresosPaola = ingresosRaw.filter(r => r[7]?.toLowerCase() === "paola");
  const gastosPaola   = gastosRaw.filter(r => r[5]?.toLowerCase() === "paola");
  const cobradoMes    = Math.round(ingresosPaola.filter(r => r[1] && mesKey(r[1]) === mesActual).reduce((s, r) => s + parsearMonto(r[15]), 0));
  const gastadoMes    = Math.round(gastosPaola.filter(r => r[1] && mesKey(r[1]) === mesActual).reduce((s, r) => s + parsearMonto(r[14]), 0));
  const totalCobrado  = Math.round(ingresosPaola.reduce((s, r) => s + parsearMonto(r[15]), 0));
  const totalGastado  = Math.round(gastosPaola.reduce((s, r) => s + parsearMonto(r[14]), 0));

  return {
    mesActual,
    mesPrevio: mesPrev,
    generadoEn: new Date().toISOString(),
    totIng,
    totIngAnt,
    totGas,
    totGasAnt,
    balNeto: totIng.ars - totGas,
    ingPorCasa,
    gasPorCat,
    resumenTit,
    reservasProx,
    comision: { cobradoMes, gastadoMes, totalCobrado, totalGastado, balance: totalCobrado - totalGastado },
    ingresos: ingresosMes.map(r => ({
      fecha: r[1] ?? "", casa: r[2] ?? "",
      monto: parsearMonto(r[3]), moneda: r[4] ?? "",
      montoARS: parsearMonto(r[15]), montoUSD: parsearMonto(r[16]),
      quienPago: r[6] ?? "", tipo: r[5] ?? "", detalle: r[10] ?? "",
    })),
    gastos: gastosRaw.map(r => ({
      id: r[0] ?? "", fecha: r[1] ?? "", categoria: r[4] ?? "",
      monto: parsearMonto(r[2]), moneda: r[3] ?? "",
      montoARS: parsearMonto(r[14]), pagadoPor: r[5] ?? "", detalle: r[9] ?? "",
    })),
  };
}

