import "dotenv/config";
import { google } from "googleapis";
import axios from "axios";

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL!,
  key: process.env.GOOGLE_PRIVATE_KEY!.replace(/^["']|["'],?\s*$/g, "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

const cotCache = new Map<string, number>();

async function getCotizacion(fecha: string): Promise<number> {
  const [dia, mes, anio] = fecha.split("/");
  const isoDate = `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
  if (cotCache.has(isoDate)) return cotCache.get(isoDate)!;
  const res = await axios.get<{ oficial: { value_sell: number } }>(
    `https://api.bluelytics.com.ar/v2/historical?day=${isoDate}`,
    { timeout: 5000 }
  );
  const valor = res.data.oficial.value_sell;
  cotCache.set(isoDate, valor);
  return valor;
}

function ts(fecha: string, hora: string) { return `${fecha} ${hora}`; }

// ─── INGRESOS (sin cotizacion — se agrega en seed()) ─────────────────────────
// cols: fecha, casa, monto, moneda, tipo, quienPago, destinatario, banco, nroOp, notas, registradoPor, comprobanteUrl, timestamp

const ingresosBase = [
  ["10/03/2026","Casa 1",180000,"ARS","deposito_reserva","Valentina Rodríguez","Francisco","Banco Galicia","OP-001-2603","50% reserva","@miliporta","",ts("10/03/2026","09:14")],
  ["22/03/2026","Casa 1",180000,"ARS","saldo_checkin","Valentina Rodríguez","Francisco","Banco Galicia","OP-002-2603","Saldo check-in","@miliporta","",ts("22/03/2026","11:02")],
  ["01/04/2026","Casa 1",210000,"ARS","deposito_reserva","Lucas Martínez","Francisco","BBVA","OP-003-0104","50% reserva","@miliporta","",ts("01/04/2026","10:30")],
  ["14/04/2026","Casa 1",210000,"ARS","saldo_checkin","Lucas Martínez","Francisco","BBVA","OP-004-1404","Saldo check-in","@miliporta","",ts("14/04/2026","14:15")],
  ["20/04/2026","Casa 1",500,"USD","deposito_reserva","James Wilson","Francisco","Wise","OP-005-2004","50% reserva USD","@miliporta","",ts("20/04/2026","09:00")],
  ["02/05/2026","Casa 1",500,"USD","saldo_checkin","James Wilson","Francisco","Wise","OP-006-0205","Saldo check-in USD","@miliporta","",ts("02/05/2026","12:00")],
  ["05/03/2026","Casa 2",140000,"ARS","deposito_reserva","Sofía González","Francisco","Santander","OP-007-0503","50% reserva","@miliporta","",ts("05/03/2026","16:20")],
  ["18/03/2026","Casa 2",140000,"ARS","saldo_checkin","Sofía González","Francisco","Santander","OP-008-1803","Saldo check-in","@miliporta","",ts("18/03/2026","10:45")],
  ["25/03/2026","Casa 2",160000,"ARS","deposito_reserva","Mateo López","Francisco","Brubank","OP-009-2503","50% reserva","@miliporta","",ts("25/03/2026","11:30")],
  ["07/04/2026","Casa 2",160000,"ARS","saldo_checkin","Mateo López","Francisco","Brubank","OP-010-0704","Saldo check-in","@miliporta","",ts("07/04/2026","09:50")],
  ["28/04/2026","Casa 2",175000,"ARS","deposito_reserva","Camila Fernández","Francisco","Mercado Pago","OP-011-2804","50% reserva","@miliporta","",ts("28/04/2026","17:05")],
  ["08/03/2026","Casa 3",120000,"ARS","deposito_reserva","Diego Sánchez","Milagros","ICBC","OP-012-0803","50% reserva","@miliporta","",ts("08/03/2026","08:55")],
  ["21/03/2026","Casa 3",120000,"ARS","saldo_checkin","Diego Sánchez","Milagros","ICBC","OP-013-2103","Saldo check-in","@miliporta","",ts("21/03/2026","13:10")],
  ["02/04/2026","Casa 3",400,"USD","deposito_reserva","Carolina Bianchi","Milagros","Ualá","OP-014-0204","50% reserva USD","@miliporta","",ts("02/04/2026","10:00")],
  ["16/04/2026","Casa 3",400,"USD","saldo_checkin","Carolina Bianchi","Milagros","Ualá","OP-015-1604","Saldo check-in USD","@miliporta","",ts("16/04/2026","11:30")],
  ["22/04/2026","Casa 3",135000,"ARS","deposito_reserva","Ana Pérez","Milagros","Naranja X","OP-016-2204","50% reserva","@miliporta","",ts("22/04/2026","09:40")],
  ["05/05/2026","Casa 3",135000,"ARS","saldo_checkin","Ana Pérez","Milagros","Naranja X","OP-017-0505","Saldo check-in","@miliporta","",ts("05/05/2026","14:20")],
  ["12/03/2026","Casa 4",155000,"ARS","deposito_reserva","Santiago García","Milagros","Banco Galicia","OP-018-1203","50% reserva","@miliporta","",ts("12/03/2026","10:15")],
  ["25/03/2026","Casa 4",155000,"ARS","saldo_checkin","Santiago García","Milagros","Banco Galicia","OP-019-2503","Saldo check-in","@miliporta","",ts("25/03/2026","12:00")],
  ["10/04/2026","Casa 4",190000,"ARS","deposito_reserva","Luciana Torres","Milagros","BBVA","OP-020-1004","50% reserva","@miliporta","",ts("10/04/2026","16:45")],
  ["24/04/2026","Casa 4",190000,"ARS","saldo_checkin","Luciana Torres","Milagros","BBVA","OP-021-2404","Saldo check-in","@miliporta","",ts("24/04/2026","10:10")],
  ["01/05/2026","Casa 4",450,"USD","deposito_reserva","Roberto Álvarez","Milagros","Wise","OP-022-0105","50% reserva USD","@miliporta","",ts("01/05/2026","09:00")],
  ["03/03/2026","Casa 5",130000,"ARS","deposito_reserva","María Díaz","Inés","Santander","OP-023-0303","50% reserva","@miliporta","",ts("03/03/2026","11:00")],
  ["17/03/2026","Casa 5",130000,"ARS","saldo_checkin","María Díaz","Inés","Santander","OP-024-1703","Saldo check-in","@miliporta","",ts("17/03/2026","09:30")],
  ["30/03/2026","Casa 5",145000,"ARS","deposito_reserva","Facundo Ruiz","Inés","Brubank","OP-025-3003","50% reserva","@miliporta","",ts("30/03/2026","14:00")],
  ["12/04/2026","Casa 5",145000,"ARS","saldo_checkin","Facundo Ruiz","Inés","Brubank","OP-026-1204","Saldo check-in","@miliporta","",ts("12/04/2026","10:50")],
  ["18/04/2026","Casa 5",165000,"ARS","deposito_reserva","Gabriela Morales","Inés","Mercado Pago","OP-027-1804","50% reserva","@miliporta","",ts("18/04/2026","17:30")],
  ["02/05/2026","Casa 5",165000,"ARS","saldo_checkin","Gabriela Morales","Inés","Mercado Pago","OP-028-0205","Saldo check-in","@miliporta","",ts("02/05/2026","11:15")],
  ["06/05/2026","Casa 5",350,"USD","deposito_reserva","Pierre Dupont","Inés","Wise","OP-029-0605","50% reserva USD","@miliporta","",ts("06/05/2026","08:45")],
  ["09/05/2026","Casa 2",175000,"ARS","saldo_checkin","Camila Fernández","Francisco","Mercado Pago","OP-030-0905","Saldo check-in","@miliporta","",ts("09/05/2026","13:00")],
];

// ─── GASTOS (sin cotizacion) ──────────────────────────────────────────────────
// cols: fecha, monto, moneda, categoria, pagadoPor, destinatario, banco, nroOp, notas, registradoPor, comprobanteUrl, timestamp

const gastosBase = [
  ["11/03/2026",18000,"ARS","limpieza","Milagros","Valeria Limpieza","Mercado Pago","G-001-1103","Casa 3 post-salida","@miliporta","",ts("11/03/2026","12:00")],
  ["22/03/2026",18000,"ARS","limpieza","Francisco","Valeria Limpieza","Mercado Pago","G-002-2203","Casa 1 post-salida","@miliporta","",ts("22/03/2026","13:00")],
  ["26/03/2026",16000,"ARS","limpieza","Milagros","Valeria Limpieza","Mercado Pago","G-003-2603","Casa 4 post-salida","@miliporta","",ts("26/03/2026","11:00")],
  ["18/03/2026",16000,"ARS","limpieza","Inés","Valeria Limpieza","Mercado Pago","G-004-1803","Casa 5 post-salida","@miliporta","",ts("18/03/2026","10:00")],
  ["15/04/2026",20000,"ARS","limpieza","Francisco","Valeria Limpieza","Mercado Pago","G-005-1504","Casa 1 post-salida","@miliporta","",ts("15/04/2026","12:30")],
  ["17/04/2026",18000,"ARS","limpieza","Milagros","Valeria Limpieza","Mercado Pago","G-006-1704","Casa 3 post-salida","@miliporta","",ts("17/04/2026","11:00")],
  ["13/04/2026",17000,"ARS","limpieza","Inés","Valeria Limpieza","Mercado Pago","G-007-1304","Casa 5 post-salida","@miliporta","",ts("13/04/2026","10:00")],
  ["05/03/2026",65000,"ARS","expensas","Francisco","Consorcio Edificio A","Banco Galicia","G-008-0503","Expensas marzo Casa 1","@miliporta","",ts("05/03/2026","09:00")],
  ["05/03/2026",58000,"ARS","expensas","Milagros","Consorcio Edificio B","Banco Galicia","G-009-0503","Expensas marzo Casa 3","@miliporta","",ts("05/03/2026","09:15")],
  ["05/03/2026",62000,"ARS","expensas","Inés","Consorcio Edificio C","Santander","G-010-0503","Expensas marzo Casa 5","@miliporta","",ts("05/03/2026","09:30")],
  ["07/04/2026",68000,"ARS","expensas","Francisco","Consorcio Edificio A","Banco Galicia","G-011-0704","Expensas abril Casa 1","@miliporta","",ts("07/04/2026","09:00")],
  ["07/04/2026",61000,"ARS","expensas","Milagros","Consorcio Edificio B","Banco Galicia","G-012-0704","Expensas abril Casa 3","@miliporta","",ts("07/04/2026","09:15")],
  ["07/04/2026",64000,"ARS","expensas","Inés","Consorcio Edificio C","Santander","G-013-0704","Expensas abril Casa 5","@miliporta","",ts("07/04/2026","09:30")],
  ["10/03/2026",28000,"ARS","luz","Francisco","EDESUR","Banco Galicia","G-014-1003","Luz Casa 1 marzo","@miliporta","",ts("10/03/2026","10:00")],
  ["10/03/2026",24000,"ARS","luz","Milagros","EDESUR","Banco Galicia","G-015-1003","Luz Casa 3 marzo","@miliporta","",ts("10/03/2026","10:10")],
  ["10/04/2026",31000,"ARS","luz","Francisco","EDESUR","Banco Galicia","G-016-1004","Luz Casa 1 abril","@miliporta","",ts("10/04/2026","10:00")],
  ["10/04/2026",26000,"ARS","luz","Inés","EDESUR","Santander","G-017-1004","Luz Casa 5 abril","@miliporta","",ts("10/04/2026","10:15")],
  ["12/03/2026",35000,"ARS","gas","Francisco","Metrogas","BBVA","G-018-1203","Gas Casa 2 marzo","@miliporta","",ts("12/03/2026","11:00")],
  ["12/03/2026",40000,"ARS","gas","Milagros","Metrogas","BBVA","G-019-1203","Gas Casa 4 marzo","@miliporta","",ts("12/03/2026","11:10")],
  ["14/04/2026",38000,"ARS","gas","Francisco","Metrogas","BBVA","G-020-1404","Gas Casa 2 abril","@miliporta","",ts("14/04/2026","11:00")],
  ["14/04/2026",43000,"ARS","gas","Inés","Metrogas","Santander","G-021-1404","Gas Casa 5 abril","@miliporta","",ts("14/04/2026","11:15")],
  ["15/03/2026",45000,"ARS","jardinero","Fernando","Carlos Jardines","Efectivo","G-022-1503","Jardín Casa 1 y 2 marzo","@miliporta","",ts("15/03/2026","16:00")],
  ["15/04/2026",48000,"ARS","jardinero","Fernando","Carlos Jardines","Efectivo","G-023-1504","Jardín Casa 1 y 2 abril","@miliporta","",ts("15/04/2026","16:00")],
  ["20/03/2026",85000,"ARS","mantenimiento","Francisco","Plomería Rápida SRL","Banco Galicia","G-024-2003","Reparación caño Casa 1","@miliporta","",ts("20/03/2026","14:00")],
  ["08/04/2026",120000,"ARS","mantenimiento","Milagros","Electricidad Total","Mercado Pago","G-025-0804","Tablero eléctrico Casa 4","@miliporta","",ts("08/04/2026","15:30")],
  ["25/04/2026",55000,"ARS","mantenimiento","Inés","Pinturería del Sur","Naranja X","G-026-2504","Pintura exterior Casa 5","@miliporta","",ts("25/04/2026","10:00")],
  ["30/04/2026",75000,"ARS","mantenimiento","Francisco","Cerrajería Central","Brubank","G-027-3004","Cambio cerradura Casa 2","@miliporta","",ts("30/04/2026","09:00")],
  ["19/03/2026",12000,"ARS","lavanderia","Milagros","Lavandería Express","Mercado Pago","G-028-1903","Ropa de cama Casa 3","@miliporta","",ts("19/03/2026","12:00")],
  ["02/04/2026",14000,"ARS","lavanderia","Francisco","Lavandería Express","Mercado Pago","G-029-0204","Ropa de cama Casa 1 y 2","@miliporta","",ts("02/04/2026","12:00")],
  ["28/04/2026",13000,"ARS","lavanderia","Inés","Lavandería Express","Mercado Pago","G-030-2804","Ropa de cama Casa 5","@miliporta","",ts("28/04/2026","12:00")],
];

// ─── SALDOS REALES ───────────────────────────────────────────────────────────
const saldosReales = [
  ["01/03/2026","Francisco",850000,ts("01/03/2026","10:00")],
  ["01/03/2026","Milagros",620000,ts("01/03/2026","10:05")],
  ["01/03/2026","Inés",490000,ts("01/03/2026","10:10")],
  ["01/04/2026","Francisco",1120000,ts("01/04/2026","09:30")],
  ["01/04/2026","Milagros",880000,ts("01/04/2026","09:35")],
  ["01/04/2026","Inés",710000,ts("01/04/2026","09:40")],
  ["01/05/2026","Francisco",1380000,ts("01/05/2026","09:00")],
  ["01/05/2026","Milagros",1050000,ts("01/05/2026","09:05")],
  ["01/05/2026","Inés",830000,ts("01/05/2026","09:10")],
  ["10/05/2026","Francisco",1290000,ts("10/05/2026","11:00")],
];

async function seed() {
  console.log("Obteniendo cotizaciones históricas...");
  const ingresos = await Promise.all(
    ingresosBase.map(async (row) => [...row, await getCotizacion(row[0] as string)])
  );
  const gastos = await Promise.all(
    gastosBase.map(async (row) => [...row, await getCotizacion(row[0] as string)])
  );
  console.log("✓ Cotizaciones obtenidas");

  console.log("Limpiando datos anteriores...");
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: "Ingresos!A2:Z1000" });
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: "Gastos!A2:Z1000" });
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: "SaldosReales!A2:Z1000" });
  console.log("✓ Limpieza completa");

  console.log("Insertando ingresos...");
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: "Ingresos!A:N",
    valueInputOption: "USER_ENTERED", requestBody: { values: ingresos },
  });
  console.log(`✓ ${ingresos.length} ingresos`);

  console.log("Insertando gastos...");
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: "Gastos!A:M",
    valueInputOption: "USER_ENTERED", requestBody: { values: gastos },
  });
  console.log(`✓ ${gastos.length} gastos`);

  console.log("Insertando saldos reales...");
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: "SaldosReales!A:D",
    valueInputOption: "USER_ENTERED", requestBody: { values: saldosReales },
  });
  console.log(`✓ ${saldosReales.length} saldos reales`);

  console.log("\nListo. Datos cargados en Google Sheets.");
}

seed().catch(console.error);
