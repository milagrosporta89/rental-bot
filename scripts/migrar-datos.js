// Migración one-time: lee datos del sheet viejo (por mes) y los escribe en el nuevo (por tipo).
// Correr primero con: node scripts/migrar-datos.js --dry-run
// Cuando todo se vea bien:  node scripts/migrar-datos.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { google } = require('googleapis');

const OLD_SHEET_ID = '1sPSZartllr-cVOgXcnE7_1xyRoxHd1ciImWCbuacWh8';
const NEW_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const DRY_RUN = process.argv.includes('--dry-run');

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const MES_NUM = {
  ENERO:'01', FEBRERO:'02', MARZO:'03', ABRIL:'04', MAYO:'05', JUNIO:'06',
  JULIO:'07', AGOSTO:'08', SEPTIEMBRE:'09', OCTUBRE:'10', NOVIEMBRE:'11', DICIEMBRE:'12',
};

// CUENTA → casa (opción 2: primera casa de cada titular)
const CUENTA_CASA = {
  FRAN: 'Casa 1', FRANCISCO: 'Casa 1',
  MILAGROS: 'Casa 3',
  FER: 'Casa 1',   // Fernando no tiene casa en el nuevo sistema — aproximado
  PAO: 'Casa 3',   // ídem Paola
  PAOLA: 'Casa 3',
  EFVTO: 'Casa 1', // efectivo, default
};

const CUENTA_TITULAR = {
  FRAN: 'Francisco', FRANCISCO: 'Francisco',
  MILAGROS: 'Milagros',
  FER: 'Fernando',
  PAO: 'Paola', PAOLA: 'Paola',
  EFVTO: 'Francisco',
};

function inferirCategoria(concepto) {
  const c = concepto.toUpperCase().trim();
  if (c.includes('LIMPIEZA'))                              return 'limpieza';
  if (c.includes('JARDIN'))                               return 'jardinero';
  if (c.includes('LAVAND'))                               return 'lavanderia';
  if (c.includes('EXPENSA'))                              return 'expensas';
  if (/^LUZ\b/.test(c))                                   return 'luz';
  if (/^GAS\b/.test(c))                                   return 'gas';
  if (c.includes('MANTEN') || c.includes('REPAR'))        return 'mantenimiento';
  if (c.includes('INTERNET'))                             return 'internet';
  if (c.includes('MARKET') || c.includes('COMUNITY') || c.includes('COMUNIT')) return 'marketing';
  if (c.includes('IMPUEST'))                              return 'impuestos';
  if (c.includes('COMI'))                                 return 'comision';
  return 'otro';
}

function parsear(v) {
  if (!v || String(v).trim() === '' || String(v).includes('#')) return 0;
  const s = String(v).trim();
  // "1.234,56" → 1234.56 | "1234.56" → 1234.56
  return s.includes(',')
    ? parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
    : parseFloat(s) || 0;
}

function formatFecha(dia, mesNombre) {
  const d = String(dia ?? '').trim();
  if (!d) return null;
  const m = MES_NUM[mesNombre.toUpperCase()];
  if (!m) return null;
  return `${d.padStart(2, '0')}/${m}/2026`;
}

let seq = 0;
function genId(prefix) {
  return `${prefix}-MIG-${Date.now()}-${++seq}`;
}

function fechaATimestamp(fecha) {
  const [d, m, y] = fecha.split('/');
  return new Date(+y, +m - 1, +d).getTime();
}

// Devuelve la cotización más cercana en fecha para una fila sin cotización.
function cotizacionCercana(fecha, tablaCotizaciones) {
  if (tablaCotizaciones.length === 0) return 0;
  const ts = fechaATimestamp(fecha);
  let mejor = tablaCotizaciones[0];
  let menorDiff = Math.abs(ts - mejor.ts);
  for (const entry of tablaCotizaciones) {
    const diff = Math.abs(ts - entry.ts);
    if (diff < menorDiff) { menorDiff = diff; mejor = entry; }
  }
  return mejor.cotizacion;
}

