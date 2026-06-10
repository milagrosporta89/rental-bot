// Pobla todas las tablas con datos de prueba consistentes entre sí.
// Cubre: reservas en distintos estados, ingresos por transferencia/efectivo/Airbnb,
// gastos en ARS/USD, comisiones históricas, saldos reales y reembolsos.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { google } = require('googleapis');

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const ID = process.env.GOOGLE_SHEET_ID;

const COTIZ_MAY = 1350;
const COTIZ_JUN = 1464;

// ── Helpers ────────────────────────────────────────────────────────────────

function ars(usd, cotiz) { return Math.round(usd * cotiz); }
function usd(a, cotiz)   { return Math.round((a / cotiz) * 100) / 100; }
function ingId(n)  { return `ING-SEED-${String(n).padStart(3,'0')}`; }
function gasId(n)  { return `GAS-SEED-${String(n).padStart(3,'0')}`; }

// ── RESERVAS ───────────────────────────────────────────────────────────────
// Columnas: id | fechaRegistro | casa | titular | nombrePax | cantPax | noches |
//           fechaEntrada | fechaSalida | totalUSD | adelantoARS | adelantoUSD | saldoUSD |
//           estadoPago | comprobanteUrl | registradoPor | timestamp | cotizacion | plataforma

const RESERVAS = [
  // ── Semana actual (10/06–16/06) ──────────────────────────────────────────

  // #1 · ARS advance · saldo pendiente · casa Milagros
  [ '1','09/06/2026','Casa 3','Milagros','García María',     4, 5,
    '10/06/2026','15/06/2026', 800, ars(400,COTIZ_JUN), 400, 400,
    'ADELANTO_RECIBIDO','','seed','09/06/2026 10:00',COTIZ_JUN,'whatsapp_directo'],

  // #2 · USD advance · saldo pendiente · casa Francisco
  [ '2','09/06/2026','Casa 1','Francisco','López Juan',      2, 3,
    '12/06/2026','15/06/2026', 500, ars(200,COTIZ_JUN), 200, 300,
    'ADELANTO_RECIBIDO','','seed','09/06/2026 10:01',COTIZ_JUN,'whatsapp_directo'],

  // #3 · ARS advance · reserva PRÓXIMA semana · solo aparece en búsqueda nombre
  [ '3','09/06/2026','Casa 2','Francisco','Rodríguez Ana',   3, 7,
    '16/06/2026','23/06/2026', 1200, ars(300,COTIZ_JUN), 300, 900,
    'ADELANTO_RECIBIDO','','seed','09/06/2026 10:02',COTIZ_JUN,'whatsapp_directo'],

  // #4 · COMPLETO · check-in semana actual · no debe aparecer en pendientes
  [ '4','05/06/2026','Casa 4','Milagros','Fernández Carlos', 2, 4,
    '11/06/2026','15/06/2026', 600, ars(200,COTIZ_JUN), 200, 0,
    'COMPLETO','','seed','05/06/2026 09:00',COTIZ_JUN,'whatsapp_directo'],

  // #5 · SALDO_RECIBIDO (pago parcial) · check-in semana pasada
  [ '5','01/06/2026','Casa 5','Inés','García Roberto',       5, 6,
    '02/06/2026','08/06/2026', 900, ars(300,COTIZ_JUN), 300, 300,
    'SALDO_RECIBIDO','','seed','01/06/2026 08:00',COTIZ_JUN,'whatsapp_directo'],

  // #6 · USD advance · saldo pendiente grande · semana actual
  [ '6','09/06/2026','Casa 5','Inés','García Sofía',         6, 5,
    '13/06/2026','18/06/2026', 1000, ars(250,COTIZ_JUN), 250, 750,
    'ADELANTO_RECIBIDO','','seed','09/06/2026 10:05',COTIZ_JUN,'whatsapp_directo'],

  // #7 · Registrado en mayo · check-in fin de junio · solo búsqueda nombre
  [ '7','15/05/2026','Casa 3','Milagros','Martínez Laura',   2, 7,
    '25/06/2026','02/07/2026', 700, ars(350,COTIZ_MAY), 350, 350,
    'ADELANTO_RECIBIDO','','seed','15/05/2026 14:00',COTIZ_MAY,'whatsapp_directo'],

  // #8 · COMPLETO · estancia semana pasada
  [ '8','28/05/2026','Casa 4','Milagros','Sánchez Pedro',    4, 6,
    '01/06/2026','07/06/2026', 550, ars(250,COTIZ_MAY), 250, 0,
    'COMPLETO','','seed','28/05/2026 11:00',COTIZ_MAY,'whatsapp_directo'],
];

// ── INGRESOS ───────────────────────────────────────────────────────────────
// Columnas: id | fecha | casa | monto | moneda | tipo | quienPago | nombreDestinatario |
//           bancoOrigen | nroOperacion | detalle | registradoPor | comprobanteUrl |
//           timestamp | cotizacion | monto_ars | monto_usd | plataforma

// Función para calcular monto_ars y monto_usd según moneda
function ingRow(n, fecha, casa, monto, moneda, tipo, quienPago, dest, banco, nroOp, detalle, cotiz, plataforma='whatsapp_directo') {
  const monto_ars = moneda === 'USD' ? ars(monto, cotiz) : monto;
  const monto_usd = moneda === 'ARS' ? usd(monto, cotiz) : monto;
  return [ingId(n), fecha, casa, monto, moneda, tipo, quienPago, dest, banco, nroOp,
          detalle, 'seed', '', `${fecha} 10:00`, cotiz, monto_ars, monto_usd, plataforma];
}

const INGRESOS = [
  // ── Mayo 2026 ─────────────────────────────────────────────────────────────

  // Airbnb mayo (no ligados a reserva, pero entran al cálculo de comisión de Paola)
  ingRow( 1,'15/05/2026','Casa 1', 94500,'ARS','transferencia','Airbnb Payments','Francisco','','','Liquidación Airbnb mayo · Casa 1',COTIZ_MAY,'Airbnb'),
  ingRow( 2,'15/05/2026','Casa 2', 121500,'ARS','transferencia','Airbnb Payments','Francisco','','','Liquidación Airbnb mayo · Casa 2',COTIZ_MAY,'Airbnb'),
  ingRow( 3,'20/05/2026','Casa 5', 189000,'ARS','transferencia','Airbnb Payments','Inés','','','Liquidación Airbnb mayo · Casa 5',COTIZ_MAY,'Airbnb'),

  // Adelanto reserva #7 (Martínez Laura) registrada en mayo
  ingRow( 4,'15/05/2026','Casa 3', ars(350,COTIZ_MAY),'ARS','transferencia','Martínez Laura','Milagros Porta','Galicia','8821',`Adelanto reserva #7 · whatsapp_directo`,COTIZ_MAY),

  // Adelanto reserva #8 (Sánchez Pedro) registrada en mayo
  ingRow( 5,'28/05/2026','Casa 4', ars(250,COTIZ_MAY),'ARS','transferencia','Sánchez Pedro','Milagros Porta','BBVA','3340',`Adelanto reserva #8 · whatsapp_directo`,COTIZ_MAY),

  // ── Junio 2026 ────────────────────────────────────────────────────────────

  // Adelanto reserva #5 (García Roberto)
  ingRow( 6,'01/06/2026','Casa 5', ars(300,COTIZ_JUN),'ARS','transferencia','García Roberto','Inés Porta','Santander','9102',`Adelanto reserva #5 · whatsapp_directo`,COTIZ_JUN),

  // Saldo parcial reserva #5 (García Roberto — paga 300 USD de 600 pendientes)
  ingRow( 7,'04/06/2026','Casa 5', ars(300,COTIZ_JUN),'ARS','transferencia','García Roberto','Inés Porta','Santander','9215',`Saldo reserva #5 · whatsapp_directo`,COTIZ_JUN),

  // Saldo completo reserva #8 (Sánchez Pedro — paga 300 USD restantes)
  ingRow( 8,'01/06/2026','Casa 4', ars(300,COTIZ_JUN),'ARS','efectivo','Sánchez Pedro','Milagros Porta','','',`Saldo reserva #8 · whatsapp_directo`,COTIZ_JUN),

  // Adelanto reserva #4 (Fernández Carlos)
  ingRow( 9,'05/06/2026','Casa 4', ars(200,COTIZ_JUN),'ARS','transferencia','Fernández Carlos','Milagros Porta','Nación','5571',`Adelanto reserva #4 · whatsapp_directo`,COTIZ_JUN),

  // Saldo completo reserva #4 (Fernández Carlos — paga 400 USD)
  ingRow(10,'08/06/2026','Casa 4', 400,'USD','efectivo','Fernández Carlos','Milagros Porta','','',`Saldo reserva #4 · whatsapp_directo`,COTIZ_JUN),

  // Adelantos del 09/06 (registros de hoy)
  ingRow(11,'09/06/2026','Casa 3', ars(400,COTIZ_JUN),'ARS','transferencia','García María','Milagros Porta','ICBC','4414',`Adelanto reserva #1 · whatsapp_directo`,COTIZ_JUN),
  ingRow(12,'09/06/2026','Casa 1', ars(200,COTIZ_JUN),'ARS','transferencia','López Juan','Francisco Porta','Brubank','7710',`Adelanto reserva #2 · whatsapp_directo`,COTIZ_JUN),
  ingRow(13,'09/06/2026','Casa 2', ars(300,COTIZ_JUN),'ARS','transferencia','Rodríguez Ana','Francisco Porta','Uala','2293',`Adelanto reserva #3 · whatsapp_directo`,COTIZ_JUN),
  ingRow(14,'09/06/2026','Casa 5', ars(250,COTIZ_JUN),'ARS','transferencia','García Sofía','Inés Porta','Mercado Pago','6601',`Adelanto reserva #6 · whatsapp_directo`,COTIZ_JUN),

  // Airbnb junio
  ingRow(15,'10/06/2026','Casa 1', 150,'USD','transferencia','Airbnb Payments','Francisco Porta','','','Liquidación Airbnb junio · Casa 1',COTIZ_JUN,'Airbnb'),
  ingRow(16,'10/06/2026','Casa 2', 95,'USD','transferencia','Airbnb Payments','Francisco Porta','','','Liquidación Airbnb junio · Casa 2',COTIZ_JUN,'Airbnb'),

  // Ingreso directo (no reserva) — cobro a huésped en efectivo fuera de plataforma
  ingRow(17,'07/06/2026','Casa 3', 50000,'ARS','efectivo','visitante ocasional','Milagros Porta','','','Ingreso directo · sin reserva',COTIZ_JUN),
];