async function migrar() {
  console.log(DRY_RUN ? '🔍 DRY RUN — no se escribe nada\n' : '🚀 Migrando datos...\n');

  const meta = await sheets.spreadsheets.get({ spreadsheetId: OLD_SHEET_ID });
  const hojas = (meta.data.sheets ?? []).map(s => s.properties?.title).filter(Boolean);

  // Primer pase: recolectar todas las cotizaciones disponibles
  const todasLasCotizaciones = [];
  const rawPorHoja = {};

  for (const hoja of hojas) {
    const mesNum = MES_NUM[hoja.toUpperCase()];
    if (!mesNum) continue;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: OLD_SHEET_ID,
      range: `${hoja}!A:K`,
    });
    const filas = (res.data.values ?? []).slice(1);
    rawPorHoja[hoja] = filas;
    for (const fila of filas) {
      const [DIA, , , , T_CAMBIO] = fila;
      const fecha = formatFecha(DIA, hoja);
      if (!fecha) continue;
      const cot = parsear(T_CAMBIO);
      if (cot > 0) todasLasCotizaciones.push({ ts: fechaATimestamp(fecha), cotizacion: cot });
    }
  }

  todasLasCotizaciones.sort((a, b) => a.ts - b.ts);

  const ingresos = [];
  const gastos   = [];

  for (const hoja of hojas) {
    const mesNum = MES_NUM[hoja.toUpperCase()];
    if (!mesNum) { console.log(`Saltando "${hoja}" (no es un mes)`); continue; }

    const filas = rawPorHoja[hoja] ?? [];
    console.log(`${hoja}: ${filas.length} filas`);

    for (const fila of filas) {
      const [DIA, CONCEPTO, INGRESOS_ARS, GASTOS_ARS, T_CAMBIO, USD_ING, USD_GAS, CUENTA] = fila;

      const fecha = formatFecha(DIA, hoja);
      if (!fecha) continue;

      const concepto = String(CONCEPTO ?? '').trim();
      const cuenta   = String(CUENTA ?? '').trim().toUpperCase();
      const ingARS   = parsear(INGRESOS_ARS);
      const gasARS   = parsear(GASTOS_ARS);
      const ingUSD   = parsear(USD_ING);
      const gasUSD   = parsear(USD_GAS);
      const esComPao = concepto.toUpperCase().includes('COMI PAO');

      // Cotización: la de la fila o la más cercana disponible
      const cotizacion = parsear(T_CAMBIO) || cotizacionCercana(fecha, todasLasCotizaciones);

      // ── INGRESO ────────────────────────────────────────────────────
      if (ingARS > 0 || ingUSD > 0) {
        const enUSD  = ingARS === 0 && ingUSD > 0;
        const moneda = enUSD ? 'USD' : 'ARS';
        const monto  = enUSD ? ingUSD : ingARS;
        const mARS   = enUSD ? +(monto * cotizacion).toFixed(2) : monto;
        const mUSD   = enUSD ? monto  : ingUSD > 0 ? ingUSD : +(monto / cotizacion).toFixed(2);
        const casa   = CUENTA_CASA[cuenta] ?? 'Casa 1';
        const dest   = CUENTA_TITULAR[cuenta] ?? 'Francisco';
        const tipo   = cuenta === 'EFVTO' ? 'efectivo' : 'transferencia';

        ingresos.push([
          genId('ING'), fecha, casa, monto, moneda, tipo,
          concepto,    // quienPago = nombre pasajero
          dest,        // nombreDestinatario = titular
          '',          // bancoDestino
          '',          // nroOperacion
          `Migrado de ${hoja}`,
          'Mili Porta',
          '',          // comprobanteUrl
          new Date().toISOString(),
          cotizacion,
          mARS, mUSD,
          '',          // idReserva (sin reserva)
          'directo',   // tipoMovimiento
        ]);
      }

      // ── GASTO ──────────────────────────────────────────────────────
      const esGastoNormal = gasARS > 0;
      const esComPaoUSD   = esComPao && gasARS === 0 && gasUSD > 0;

      if (esGastoNormal || esComPaoUSD) {
        const moneda    = esComPaoUSD ? 'USD' : 'ARS';
        const monto     = esComPaoUSD ? gasUSD : gasARS;
        const pagadoPor = esComPao ? 'Fernando' : (CUENTA_TITULAR[cuenta] ?? 'Fernando');
        const categoria = inferirCategoria(concepto);
        const mARS      = esComPaoUSD ? +(monto * cotizacion).toFixed(2) : monto;
        const mUSD      = esComPaoUSD ? monto  : gasUSD > 0 ? gasUSD : +(monto / cotizacion).toFixed(2);
        const bancoOrigen = cuenta === 'EFVTO' ? 'Efectivo' : '';

        gastos.push([
          genId('GAS'), fecha, monto, moneda, categoria,
          pagadoPor,
          '',          // nombreDestinatario
          bancoOrigen,
          '',          // nroOperacion
          concepto,    // detalle
          'Mili Porta',
          '',          // comprobanteUrl
          new Date().toISOString(),
          cotizacion,
          mARS, mUSD,
        ]);
      }
    }
  }

  console.log(`\n── Resumen ──────────────────────────────`);
  console.log(`  Ingresos: ${ingresos.length}`);
  console.log(`  Gastos:   ${gastos.length}`);

  if (DRY_RUN) {
    console.log('\n── Muestra ingresos ─────────────────────');
    const HEADERS_ING = ['id','fecha','casa','monto','moneda','tipo','quienPago','nombreDest','banco','nroOp','detalle','registradoPor','comprobante','timestamp','cotizacion','montoARS','montoUSD','idReserva','tipoMov'];
    ingresos.slice(0, 5).forEach(r => {
      const obj = Object.fromEntries(HEADERS_ING.map((h, i) => [h, r[i]]));
      console.log(' ', JSON.stringify(obj));
    });
    console.log('\n── Muestra gastos ───────────────────────');
    const HEADERS_GAS = ['id','fecha','monto','moneda','categoria','pagadoPor','nombreDest','banco','nroOp','detalle','registradoPor','comprobante','timestamp','cotizacion','montoARS','montoUSD'];
    gastos.slice(0, 5).forEach(r => {
      const obj = Object.fromEntries(HEADERS_GAS.map((h, i) => [h, r[i]]));
      console.log(' ', JSON.stringify(obj));
    });
    return;
  }

  if (ingresos.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: NEW_SHEET_ID,
      range: 'Ingresos!A:S',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: ingresos },
    });
    console.log(`✅ ${ingresos.length} ingresos escritos`);
  }

  if (gastos.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: NEW_SHEET_ID,
      range: 'Gastos!A:P',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: gastos },
    });
    console.log(`✅ ${gastos.length} gastos escritos`);
  }

  console.log('\n✅ Migración completa');
}

migrar().catch(console.error);