// ── GASTOS ─────────────────────────────────────────────────────────────────
// Columnas: id | fecha | monto | moneda | categoria | pagadoPor | nombreDestinatario |
//           bancoOrigen | nroOperacion | detalle | registradoPor | comprobanteUrl |
//           timestamp | cotizacion | monto_ars | monto_usd

function gasRow(n, fecha, monto, moneda, cat, pagadoPor, dest, nroOp, detalle, cotiz) {
  const monto_ars = moneda === 'USD' ? ars(monto, cotiz) : monto;
  const monto_usd = moneda === 'ARS' ? usd(monto, cotiz) : monto;
  return [gasId(n), fecha, monto, moneda, cat, pagadoPor, dest, '', nroOp, detalle,
          'seed', '', `${fecha} 10:00`, cotiz, monto_ars, monto_usd];
}

const GASTOS = [
  gasRow( 1,'10/05/2026',  45000,'ARS','limpieza',   'Milagros', 'Servicio limpieza', '', 'Limpieza post check-out Casa 3',   COTIZ_MAY),
  gasRow( 2,'15/05/2026',  85000,'ARS','reparacion', 'Francisco','Plomero',            '', 'Pérdida de agua baño Casa 1',      COTIZ_MAY),
  gasRow( 3,'20/05/2026', 120000,'ARS','reparacion', 'Inés',     'Electricista',       '', 'Instalación AC Casa 5',            COTIZ_MAY),
  gasRow( 4,'25/05/2026',  35000,'ARS','limpieza',   'Francisco','Servicio limpieza',  '', 'Limpieza general Casa 2',          COTIZ_MAY),
  gasRow( 5,'01/06/2026', 200000,'ARS','reparacion', 'Milagros', 'Pinturería Norte',   '', 'Pintura living Casa 4',            COTIZ_JUN),
  gasRow( 6,'05/06/2026',     80,'USD','suministros','Francisco','Ferretería',         '', 'Herramientas y materiales Casa 1', COTIZ_JUN),
  gasRow( 7,'08/06/2026',  75000,'ARS','limpieza',   'Inés',     'Servicio limpieza',  '', 'Limpieza pos-estancia Casa 5',     COTIZ_JUN),
  gasRow( 8,'09/06/2026',  55000,'ARS','impuestos',  'Milagros', 'AFIP',               '', 'ABL trimestral Casa 3 y Casa 4',   COTIZ_JUN),
];

// ── COMISIONES ─────────────────────────────────────────────────────────────
// Columnas: mes | monto | tipo | descripcion | timestamp | cotizacion

const COMISIONES = [
  ['2026-04',  85000,'cobro','Comisión abril 2026',        '30/04/2026 17:00', COTIZ_MAY],
  ['2026-04', -12000,'gasto','Gastos Paola abril',          '30/04/2026 17:01', COTIZ_MAY],
  ['2026-05', 112500,'cobro','Comisión mayo 2026',          '31/05/2026 18:00', COTIZ_MAY],
  ['2026-05', -18000,'gasto','Limpieza + materiales mayo',  '31/05/2026 18:01', COTIZ_MAY],
  ['2026-06',  45000,'cobro','Anticipo comisión junio',     '05/06/2026 12:00', COTIZ_JUN],
  ['2026-06', -8000, 'gasto','Material limpieza junio',     '08/06/2026 10:00', COTIZ_JUN],
];

// ── SALDOS REALES ──────────────────────────────────────────────────────────
// Columnas: fecha | titular | monto | timestamp

const SALDOS = [
  ['01/05/2026','Francisco', 1250000, '01/05/2026 09:00'],
  ['01/05/2026','Milagros',   850000, '01/05/2026 09:01'],
  ['01/05/2026','Inés',       620000, '01/05/2026 09:02'],
  ['01/06/2026','Francisco', 1480000, '01/06/2026 09:00'],
  ['01/06/2026','Milagros',   920000, '01/06/2026 09:01'],
  ['01/06/2026','Inés',       750000, '01/06/2026 09:02'],
];

// ── REEMBOLSOS PAOLA ───────────────────────────────────────────────────────
// Columnas: fecha | monto | descripcion | timestamp

const REEMBOLSOS = [
  ['10/05/2026', 15000, 'Limpieza extra Casa 3 pagada por Paola',   '10/05/2026 16:00'],
  ['25/05/2026',  8000, 'Materiales baño Casa 1',                   '25/05/2026 11:00'],
  ['03/06/2026', 22000, 'Plomero urgente Casa 5 fin de semana',     '03/06/2026 20:00'],
];

// ── Runner ─────────────────────────────────────────────────────────────────

async function limpiarYCargar(tab, rango, datos) {
  await sheets.spreadsheets.values.clear({ spreadsheetId: ID, range: `${tab}!A2:Z` });
  await sheets.spreadsheets.values.append({
    spreadsheetId: ID,
    range: `${tab}!A2`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: datos },
  });
  console.log(`✓ ${tab.padEnd(16)} ${datos.length} filas`);
}

async function run() {
  await limpiarYCargar('Reservas',       'A2:S', RESERVAS);
  await limpiarYCargar('Ingresos',       'A2:R', INGRESOS);
  await limpiarYCargar('Gastos',         'A2:P', GASTOS);
  await limpiarYCargar('Comisiones',     'A2:F', COMISIONES);
  await limpiarYCargar('SaldosReales',   'A2:D', SALDOS);
  await limpiarYCargar('ReembolsosPaola','A2:D', REEMBOLSOS);

  console.log('\n📋 Casos de prueba disponibles:');
  console.log('  Reservas semana actual:');
  console.log('    #1 · Casa 3 · García María    — adelanto ARS, saldo 400 USD');
  console.log('    #2 · Casa 1 · López Juan       — adelanto USD, saldo 300 USD');
  console.log('    #4 · Casa 4 · Fernández Carlos — COMPLETA (no debe aparecer)');
  console.log('    #6 · Casa 5 · García Sofía     — adelanto USD, saldo 750 USD');
  console.log('  Reservas solo en búsqueda por nombre:');
  console.log('    #3 · Casa 2 · Rodríguez Ana    — check-in 16/06 (próxima semana)');
  console.log('    #5 · Casa 5 · García Roberto   — SALDO_RECIBIDO (pago parcial)');
  console.log('    #7 · Casa 3 · Martínez Laura   — check-in 25/06');
  console.log('    #8 · Casa 4 · Sánchez Pedro    — COMPLETA, estancia pasada');
  console.log('  Búsqueda "garcía" → #1, #5, #6 (3 resultados)');
  console.log('  Ingresos: mayo (Airbnb + adelantos) + junio (adelantos + saldos + Airbnb)');
  console.log('  Comisión Paola: base = ingresos mayo → debe calcular 15%');
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
